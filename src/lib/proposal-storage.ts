import "server-only";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { getSupabase } from "./supabase";
import {
  THEME_BUCKET,
  THEME_SIGNED_TTL,
  THEME_THUMB_BUCKET,
  caminhoDoRefDeTema,
  ehRefDeTema,
  separarRefs,
} from "./theme-ref";
import { log } from "./logger";

/**
 * Storage for proposal mood-board / cover images, backed by a private Supabase
 * Storage bucket. Uploads return a stable `path` (persisted on the proposal so
 * it can be re-edited) plus a long-lived signed `url` for the admin preview.
 * The PDF generator never touches Storage directly — the generate route resolves
 * every path to bytes via `fetchProposalImageBytes` before rendering, keeping
 * the generator storage-agnostic.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The bucket is created on
 * first use (idempotent), so no manual Supabase setup step is needed.
 */
export const PROPOSAL_BUCKET = "proposal-assets";

// 10-year signed URLs — effectively permanent for the admin's own preview use;
// the bucket stays private so nothing is publicly enumerable.
const SIGNED_TTL = 60 * 60 * 24 * 365 * 10;

let bucketReady = false;

/**
 * Limites gravados NO PRÓPRIO BUCKET (não só na rota).
 *
 * Enquanto todos os bytes passavam por uma função nossa, era a rota que
 * recusava um ficheiro grande ou de formato errado. Com carregamento DIRETO
 * (ver `createProposalUploadTickets`) o navegador escreve no Storage sem nos
 * passar pela frente — e então o único sítio onde uma regra ainda se aplica é
 * o bucket. É isto que limita o estrago de um URL de carregamento roubado: com
 * ele não se consegue escrever um executável, nem um ficheiro de 2 GB.
 */
export const UPLOAD_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const BUCKET_FILE_SIZE_LIMIT = 12 * 1024 * 1024; // 12 MB, como a rota

/**
 * Aplica os limites acima a um bucket que já existia (instalações anteriores a
 * esta mudança foram criadas sem eles). Melhor esforço declarado: um Storage
 * antigo pode nem ter `updateBucket`, e não conseguir apertar os limites não
 * pode deitar abaixo um carregamento — apenas deixa o bucket como estava, que
 * é exatamente o que é hoje.
 */
async function hardenBucket(bucket: string): Promise<void> {
  const sb = getSupabase();
  const update = sb?.storage?.updateBucket;
  if (!sb || typeof update !== "function") return;
  try {
    const { error } = await sb.storage.updateBucket(bucket, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error)
      log.warn("storage: limites do bucket não aplicados", { bucket, erro: error.message });
  } catch (e) {
    log.warn("storage: limites do bucket não aplicados", { bucket, erro: String(e) });
  }
}

/**
 * Exported so the theme→proposal copy (`copyThemeImageToProposal`) can make
 * sure the destination bucket exists once per batch before Storage copies
 * into it — that path never calls `uploadProposalImage`, so nothing else
 * would create it.
 */
export async function ensureBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (bucketReady) return true;
  const { data } = await sb.storage.getBucket(PROPOSAL_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(PROPOSAL_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    // Ignore "already exists" races; surface anything else.
    if (error && !/exist/i.test(error.message)) {
      log.error("proposal-storage: createBucket falhou", error);
      return false;
    }
  } else {
    // Já existia: aperta os limites uma vez por processo, sem bloquear nada.
    await hardenBucket(PROPOSAL_BUCKET);
  }
  bucketReady = true;
  return true;
}

/**
 * Validade de um bilhete de carregamento. NÃO é uma escolha nossa: o Supabase
 * emite estes tokens com 2 horas fixas e não expõe parâmetro para encurtar.
 * Está aqui declarado para que o número apareça na resposta da rota (e no
 * relatório de segurança) em vez de ficar implícito.
 */
export const UPLOAD_TICKET_TTL = 60 * 60 * 2;

/** Teto de bilhetes por pedido — ver `createProposalUploadTickets`. */
export const MAX_UPLOAD_TICKETS = 24;

/** Um bilhete: UM caminho, construído no servidor, e o token que o abre. */
export interface UploadTicket {
  /** O caminho dentro do bucket. É o que o cliente devolve na confirmação. */
  path: string;
  /** URL completo de escrita (PUT direto), já com o token. */
  uploadUrl: string;
  /** O mesmo token à parte, para quem use `uploadToSignedUrl` do supabase-js. */
  token: string;
}

/**
 * O Storage sabe emitir URLs de carregamento? Um Supabase mais antigo (ou um
 * duplo de teste) pode não ter esta API — e nesse caso a resposta certa é
 * "não", para a rota mandar o cliente pelo caminho multipart de sempre.
 */
function canMintUploadUrls(sb: NonNullable<ReturnType<typeof getSupabase>>): boolean {
  return typeof sb.storage.from(PROPOSAL_BUCKET).createSignedUploadUrl === "function";
}

/**
 * Emite bilhetes de carregamento DIRETO para a pasta de um pedido.
 *
 * O caminho é construído aqui, no servidor — `<quoteId>/<uuid>.<ext>` —, nunca
 * aceite do cliente: é a mesma regra que `uploadProposalImage` já seguia, e é
 * ela que garante que um cliente não consegue escrever na pasta de outro
 * pedido. O cliente só recebe um URL que abre EXATAMENTE esse caminho.
 *
 * `upsert` fica em `false` de propósito: o bilhete cria um objeto novo num
 * caminho aleatório que mais ninguém conhece e não consegue substituir nada
 * que já lá esteja.
 *
 * Devolve `null` quando o Storage não sabe emitir estes URLs — a rota traduz
 * isso em "usa o multipart", e nada quebra.
 */
export async function createProposalUploadTickets(
  quoteId: string,
  contentTypes: readonly string[],
): Promise<UploadTicket[] | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return null;
  if (!canMintUploadUrls(sb)) return null;
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeId) return null;
  const wanted = contentTypes.slice(0, MAX_UPLOAD_TICKETS);
  if (wanted.length === 0) return [];

  try {
    const tickets = await Promise.all(
      wanted.map(async (type) => {
        const path = `${safeId}/${randomUUID()}.${extFor(type)}`;
        const { data, error } = await sb.storage
          .from(PROPOSAL_BUCKET)
          .createSignedUploadUrl(path, { upsert: false });
        if (error || !data) return null;
        return { path, uploadUrl: data.signedUrl, token: data.token };
      }),
    );
    // Ou se emitem todos, ou nenhum: meia dúzia de bilhetes com buracos punha
    // o cliente a adivinhar quais podia usar.
    if (tickets.some((t) => t === null)) return null;
    return tickets as UploadTicket[];
  } catch (e) {
    log.error("proposal-storage: emissão de URLs de carregamento falhou", e, { quoteId });
    return null;
  }
}

/**
 * Quantos bytes bastam para ler o CABEÇALHO de uma imagem. O IHDR de um PNG
 * está nos primeiros 33 bytes, o VP8X de um WEBP nos primeiros 30, e o SOF de
 * um JPEG normal aparece bem dentro dos primeiros KB. 256 KB é folga a mais
 * sem deixar de ser desprezável ao pé dos 3 MB da foto.
 */
const HEADER_BYTES = 256 * 1024;

/**
 * Teto de pixéis, o mesmo que a rota multipart já aplicava.
 *
 * Um teto de BYTES não chega: um PNG minúsculo pode descodificar para
 * gigapixéis, e quem paga isso é o gerador do PDF, mais tarde, com a memória
 * toda. Enquanto os bytes passavam por nós, a rota via a imagem e recusava-a.
 * Com carregamento direto ninguém a vê — por isso a verificação mudou de sítio
 * (passou a ser feita na CONFIRMAÇÃO), não desapareceu.
 */
export const MAX_IMAGE_PIXELS = 50_000_000;

/**
 * Lê só o início de um objeto do Storage. Pede um `Range` e, se o servidor o
 * ignorar, corta na mesma ao fim de `HEADER_BYTES` — nunca puxa a foto toda
 * para a função, que era exatamente o custo que este desenho veio eliminar.
 */
async function fetchHeader(bucket: string, path: string): Promise<Buffer | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data } = await sb.storage.from(bucket).createSignedUrl(path, 60);
    if (!data?.signedUrl) return null;
    const res = await fetch(data.signedUrl, {
      headers: { Range: `bytes=0-${HEADER_BYTES - 1}` },
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok || !res.body) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = res.body.getReader();
    while (total < HEADER_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    await reader.cancel().catch(() => {});
    return Buffer.concat(chunks.map((c) => Buffer.from(c)));
  } catch (e) {
    log.warn("storage: cabeçalho não lido", { bucket, path, erro: String(e) });
    return null;
  }
}

/**
 * Uma foto acabada de escrever no Storage tem dimensões aceitáveis?
 *
 * `ok: false` quer dizer "apaga-a": ou não está lá, ou não é uma imagem que
 * consigamos ler, ou é uma bomba de descompressão. Nunca lança.
 */
export async function inspectStoredImage(
  bucket: string,
  path: string,
): Promise<{ ok: boolean; reason: string }> {
  const head = await fetchHeader(bucket, path);
  if (!head || head.byteLength === 0) return { ok: false, reason: "ilegivel" };
  try {
    const meta = await sharp(head).metadata();
    const pixels = (meta.width ?? 0) * (meta.height ?? 0);
    if (!pixels) return { ok: false, reason: "sem-dimensoes" };
    if (pixels > MAX_IMAGE_PIXELS) return { ok: false, reason: "dimensoes-excessivas" };
    return { ok: true, reason: "" };
  } catch {
    return { ok: false, reason: "formato-invalido" };
  }
}

/** Apaga um objeto — usado quando a confirmação o recusa. Melhor esforço. */
export async function removeStoredObject(bucket: string, path: string): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  try {
    await sb.storage.from(bucket).remove([path]);
  } catch (e) {
    log.warn("storage: objeto recusado não foi apagado", { bucket, path, erro: String(e) });
  }
}

/** O caminho é `<pasta>/<ficheiro>.<ext>`, sem travessia de diretórios? */
export function isProposalPath(ref: unknown, quoteId: string): ref is string {
  if (typeof ref !== "string") return false;
  if (!/^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(ref)) return false;
  return ref.slice(0, ref.indexOf("/")) === quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
}

/**
 * Confirma fotos escritas DIRETAMENTE no bucket: verifica cada uma, apaga as
 * que não passam, e devolve as boas já assinadas para o estúdio as mostrar.
 *
 * Não é um índice: não guarda nada em lado nenhum. Lê o objeto que o cliente
 * diz ter escrito, no caminho que NÓS emitimos, e assina-o — a pasta continua
 * a ser a única fonte de verdade, e um cliente que não confirme nada apenas
 * verá as fotos na próxima listagem.
 */
export async function confirmProposalUploads(
  quoteId: string,
  paths: readonly string[],
): Promise<{ images: UploadedImage[]; rejected: string[] }> {
  const sb = getSupabase();
  const images: UploadedImage[] = [];
  const rejected: string[] = [];
  if (!sb) return { images, rejected: [...paths] };

  // O caminho vem do cliente: só se aceita um que pertença a ESTE pedido.
  const mine = paths.filter((p) => isProposalPath(p, quoteId));
  for (const p of paths) if (!mine.includes(p)) rejected.push(p);

  const checked = await Promise.all(
    mine.map(async (path) => ({ path, verdict: await inspectStoredImage(PROPOSAL_BUCKET, path) })),
  );
  const good: string[] = [];
  for (const { path, verdict } of checked) {
    if (verdict.ok) {
      good.push(path);
      continue;
    }
    log.warn("proposal-storage: foto recusada na confirmação", { path, motivo: verdict.reason });
    rejected.push(path);
    await removeStoredObject(PROPOSAL_BUCKET, path);
  }
  if (good.length === 0) return { images, rejected };

  try {
    const { data } = await sb.storage.from(PROPOSAL_BUCKET).createSignedUrls(good, SIGNED_TTL);
    for (const s of data ?? []) {
      if (s.path && s.signedUrl) images.push({ path: s.path, url: s.signedUrl });
    }
  } catch (e) {
    log.error("proposal-storage: assinatura pós-confirmação falhou", e, { quoteId });
  }
  return { images, rejected };
}

function extFor(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

export interface UploadedImage {
  path: string;
  url: string;
  /**
   * URL da miniatura, quando existe. As fotos carregadas antes das miniaturas
   * existirem não têm nenhuma — e é por isso que é opcional em vez de "" : quem
   * desenha distingue "não há" de "há e está vazia", e cai para o original.
   */
  thumbUrl?: string;
}

/** Upload one image (bytes) for a quote; returns its storage path + signed URL. */
export async function uploadProposalImage(
  quoteId: string,
  bytes: Buffer,
  contentType: string,
): Promise<UploadedImage | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return null;
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${safeId}/${randomUUID()}.${extFor(contentType)}`;
  const { error } = await sb.storage
    .from(PROPOSAL_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) {
    log.error("proposal-storage: upload falhou", error, { quoteId });
    return null;
  }
  const { data } = await sb.storage.from(PROPOSAL_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return { path, url: data?.signedUrl ?? "" };
}

/**
 * List every image already uploaded for a quote, newest first, each with a fresh
 * signed URL. The bucket folder (`${quoteId}/…`) is the device-independent index
 * of what the studio has stored for this pedido, so the studio can re-offer those
 * images on ANY device (a localStorage draft is per-browser and lost elsewhere).
 * Returns [] when Storage is unavailable — never throws.
 */
export async function listProposalImages(quoteId: string): Promise<UploadedImage[]> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return [];
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  try {
    const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).list(safeId, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data) return [];
    // Only real files (Storage can report folder placeholders with no id).
    const paths = data
      .filter((o) => o.id && !o.name.startsWith("."))
      .map((o) => `${safeId}/${o.name}`);
    if (paths.length === 0) return [];
    const { data: signed } = await sb.storage
      .from(PROPOSAL_BUCKET)
      .createSignedUrls(paths, SIGNED_TTL);
    const imagens = (signed ?? [])
      .map((s) => ({ path: s.path ?? "", url: s.signedUrl ?? "" }))
      .filter((im) => im.path && im.url);
    // As miniaturas EM LOTE, num só pedido: assinar uma de cada vez seria uma
    // ida ao servidor por célula antes de a primeira imagem sequer começar a
    // descarregar. Sem miniaturas nesta instalação, o mapa vem vazio e cada
    // célula fica com o original — o comportamento de hoje.
    const miniaturas = await signProposalThumbs(imagens.map((im) => im.path));
    return imagens.map((im) => {
      const thumbUrl = miniaturas.get(im.path);
      return thumbUrl ? { ...im, thumbUrl } : im;
    });
  } catch (e) {
    log.error("proposal-storage: list falhou", e, { quoteId });
    return [];
  }
}

// Hard cap on a single fetched image, so a hostile/huge URL can't buffer an
// unbounded response into memory during a PDF render.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

// The only legitimate source of a REMOTE image URL in a proposal doc is a
// Supabase Storage signed URL, so remote fetches are restricted to that host.
// This is an anti-SSRF allow-list: without it, a URL stored in a doc (authored
// in the back office) could point the server at an internal/metadata address
// (e.g. 169.254.169.254) or another intranet service.
function allowedRemoteHost(): string | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Resolve an image reference to raw bytes for embedding in the PDF. Accepts a
 * bucket storage path, a full http(s) URL, or a base64 (optionally data:-URI)
 * string — so the generator input can mix stored images and inline uploads.
 */
export async function fetchProposalImageBytes(ref: string): Promise<Buffer | null> {
  const bytes = await fetchProposalImageBytesInner(ref);
  if (!bytes) {
    // PORQUÊ REGISTAR ISTO.
    //
    // Todos os caminhos de falha aqui devolviam `null` em silêncio, e quem
    // desenha o PDF salta a foto que não resolve. O resultado é uma proposta a
    // seguir para o cliente com fotografias a menos e NINGUÉM a saber: nem a
    // Catarina, nem os registos do servidor. Foi assim que isto apareceu, com
    // ela a abrir o PDF e a dar pela falta.
    //
    // O `kind` diz onde procurar sem expor o caminho todo: um caminho de bucket
    // que falha é outro problema (permissões, ficheiro apagado) de um URL que
    // falha (assinatura expirada, anfitrião errado).
    // Uma foto da BIBLIOTECA que não resolve tem uma causa própria e uma
    // resolução própria (foi apagada de um tema, apesar da salvaguarda do
    // `theme-materializar`), por isso não pode ficar misturada com as fotos da
    // pasta do pedido nos registos.
    const kind = ref.startsWith("data:")
      ? "data-uri"
      : /^https?:\/\//i.test(ref)
        ? "url"
        : ehRefDeTema(ref)
          ? "biblioteca-de-temas"
          : "caminho-do-bucket";
    log.warn("proposal-storage: imagem não resolveu, vai FALTAR no PDF", {
      kind,
      ref: ref.slice(0, 120),
    });
  }
  return bytes;
}

async function fetchProposalImageBytesInner(ref: string): Promise<Buffer | null> {
  if (!ref) return null;
  // Inline base64 / data URI.
  if (ref.startsWith("data:") || (!ref.includes("/") && ref.length > 128)) {
    try {
      const raw = ref.includes(",") ? ref.slice(ref.indexOf(",") + 1) : ref;
      return Buffer.from(raw, "base64");
    } catch {
      return null;
    }
  }
  // Absolute URL (e.g. a Supabase signed URL). SSRF guard: only https, only the
  // configured Supabase Storage host, no following redirects, a request timeout,
  // and a hard size cap.
  if (/^https?:\/\//i.test(ref)) {
    let parsed: URL;
    try {
      parsed = new URL(ref);
    } catch {
      return null;
    }
    const allowedHost = allowedRemoteHost();
    if (parsed.protocol !== "https:" || !allowedHost || parsed.host !== allowedHost) {
      log.error("proposal-storage: remote image host não permitido (SSRF guard)", null, {
        host: parsed.host,
      });
      return null;
    }
    try {
      const res = await fetch(ref, { redirect: "error", signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const declared = Number(res.headers.get("content-length") ?? "0");
      if (declared && declared > MAX_IMAGE_BYTES) return null;
      const buf = Buffer.from(await res.arrayBuffer());
      if (buf.byteLength > MAX_IMAGE_BYTES) return null;
      return buf;
    } catch {
      return null;
    }
  }
  const sb = getSupabase();
  if (!sb) return null;
  // Uma foto da Biblioteca de Temas, referenciada em vez de copiada. O bucket é
  // outro; tudo o resto — o `download`, os bytes, o que o gerador faz a seguir —
  // é igual. `ehRefDeTema` já validou a forma do caminho, portanto o que chega
  // ao Storage nunca é uma travessia.
  if (ehRefDeTema(ref)) {
    try {
      const { data, error } = await sb.storage.from(THEME_BUCKET).download(caminhoDoRefDeTema(ref));
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    } catch {
      return null;
    }
  }
  // Bucket storage path.
  try {
    const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).download(ref);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}

// ── Miniaturas ─────────────────────────────────────────────────────────────
/**
 * Bucket das miniaturas das fotos das propostas.
 *
 * O desenho é o mesmo que a Biblioteca de Temas já usa e que está provado:
 * **bucket paralelo, MESMA chave**. A miniatura de
 * `proposal-assets/<pedido>/<uuid>.jpg` é `proposal-thumbs/<pedido>/<uuid>.jpg`.
 *
 * Sem índice para manter, sem coluna nova na base de dados: o caminho do
 * original É o caminho da miniatura. E, o que mais importa, uma miniatura em
 * falta cai sozinha para o original — as fotos carregadas antes disto existir
 * continuam a funcionar sem migração obrigatória.
 *
 * Porquê isto: medido em IMAGES-BEFORE.md, a grelha do estúdio puxava 1130 KB
 * por célula para desenhar 174 px. A miniatura pesa ~30–60 KB, e é o browser
 * que já a fabrica na mesma descodificação que faz para encolher o original.
 */
export const PROPOSAL_THUMB_BUCKET = "proposal-thumbs";

let thumbBucketReady = false;

/**
 * Garante o bucket das miniaturas. SÓ QUEM ESCREVE chama isto: ler ou assinar
 * miniaturas nunca o cria, para uma instalação antiga (sem miniatura nenhuma)
 * não pagar uma chamada por leitura.
 */
async function ensureThumbBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (thumbBucketReady) return true;
  const { data } = await sb.storage.getBucket(PROPOSAL_THUMB_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(PROPOSAL_THUMB_BUCKET, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error && !/exist/i.test(error.message)) {
      log.warn("proposal-storage: createBucket das miniaturas falhou", { erro: error.message });
      return false;
    }
  }
  thumbBucketReady = true;
  return true;
}

/**
 * Guarda a miniatura de uma foto, na MESMA chave do original mas no bucket das
 * miniaturas.
 *
 * Melhor esforço do princípio ao fim, e é deliberado: a miniatura é derivada e
 * descartável, e a foto boa já está guardada quando isto corre. Falhar aqui
 * deixa a foto sem miniatura — a grelha cai para o original, que é o
 * comportamento de hoje — e NUNCA faz falhar um carregamento.
 */
export async function uploadProposalThumb(
  path: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const sb = getSupabase();
  if (!sb || !path) return "";
  try {
    if (!(await ensureThumbBucket())) return "";
    const { error } = await sb.storage
      .from(PROPOSAL_THUMB_BUCKET)
      .upload(path, bytes, { contentType, upsert: true });
    if (error) {
      log.warn("proposal-storage: miniatura não guardada", { path, erro: error.message });
      return "";
    }
    const { data } = await sb.storage.from(PROPOSAL_THUMB_BUCKET).createSignedUrl(path, SIGNED_TTL);
    return data?.signedUrl ?? "";
  } catch (e) {
    log.warn("proposal-storage: miniatura não guardada", { path, erro: String(e) });
    return "";
  }
}

/**
 * URL assinado da miniatura de cada caminho, EM LOTE.
 *
 * Em lote e não um a um: são até 24 células numa grelha, e assinar uma de cada
 * vez é uma ida ao servidor por célula antes de a primeira imagem sequer
 * começar a descarregar. Caminhos sem miniatura simplesmente não aparecem no
 * mapa — quem chama cai para o original.
 *
 * Nunca cria o bucket e nunca lança: numa instalação sem miniatura nenhuma
 * devolve um mapa vazio, e a grelha comporta-se como hoje.
 */
/**
 * Assina VÁRIOS originais da pasta de uma proposta num só pedido.
 *
 * O gémeo de `signProposalThumbs`, para o bucket dos originais. Existe pela
 * mesma razão: assinar um a um é uma ida ao servidor POR FOTO, e a importação
 * da Biblioteca de Temas fazia exactamente isso — quatro idas por foto, das
 * quais duas eram assinaturas.
 */
/**
 * Assina um lote contra UM bucket. `silencioso` para as derivadas: uma
 * instalação sem miniaturas devolve um mapa vazio e a grelha cai para o
 * original — isso é o comportamento normal, não um erro para os registos.
 */
async function assinarLote(
  bucket: string,
  paths: string[],
  silencioso: boolean,
  ttl: number,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const sb = getSupabase();
  if (!sb || paths.length === 0) return out;
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, ttl);
    if (error && !silencioso)
      log.error("proposal-storage: assinatura em lote falhou", error, { bucket, n: paths.length });
    for (const row of data ?? []) {
      if (row?.path && row.signedUrl) out.set(row.path, row.signedUrl);
    }
  } catch (e) {
    if (!silencioso)
      log.error("proposal-storage: assinatura em lote falhou", e, { bucket, n: paths.length });
  }
  return out;
}

/**
 * Assina uma lista de referências de documento **contra o bucket certo para
 * cada uma**, e devolve o mapa com a chave ORIGINAL.
 *
 * As duas famílias e porquê estão juntas: um mood board pode ter fotos
 * carregadas à mão (`<pedido>/<uuid>.jpg`, no bucket da proposta) misturadas
 * com fotos escolhidas da Biblioteca (`tema:<pasta>/<x>.jpg`, no bucket dos
 * temas). Quem desenha a grelha não devia ter de saber a diferença — passa a
 * lista toda e recebe um URL por referência.
 *
 * São dois pedidos, um por bucket, EM PARALELO — e não um pedido por foto. Com
 * um lote só de proposta (o caso de hoje) o segundo pedido nem chega a existir,
 * portanto isto custa exactamente o mesmo que custava.
 *
 * A chave do mapa é a referência tal como está no documento, `tema:` incluído.
 * O Storage devolve o caminho SEM prefixo, por isso é aqui que ele volta a ser
 * posto — se fosse omitido, quem chama procuraria pela chave que tem e não
 * encontrava nada.
 *
 * Cada bucket com o SEU prazo. A pasta de um pedido assina a 10 anos porque é
 * a pré-visualização dela própria; a biblioteca assina a 6 horas
 * ({@link THEME_SIGNED_TTL}) porque é o activo do estúdio inteiro. Assinar um
 * `tema:` com o prazo das propostas passaria calado e desfazia essa decisão.
 */
async function assinarRefs(
  refs: string[],
  bucketDaProposta: string,
  bucketDoTema: string,
  silencioso: boolean,
): Promise<Map<string, string>> {
  const { daBiblioteca, daProposta } = separarRefs(refs);
  const [proprias, deTema] = await Promise.all([
    assinarLote(bucketDaProposta, daProposta, silencioso, SIGNED_TTL),
    assinarLote(bucketDoTema, daBiblioteca.map(caminhoDoRefDeTema), silencioso, THEME_SIGNED_TTL),
  ]);
  for (const ref of daBiblioteca) {
    const url = deTema.get(caminhoDoRefDeTema(ref));
    if (url) proprias.set(ref, url);
  }
  return proprias;
}

export async function signProposalPaths(paths: string[]): Promise<Map<string, string>> {
  return assinarRefs(paths, PROPOSAL_BUCKET, THEME_BUCKET, false);
}

export async function signProposalThumbs(paths: string[]): Promise<Map<string, string>> {
  return assinarRefs(paths, PROPOSAL_THUMB_BUCKET, THEME_THUMB_BUCKET, true);
}

/**
 * COPIAR AS FOTOS DE UMA PROPOSTA PARA OUTRO PEDIDO.
 *
 * ── Porque é que não basta copiar os caminhos ─────────────────────────────
 * Os caminhos das fotos vivem debaixo do pedido a que pertencem
 * (`{quoteId}/{uuid}.jpg` — ver {@link isProposalPath}). Quando ela cria uma
 * proposta "a partir de" outra, copiar o caminho tal e qual deixaria a
 * proposta NOVA a apontar para a pasta do pedido ANTIGO. Enquanto ninguém
 * mexer no antigo ninguém dá por nada; no dia em que esse pedido for apagado,
 * a proposta nova — provavelmente já enviada — fica sem imagens, em silêncio.
 *
 * ── Porquê `copy` e não descarregar e voltar a carregar ───────────────────
 * `storage.copy()` é feita DENTRO do Supabase: os bytes nunca atravessam esta
 * função. Trinta fotos de mood board são trinta chamadas curtas em vez de
 * trinta descarregamentos e trinta carregamentos. O recurso de descarregar
 * existe, mas fica atrás de um aviso nos registos — se aparecer a sério, é ele
 * que explica porque é que de repente tudo ficou lento.
 *
 * Devolve o mapa `caminho antigo → caminho novo`. O que falhar não aparece no
 * mapa: quem chama mantém o caminho antigo (a proposta continua a funcionar,
 * acoplada à antiga) em vez de ficar com um buraco onde estava uma foto.
 */
export async function duplicarFotosParaPedido(
  caminhos: readonly string[],
  quoteIdDestino: string,
): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const sb = getSupabase();
  const destino = quoteIdDestino.replace(/[^a-zA-Z0-9_-]/g, "");
  // Só caminhos do Storage. Uma imagem embutida (`data:`) viaja no documento e
  // não tem nada para copiar.
  //
  // Uma referência à Biblioteca (`tema:…`) também não: ela NÃO vive debaixo do
  // pedido, e é precisamente por isso que o problema descrito acima não lhe
  // toca. Copiar o caminho tal e qual é aqui a resposta certa — ela não aparece
  // no mapa, quem chama mantém a referência, e duplicar uma proposta cheia de
  // fotos da biblioteca passa a não custar chamada nenhuma ao Storage.
  const validos = [
    ...new Set(
      caminhos.filter(
        (p) => typeof p === "string" && p && !p.startsWith("data:") && !ehRefDeTema(p),
      ),
    ),
  ];
  if (!sb || !destino || validos.length === 0) return mapa;
  if (!(await ensureBucket())) return mapa;

  const extDe = (p: string) => {
    const m = /\.([a-zA-Z0-9]+)$/.exec(p);
    return m ? m[1].toLowerCase() : "jpg";
  };

  // O mesmo tecto do import da biblioteca, e pela mesma razão: sem ele, uma
  // proposta com quarenta fotos abre oitenta ligações ao Storage de uma vez.
  const EM_PARALELO = 8;
  for (let i = 0; i < validos.length; i += EM_PARALELO) {
    const lote = validos.slice(i, i + EM_PARALELO);
    await Promise.all(
      lote.map(async (origem) => {
        const novo = `${destino}/${randomUUID()}.${extDe(origem)}`;
        try {
          const { error } = await sb.storage.from(PROPOSAL_BUCKET).copy(origem, novo);
          if (error) {
            log.warn("proposal-storage: cópia da foto falhou", { origem, erro: error.message });
            return;
          }
        } catch (e) {
          log.error("proposal-storage: cópia da foto rebentou", e, { origem });
          return;
        }
        mapa.set(origem, novo);
        // A miniatura é melhor esforço: sem ela a grelha cai para o original,
        // que é feio mas funciona. Falhar aqui não pode perder a foto.
        try {
          await sb.storage.from(PROPOSAL_THUMB_BUCKET).copy(origem, novo);
        } catch {
          /* a foto entra na mesma */
        }
      }),
    );
  }
  return mapa;
}
