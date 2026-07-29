import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import {
  PROPOSAL_BUCKET,
  uploadProposalImage,
  ensureBucket as ensureProposalBucket,
  inspectStoredImage,
  removeStoredObject,
  UPLOAD_MIME_TYPES,
  BUCKET_FILE_SIZE_LIMIT,
  MAX_UPLOAD_TICKETS,
  type UploadTicket,
} from "./proposal-storage";
import { log } from "./logger";
import type { ThemeImage, ThemeImagePage } from "./theme-types";
import { THEME_PAGE_SIZE, MAX_THEME_PAGE_SIZE } from "./theme-types";

/**
 * Storage das fotos da Biblioteca de Temas, num bucket PRIVADO de Supabase
 * Storage separado do das propostas: `theme-assets`, uma pasta por tema
 * (`<themeId>/<uuid>.jpg`).
 *
 * Porquê um bucket próprio: as fotos de um tema são um ativo do estúdio,
 * reutilizado em muitas propostas, e não devem ser apagadas quando um pedido
 * é limpo. Quando a equipa escolhe fotos de um tema para uma proposta, os
 * bytes são COPIADOS para a pasta da proposta (ver a rota
 * `/api/orcamento/[id]/assets/importar`) — assim tudo o que já existe a
 * jusante (gerador de PDF, portal do cliente, pré-visualização) continua a
 * lidar com um único bucket, e apagar/renovar um tema nunca estraga uma
 * proposta já enviada.
 *
 * Requer SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. O bucket é criado no
 * primeiro uso (idempotente), tal como o das propostas.
 */
export const THEME_BUCKET = "theme-assets";

/**
 * Bucket das MINIATURAS, também privado. Chave idêntica à do original: a
 * miniatura de `theme-assets/<tema>/<uuid>.jpg` é
 * `theme-thumbs/<tema>/<uuid>.jpg` — sem índice nenhum a manter, o caminho do
 * original é o caminho da miniatura.
 *
 * São DERIVADAS e DESCARTÁVEIS: a listagem faz-se sempre sobre `theme-assets`,
 * uma miniatura em falta cai para o original (as fotos anteriores às
 * miniaturas não têm nenhuma) e falhar a limpeza das miniaturas NUNCA impede
 * apagar uma foto ou um tema. São geradas no NAVEGADOR, a partir do mesmo
 * bitmap já descodificado para comprimir o original — não há aqui `sharp` nem
 * transformações pagas do Supabase.
 */
export const THEME_THUMB_BUCKET = "theme-thumbs";

/**
 * Validade dos URLs assinados da biblioteca: 6 horas.
 *
 * Eram 10 anos. Num bucket com milhares de fotos isso é um empréstimo
 * permanente: cada URL que escapa (um print, um log, o histórico do
 * navegador) fica a servir a foto para sempre, e são milhares deles. 6 horas
 * cobrem folgadamente a sessão de trabalho mais longa — as rotas assinam de
 * novo a cada pedido, e nada do lado do cliente guarda URLs (só o id do
 * último tema usado), por isso encurtar não custa nada a quem trabalha.
 * Prolongar a validade também não ajudava a cache do navegador: o token muda
 * a cada assinatura, logo o URL muda na mesma.
 */
export const SIGNED_TTL = 60 * 60 * 6;

/**
 * A cópia tema → proposta assina no bucket DAS PROPOSTAS, e esse URL é
 * guardado no documento da proposta. Tem de durar o que dura o de uma foto
 * carregada à mão no estúdio (`proposal-storage`: 10 anos), senão uma foto
 * vinda da biblioteca deixava de aparecer numa proposta antiga e a outra não.
 */
const PROPOSAL_COPY_TTL = 60 * 60 * 24 * 365 * 10;

/** Fotos pedidas de uma vez ao Storage (limite por página da listagem). */
const PAGE = 500;

/** Página usada quando só se está a CONTAR (não se assina nada, logo pode ser
 *  maior: menos idas ao Storage para o mesmo total). */
const COUNT_PAGE = 1000;

/** Teto de páginas a contar — 20 × 1000 = 20 000 fotos. Acima disto o total
 *  devolvido é um mínimo (`truncated`), em vez de a rota andar a passear pela
 *  pasta sem fim. */
const MAX_COUNT_PAGES = 20;

/** Teto de páginas ao esvaziar uma pasta — 40 × 500 = 20 000 fotos. */
const MAX_DELETE_PAGES = 40;

/**
 * Memo por bucket da verificação "existe?" — ver `ensureBucket`. Um `Map`
 * porque são dois buckets (fotos e miniaturas) com ciclos de vida diferentes:
 * o das miniaturas só nasce no primeiro carregamento com miniatura.
 */
const ready = new Map<string, Promise<boolean>>();

/**
 * O erro do Storage diz mesmo "não existe"? Só um 404 justifica criar o
 * bucket; confundir uma avaria de rede com "bucket em falta" faz-nos criar às
 * cegas e, pior, dar a avaria por resolvida.
 */
function isNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: unknown; statusCode?: unknown; message?: unknown };
  if (e.status === 404 || e.statusCode === 404 || e.statusCode === "404") return true;
  return typeof e.message === "string" && /not found|does not exist/i.test(e.message);
}

/**
 * Aplica a um bucket já existente os limites que travam um URL de
 * carregamento roubado (formatos aceites + tamanho máximo). Melhor esforço
 * declarado: um Storage sem `updateBucket` deixa o bucket como está — que é
 * exatamente como está hoje —, nunca faz falhar um carregamento.
 */
async function hardenBucket(bucket: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || typeof sb.storage.updateBucket !== "function") return;
  try {
    const { error } = await sb.storage.updateBucket(bucket, {
      public: false,
      fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
      allowedMimeTypes: UPLOAD_MIME_TYPES,
    });
    if (error) {
      log.warn("theme-storage: limites do bucket não aplicados", {
        bucket,
        erro: error.message,
      });
    }
  } catch (e) {
    log.warn("theme-storage: limites do bucket não aplicados", { bucket, erro: String(e) });
  }
}

/**
 * Garante um bucket, uma vez por processo e por bucket. Memoiza a PROMESSA (e
 * não um booleano): vários pedidos em paralelo — a lista de temas faz um por
 * tema — partilham a mesma verificação em vez de dispararem
 * getBucket/createBucket ao mesmo tempo. Numa falha o memo é limpo, para que
 * uma indisponibilidade passageira não fique marcada para sempre.
 *
 * Só quem ESCREVE chama isto. Ler, assinar ou apagar miniaturas nunca cria o
 * bucket das miniaturas: numa instalação antiga (sem miniatura nenhuma) essas
 * operações falham em silêncio e cai-se para o original — criar o bucket ali
 * seria trabalho e ruído sem nada lá dentro.
 */
async function ensureBucket(bucket: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  let pending = ready.get(bucket);
  if (!pending) {
    const attempt = (async () => {
      const { data, error } = await sb.storage.getBucket(bucket);
      if (data) {
        // Já existia: aperta os limites (formato + tamanho) uma vez por
        // processo. Com carregamento DIRETO é aqui, e só aqui, que uma regra
        // ainda se aplica — a rota deixou de ver os bytes.
        await hardenBucket(bucket);
        return true;
      }
      if (error && !isNotFound(error)) {
        log.error("theme-storage: getBucket falhou", error, { bucket });
        return false;
      }
      const { error: createError } = await sb.storage.createBucket(bucket, {
        public: false,
        fileSizeLimit: BUCKET_FILE_SIZE_LIMIT,
        allowedMimeTypes: UPLOAD_MIME_TYPES,
      });
      // Ignora corridas "already exists"; qualquer outro erro é reportado.
      if (createError && !/exist/i.test(createError.message)) {
        log.error("theme-storage: createBucket falhou", createError, { bucket });
        return false;
      }
      return true;
    })();
    pending = attempt.then(
      (ok) => {
        if (!ok) ready.delete(bucket);
        return ok;
      },
      (err) => {
        ready.delete(bucket);
        log.error("theme-storage: ensureBucket falhou", err, { bucket });
        return false;
      },
    );
    ready.set(bucket, pending);
  }
  return pending;
}

/** Nome de pasta seguro para um tema (o id nunca deve escapar da sua pasta). */
export function themeFolder(themeId: string): string {
  return themeId.replace(/[^a-zA-Z0-9_-]/g, "");
}

function extFor(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

/** Content-type inferido da extensão de um caminho do bucket. */
export function contentTypeForPath(path: string): string {
  if (/\.png$/i.test(path)) return "image/png";
  if (/\.webp$/i.test(path)) return "image/webp";
  return "image/jpeg";
}

/**
 * Um caminho `<pasta>/<ficheiro>.<ext>` dentro do bucket de temas, sem
 * travessia de diretórios. Usado para validar caminhos vindos do cliente
 * (importação para uma proposta, remoção de uma foto) antes de tocar no
 * Storage — pura, testada à parte.
 */
export function isThemePath(ref: unknown): ref is string {
  return typeof ref === "string" && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(ref);
}

/** A pasta (id do tema) a que um caminho pertence; "" se o caminho for inválido. */
export function themeIdOfPath(ref: string): string {
  return isThemePath(ref) ? ref.slice(0, ref.indexOf("/")) : "";
}

/** A miniatura que acompanha uma foto no carregamento (feita no navegador). */
export interface ThemeThumbInput {
  bytes: Buffer;
  contentType: string;
}

/**
 * Carrega a miniatura de uma foto, NA MESMA CHAVE do original mas no bucket
 * das miniaturas, e devolve o URL assinado (ou "" se algo correu mal).
 *
 * Melhor esforço do princípio ao fim: a miniatura é derivada e descartável, e
 * a foto boa já está guardada — falhar aqui deixa a foto sem miniatura (a
 * grelha mostra o original), nunca deita o carregamento abaixo.
 *
 * O content-type gravado é o da MINIATURA, que pode não corresponder à
 * extensão da chave (um PNG grande vira uma miniatura JPEG). É de propósito: a
 * chave tem de ser idêntica à do original para se poder derivar uma da outra
 * sem índice, e quem serve o ficheiro vai pelo content-type, não pelo nome.
 */
async function uploadThemeThumb(path: string, thumb: ThemeThumbInput): Promise<string> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path)) return "";
  try {
    if (!(await ensureBucket(THEME_THUMB_BUCKET))) return "";
    const { error } = await sb.storage
      .from(THEME_THUMB_BUCKET)
      .upload(path, thumb.bytes, { contentType: thumb.contentType, upsert: true });
    if (error) {
      log.warn("theme-storage: miniatura não guardada", { path, erro: error.message });
      return "";
    }
    const { data } = await sb.storage.from(THEME_THUMB_BUCKET).createSignedUrl(path, SIGNED_TTL);
    return data?.signedUrl ?? "";
  } catch (e) {
    log.warn("theme-storage: miniatura não guardada", { path, erro: String(e) });
    return "";
  }
}

/**
 * Carrega uma foto (bytes) para a pasta de um tema, com a sua miniatura
 * quando o cliente a enviou.
 */
export async function uploadThemeImage(
  themeId: string,
  bytes: Buffer,
  contentType: string,
  thumb?: ThemeThumbInput,
): Promise<ThemeImage | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return null;
  const folder = themeFolder(themeId);
  if (!folder) return null;
  const path = `${folder}/${randomUUID()}.${extFor(contentType)}`;
  const { error } = await sb.storage
    .from(THEME_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) {
    log.error("theme-storage: upload falhou", error, { themeId });
    return null;
  }
  invalidateThemeCount(themeId);
  const [{ data }, thumbUrl] = await Promise.all([
    sb.storage.from(THEME_BUCKET).createSignedUrl(path, SIGNED_TTL),
    thumb ? uploadThemeThumb(path, thumb) : Promise.resolve(""),
  ]);
  return { path, url: data?.signedUrl ?? "", ...(thumbUrl ? { thumbUrl } : {}) };
}

/**
 * CARREGAMENTO DIRETO — um bilhete por foto.
 *
 * Hoje cada foto atravessa a rede DUAS vezes: navegador → função → Storage. A
 * função tem de receber o multipart inteiro em memória antes de poder reenviar
 * um único byte, e é por isso que existe o teto de ~4,5 MB por pedido. Um
 * bilhete troca isso por um URL que o navegador usa para escrever DIRETAMENTE
 * no bucket.
 *
 * O que o bilhete NÃO é: uma autorização geral. O caminho é construído aqui —
 * `<pasta do tema>/<uuid>.<ext>` — e nunca aceite do cliente. Cada bilhete
 * abre exatamente UM caminho, `upsert: false` impede-o de substituir seja o
 * que for, e os limites do bucket (`hardenBucket`) travam o formato e o
 * tamanho do que lá pode entrar.
 *
 * A miniatura leva bilhete próprio, com a MESMA chave no bucket das
 * miniaturas — a regra "o caminho do original é o caminho da miniatura"
 * mantém-se, e continua a não haver índice nenhum a manter.
 */
export interface ThemeUploadTicket {
  /** O caminho no bucket dos temas. É por aqui que a confirmação identifica a foto. */
  path: string;
  /** Bilhete para o ORIGINAL (bucket `theme-assets`). */
  original: UploadTicket;
  /** Bilhete para a MINIATURA (bucket `theme-thumbs`), ou `null` quando não foi
   *  possível emitir — a foto sobe na mesma e a grelha cai para o original,
   *  exatamente como faz com as fotos anteriores às miniaturas. */
  thumb: UploadTicket | null;
}

/** O Storage desta instalação sabe emitir URLs de carregamento? Um Supabase
 *  mais antigo não sabe — e aí a rota manda o cliente pelo multipart. */
function canMintUploadUrls(sb: NonNullable<ReturnType<typeof getSupabase>>): boolean {
  return typeof sb.storage.from(THEME_BUCKET).createSignedUploadUrl === "function";
}

async function mintOne(bucket: string, path: string): Promise<UploadTicket | null> {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage
      .from(bucket)
      .createSignedUploadUrl(path, { upsert: false });
    if (error || !data) return null;
    return { path, uploadUrl: data.signedUrl, token: data.token };
  } catch {
    return null;
  }
}

/**
 * Emite bilhetes para carregar fotos DIRETAMENTE na pasta de um tema.
 *
 * `contentTypes` só decide a EXTENSÃO do caminho — nunca o destino. Um tipo
 * que não reconheçamos vira `.jpg`, e o que o bucket aceita de facto é
 * decidido pelos limites do bucket, não por esta lista.
 *
 * Devolve `null` quando esta instalação não sabe emitir URLs de carregamento:
 * a rota traduz isso em "usa o multipart de sempre", e nada quebra.
 */
export async function createThemeUploadTickets(
  themeId: string,
  contentTypes: readonly string[],
): Promise<ThemeUploadTicket[] | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return null;
  if (!canMintUploadUrls(sb)) return null;
  const folder = themeFolder(themeId);
  if (!folder) return null;
  const wanted = contentTypes.slice(0, MAX_UPLOAD_TICKETS);
  if (wanted.length === 0) return [];

  // O bucket das miniaturas pode ainda não existir (instalação antiga). Só se
  // pedem bilhetes de miniatura se ele estiver mesmo lá — falhar a criá-lo
  // deixa as fotos sem miniatura, nunca impede o carregamento.
  const thumbsReady = await ensureBucket(THEME_THUMB_BUCKET);

  const tickets = await Promise.all(
    wanted.map(async (type) => {
      const path = `${folder}/${randomUUID()}.${extFor(type)}`;
      const [original, thumb] = await Promise.all([
        mintOne(THEME_BUCKET, path),
        thumbsReady ? mintOne(THEME_THUMB_BUCKET, path) : Promise.resolve(null),
      ]);
      return original ? { path, original, thumb } : null;
    }),
  );
  // Ou saem todos, ou nenhum: bilhetes com buracos punham o cliente a
  // adivinhar quais podia usar, e é mais barato cair para o multipart.
  if (tickets.some((t) => t === null)) {
    log.warn("theme-storage: emissão de bilhetes incompleta", { themeId });
    return null;
  }
  return tickets as ThemeUploadTicket[];
}

/**
 * Confirma as fotos que o navegador escreveu no bucket.
 *
 * Porquê uma confirmação e não só relistar: a pasta CONTINUA a ser a fonte de
 * verdade — nada aqui é gravado, e um carregamento que nunca seja confirmado
 * aparece na mesma na listagem seguinte. O que a confirmação faz, e a
 * listagem não pode fazer, é OLHAR PARA A IMAGEM. Enquanto os bytes passavam
 * pela função, era ela que recusava um ficheiro com dimensões absurdas antes
 * de o guardar; com escrita direta ninguém o vê. A verificação mudou de
 * lugar, não desapareceu — e lê só o cabeçalho, uns KB, para não trazer de
 * volta a travessia que este desenho veio eliminar.
 *
 * O que não passa é APAGADO e devolvido em `rejected`, para o estúdio poder
 * dizer quais falharam. Nunca lança.
 */
export async function confirmThemeUploads(
  themeId: string,
  paths: readonly string[],
): Promise<{ images: ThemeImage[]; rejected: string[] }> {
  const folder = themeFolder(themeId);
  const rejected: string[] = [];
  if (!getSupabase() || !folder) return { images: [], rejected: [...paths] };

  // O caminho vem do cliente: só se aceita um ficheiro DENTRO da pasta deste
  // tema — nunca de outro tema, nunca com travessia de diretórios.
  const mine: string[] = [];
  for (const p of paths) {
    if (isThemePath(p) && themeIdOfPath(p) === folder) mine.push(p);
    else rejected.push(p);
  }

  const checked = await Promise.all(
    mine.map(async (path) => ({ path, verdict: await inspectStoredImage(THEME_BUCKET, path) })),
  );
  const good: string[] = [];
  for (const { path, verdict } of checked) {
    if (verdict.ok) {
      good.push(path);
      continue;
    }
    log.warn("theme-storage: foto recusada na confirmação", { path, motivo: verdict.reason });
    rejected.push(path);
    // Sai o original E a miniatura: uma miniatura órfã de uma foto recusada é
    // lixo que a grelha nunca mostraria e que ninguém voltaria a limpar.
    await Promise.all([
      removeStoredObject(THEME_BUCKET, path),
      removeStoredObject(THEME_THUMB_BUCKET, path),
    ]);
  }
  // A pasta mudou: a contagem guardada deixou de valer.
  invalidateThemeCount(themeId);
  if (good.length === 0) return { images: [], rejected };

  const [urls, thumbs] = await Promise.all([signThemePaths(good), signThemeThumbs(good)]);
  const images: ThemeImage[] = good
    .map((path) => {
      const thumbUrl = thumbs.get(path);
      return { path, url: urls.get(path) ?? "", ...(thumbUrl ? { thumbUrl } : {}) };
    })
    .filter((im) => im.url);
  return { images, rejected };
}

/** O conteúdo (cru) da pasta de um tema — ver `listThemeFiles`. */
export interface ThemeFileList {
  /** Nomes dos ficheiros DENTRO da pasta (sem o prefixo da pasta). */
  names: string[];
  /** A pasta foi mesmo lida. `false` = Storage em baixo, NÃO "pasta vazia". */
  ok: boolean;
  /** A página veio cheia: há (provavelmente) mais fotos do que estas. */
  truncated: boolean;
}

/**
 * Lista a pasta de um tema SEM assinar nada. É a primitiva barata: assinar
 * URLs é o passo caro, e quem só precisa de contar fotos (a lista de temas)
 * ou de as apagar não tem de os pedir.
 *
 * A distinção que interessa é `ok`: uma pasta ilegível devolve `ok: false`, e
 * quem chama tem de a mostrar como "fotos indisponíveis" — nunca como "0
 * fotos", que a equipa leria como "as minhas fotos desapareceram". Nunca lança.
 */
export async function listThemeFiles(
  themeId: string,
  limit = PAGE,
  offset = 0,
): Promise<ThemeFileList> {
  const unreadable: ThemeFileList = { names: [], ok: false, truncated: false };
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return unreadable;
  const folder = themeFolder(themeId);
  // Sem pasta segura não há nada que possamos afirmar sobre o conteúdo.
  if (!folder) return unreadable;
  try {
    const { data, error } = await sb.storage.from(THEME_BUCKET).list(folder, {
      limit,
      offset,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data) {
      log.error("theme-storage: list falhou", error, { themeId });
      return unreadable;
    }
    // Só ficheiros reais (o Storage devolve marcadores de pasta sem id).
    const names = data.filter((o) => o.id && !o.name.startsWith(".")).map((o) => o.name);
    // O limite é contado sobre a página CRUA: uma página cheia de marcadores
    // continua a significar "há mais para trás".
    return { names, ok: true, truncated: data.length >= limit };
  } catch (e) {
    log.error("theme-storage: list falhou", e, { themeId });
    return unreadable;
  }
}

/** Conta as fotos de uma pasta — ver `countThemeFiles`. */
export interface ThemeFileCount {
  /** Fotos contadas. Com `truncated`, é um MÍNIMO. */
  total: number;
  /** A pasta foi mesmo lida até ao fim (ou até ao teto). */
  ok: boolean;
  /** Bateu no teto de páginas: há mais fotos do que as contadas. */
  truncated: boolean;
}

/**
 * Conta as fotos de um tema percorrendo a pasta por páginas, SEM assinar nada.
 *
 * Não há API de contagem no Storage do Supabase (a tabela `storage.objects`
 * não está exposta ao PostgREST), por isso contar é mesmo listar: 1 ida ao
 * Storage por cada `COUNT_PAGE` ficheiros. Com 5000 fotos são 5 idas, só com
 * metadados — o passo caro, assinar, não acontece aqui.
 *
 * `maxPages` é o orçamento de quem chama: a grelha de um tema pode gastar as
 * 20 páginas (total exato até 20 000), a lista de temas gasta UMA e mostra a
 * contagem como mínimo — desenhar cartões nunca pode custar ler pastas
 * inteiras, e são vários temas por ecrã.
 */
export async function countThemeFiles(
  themeId: string,
  maxPages = MAX_COUNT_PAGES,
  pageSize = COUNT_PAGE,
): Promise<ThemeFileCount> {
  const cached = readCount(themeId, maxPages, pageSize);
  if (cached) return cached;
  let total = 0;
  for (let page = 0; page < maxPages; page++) {
    const listed = await listThemeFiles(themeId, pageSize, page * pageSize);
    if (!listed.ok) return { total, ok: false, truncated: false };
    total += listed.names.length;
    if (!listed.truncated) {
      return writeCount(themeId, maxPages, pageSize, { total, ok: true, truncated: false });
    }
  }
  return writeCount(themeId, maxPages, pageSize, { total, ok: true, truncated: true });
}

/**
 * MEMÓRIA CURTA DA CONTAGEM — medido, não suposto.
 *
 * Contar é listar: uma ida ao Storage por cada `COUNT_PAGE` fotos. Numa pasta
 * de 5000 são 6, SEQUENCIAIS, e a `listThemeImagePage` recontava-as em CADA
 * página da grelha. Medido com latências de Storage realistas (list 120 ms,
 * assinatura 90 ms): abrir uma página de um tema de 5000 fotos custava 936 ms,
 * de 12 000 custava 1778 ms, e percorrer cinco páginas pagava isso cinco
 * vezes. O custo crescia com a BIBLIOTECA, não com o que se mostra — que é o
 * oposto da promessa deste módulo.
 *
 * Isto não é um índice, e não é uma segunda fonte de verdade: é o resultado da
 * mesma contagem, guardado por 60 segundos DENTRO do processo. Expira sozinho,
 * é deitado fora a cada escrita (`invalidateThemeCount`) e, se o processo
 * morrer, conta-se outra vez. A pasta continua a mandar em tudo.
 *
 * Só se guardam contagens COMPLETAS e com os parâmetros por omissão: uma
 * contagem que falhou a meio, ou que bateu no teto, ou que alguém pediu com
 * um orçamento próprio, não tem nada que ficar em cache a mentir a outra
 * chamada.
 */
const COUNT_TTL_MS = 60_000;
const countMemo = new Map<string, { at: number; value: ThemeFileCount }>();

function countMemoKey(themeId: string, maxPages: number, pageSize: number): string | null {
  if (maxPages !== MAX_COUNT_PAGES || pageSize !== COUNT_PAGE) return null;
  const folder = themeFolder(themeId);
  return folder ? folder : null;
}

function readCount(themeId: string, maxPages: number, pageSize: number): ThemeFileCount | null {
  const key = countMemoKey(themeId, maxPages, pageSize);
  if (!key) return null;
  const hit = countMemo.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > COUNT_TTL_MS) {
    countMemo.delete(key);
    return null;
  }
  return hit.value;
}

function writeCount(
  themeId: string,
  maxPages: number,
  pageSize: number,
  value: ThemeFileCount,
): ThemeFileCount {
  const key = countMemoKey(themeId, maxPages, pageSize);
  // Uma contagem truncada é um MÍNIMO: guardá-la fixaria esse mínimo durante
  // um minuto inteiro, em vez de ele melhorar quando a pasta encolhe.
  if (key && !value.truncated) countMemo.set(key, { at: Date.now(), value });
  return value;
}

/**
 * Esquece a contagem de um tema. Chamada por tudo o que ESCREVE na pasta —
 * carregar, confirmar, apagar —, para que o número que a Catarina vê mude no
 * momento em que ela mexe nas fotos, e não daqui a um minuto.
 */
export function invalidateThemeCount(themeId: string): void {
  const folder = themeFolder(themeId);
  if (folder) countMemo.delete(folder);
}

/**
 * Assina em bloco um conjunto de caminhos — podem ser de pastas diferentes, é
 * o mesmo bucket. Um único pedido ao Storage para todos: é o que permite
 * desenhar a lista de temas assinando só as capas em vez de todas as fotos de
 * todos os temas. Devolve `caminho → URL`; nunca lança.
 *
 * `bucket` permite assinar as MINIATURAS com as mesmas chaves (ver
 * `signThemeThumbs`), sem duplicar esta função.
 */
export async function signThemePaths(
  paths: string[],
  bucket: string = THEME_BUCKET,
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const sb = getSupabase();
  if (!sb) return urls;
  // Falhar a assinar ORIGINAIS é uma avaria (a grelha fica vazia); falhar a
  // assinar MINIATURAS é rotina numa instalação que ainda não tem nenhuma —
  // não pode encher o alerta de erros por causa de algo que já tem plano B.
  const report = (err: unknown) =>
    bucket === THEME_BUCKET
      ? log.error("theme-storage: assinatura falhou", err, { count: paths.length, bucket })
      : log.warn("theme-storage: assinatura de miniaturas falhou", {
          count: paths.length,
          bucket,
        });
  try {
    const { data, error } = await sb.storage.from(bucket).createSignedUrls(paths, SIGNED_TTL);
    if (error || !data) {
      report(error);
      return urls;
    }
    for (const s of data) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  } catch (e) {
    report(e);
  }
  return urls;
}

/**
 * Assina as MINIATURAS dos caminhos dados (mesmas chaves, outro bucket).
 *
 * As que não existem — fotos anteriores às miniaturas, ou uma miniatura que
 * falhou ao carregar — vêm sem URL do Storage e simplesmente não entram no
 * mapa; quem chama cai para o original. Um bucket de miniaturas que nem sequer
 * exista dá o mesmo resultado: mapa vazio, tudo mostrado a partir do original.
 * Nunca lança e nunca cria nada.
 */
export function signThemeThumbs(paths: string[]): Promise<Map<string, string>> {
  return signThemePaths(paths, THEME_THUMB_BUCKET);
}

/**
 * Os caminhos de uma página, já com a ordem manual à frente (puro — testado).
 *
 * A pasta do Storage devolve sempre as mais recentes primeiro. Quando o tema
 * tem fotos arrumadas à mão, essas passam a valer como um PREFIXO da lista, e
 * o resto continua atrás pela ordem de sempre. É isto que permite arrastar
 * meia dúzia de fotos boas para a frente sem guardar uma cópia do catálogo.
 *
 * Devolve também `storageSkip`: quantas fotos NÃO arrumadas é preciso saltar
 * na pasta para chegar ao ponto certo — é o que mantém a paginação barata,
 * porque só se lê a pasta a partir daí.
 */
export function planOrderedPage(
  order: readonly string[],
  limit: number,
  offset: number,
): { fromOrder: string[]; storageSkip: number; needFromStorage: number } {
  const fromOrder = order.slice(offset, offset + limit);
  // Depois de esgotado o prefixo arrumado, a pasta continua de onde ficou —
  // descontando as fotos arrumadas, que já foram mostradas lá à frente.
  const storageSkip = Math.max(0, offset - order.length);
  return { fromOrder, storageSkip, needFromStorage: limit - fromOrder.length };
}

/**
 * Uma PÁGINA das fotos de um tema, mais recentes primeiro, com URL assinado do
 * original e — quando existe — da miniatura.
 *
 * É aqui que mora a promessa de escala: assina-se SÓ a página pedida, em duas
 * chamadas ao Storage (uma por bucket), em vez de assinar a pasta toda ao
 * abrir o tema. A pasta do bucket continua a ser o índice — não há lista de
 * imagens duplicada na base de dados que possa dessincronizar.
 *
 * O total é exato quando a pasta cabe na primeira página (custo zero: já
 * sabemos que acabou) e, caso contrário, é contado à parte com o orçamento de
 * `countThemeFiles`. Nunca lança.
 */
export async function listThemeImagePage(
  themeId: string,
  limit = THEME_PAGE_SIZE,
  offset = 0,
  order: readonly string[] = [],
): Promise<ThemeImagePage> {
  const size = Math.min(Math.max(1, Math.trunc(limit) || THEME_PAGE_SIZE), MAX_THEME_PAGE_SIZE);
  const from = Math.max(0, Math.trunc(offset) || 0);
  const folder = themeFolder(themeId);

  // Sem ordem manual, o caminho é o de sempre: uma leitura da pasta, uma
  // página. Com ordem manual, as arrumadas vêm à frente e a pasta continua
  // atrás — saltando as que já foram mostradas no prefixo.
  const arranged = order.filter((p) => themeIdOfPath(p) === folder);
  const plan = planOrderedPage(arranged, size, from);
  const arrangedSet = new Set(arranged);

  let paths: string[] = [...plan.fromOrder];
  let listed: ThemeFileList = { names: [], ok: true, truncated: false };
  if (plan.needFromStorage > 0) {
    listed = await listThemeFiles(
      themeId,
      plan.needFromStorage + arrangedSet.size,
      plan.storageSkip,
    );
    // Pasta ilegível: NÃO é "tema sem fotos". Quem chama tem de o dizer assim.
    if (!listed.ok) return { ok: false, images: [], total: 0, truncated: false };
    for (const name of listed.names) {
      if (paths.length >= size) break;
      const path = `${folder}/${name}`;
      // As arrumadas já saíram no prefixo — mostrá-las outra vez aqui era
      // repeti-las a meio da grelha.
      if (arrangedSet.has(path)) continue;
      paths.push(path);
    }
  } else {
    paths = paths.slice(0, size);
  }
  const [urls, thumbs] = await Promise.all([
    signThemePaths(paths),
    paths.length > 0 ? signThemeThumbs(paths) : Promise.resolve(new Map<string, string>()),
  ]);
  const images: ThemeImage[] = paths
    .map((path) => {
      const thumbUrl = thumbs.get(path);
      return { path, url: urls.get(path) ?? "", ...(thumbUrl ? { thumbUrl } : {}) };
    })
    .filter((im) => im.url);

  // Primeira página que não veio cheia: a pasta acabou aqui, o total já é este
  // e não se gasta nem mais uma ida ao Storage (o caso normal de um tema
  // pequeno). Caso contrário conta-se a sério.
  //
  // Com ordem manual esta conta deixa de fechar — a página mistura o prefixo
  // arrumado com a pasta —, por isso aí conta-se sempre. É o preço, uma
  // chamada, de um tema que alguém arrumou à mão.
  if (arranged.length === 0 && from === 0 && !listed.truncated) {
    return { ok: true, images, total: listed.names.length, truncated: false };
  }
  const counted = await countThemeFiles(themeId);
  // A contagem pode ter batido no teto, ou falhado a meio depois de a PÁGINA
  // já ter sido lida. Nos dois casos o que sabemos ao certo é que existem pelo
  // menos as que já vimos: devolve-se isso, marcado como mínimo, em vez de um
  // total mais pequeno do que a própria página.
  const floor = from + paths.length;
  return {
    ok: true,
    images,
    total: Math.max(counted.total, floor),
    truncated: counted.truncated || !counted.ok,
  };
}

/**
 * Apaga miniaturas — melhor esforço, sempre. Nunca lança, nunca cria o bucket
 * e o resultado NÃO conta para o sucesso da operação que a chamou: uma
 * miniatura órfã é lixo invisível e barato, uma foto que não se consegue
 * apagar é que era um problema.
 */
async function removeThumbs(paths: string[]): Promise<boolean> {
  if (paths.length === 0) return true;
  const sb = getSupabase();
  if (!sb) return false;
  try {
    const { error } = await sb.storage.from(THEME_THUMB_BUCKET).remove(paths);
    if (error) {
      log.warn("theme-storage: miniaturas não apagadas", { count: paths.length });
      return false;
    }
    return true;
  } catch (e) {
    log.warn("theme-storage: miniaturas não apagadas", { count: paths.length, erro: String(e) });
    return false;
  }
}

/** Apaga uma foto do tema (e a sua miniatura). `true` se o Storage confirmou
 *  a remoção do ORIGINAL — a miniatura é acessório e não decide nada. */
export async function deleteThemeImage(path: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path) || !(await ensureBucket(THEME_BUCKET))) return false;
  const { error } = await sb.storage.from(THEME_BUCKET).remove([path]);
  if (error) {
    log.error("theme-storage: remove falhou", error, { path });
    return false;
  }
  invalidateThemeCount(themeIdOfPath(path));
  await removeThumbs([path]);
  return true;
}

/**
 * Esvazia a pasta de um tema (usado ao eliminar o tema).
 *
 * Percorre a pasta em páginas até uma página curta, para que um tema com mais
 * fotos do que uma página não deixe as restantes órfãs e invisíveis. `ok` é a
 * palavra da rota: só com `ok: true` é que o tema pode desaparecer da lista —
 * caso contrário a eliminação é recusada e pode ser repetida.
 *
 * As miniaturas saem no fim e à parte: são derivadas, e não conseguir apagá-las
 * nunca pode impedir eliminar um tema.
 */
export async function deleteThemeFolder(
  themeId: string,
): Promise<{ ok: boolean; removed: number }> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket(THEME_BUCKET))) return { ok: false, removed: 0 };
  const folder = themeFolder(themeId);
  if (!folder) return { ok: false, removed: 0 };

  // 1) Recolhe TUDO antes de apagar: apagar à medida que se lista mexeria nos
  //    índices da própria paginação.
  const paths: string[] = [];
  let complete = false;
  for (let page = 0; page < MAX_DELETE_PAGES; page++) {
    const listed = await listThemeFiles(themeId, PAGE, page * PAGE);
    if (!listed.ok) return { ok: false, removed: 0 };
    paths.push(...listed.names.map((n) => `${folder}/${n}`));
    if (!listed.truncated) {
      complete = true;
      break;
    }
  }
  if (!complete) {
    // Uma pasta com mais de 20 000 fotos não é um caso real — é um sinal de
    // avaria. Apagamos o que já temos e recusamos (a repetição continua a
    // limpar), em vez de eliminar o tema deixando fotos para trás.
    log.error("theme-storage: limpeza da pasta atingiu o teto de páginas", null, {
      themeId,
      pages: MAX_DELETE_PAGES,
    });
  }

  // 2) Remove em lotes do mesmo tamanho da página.
  let removed = 0;
  for (let i = 0; i < paths.length; i += PAGE) {
    const chunk = paths.slice(i, i + PAGE);
    try {
      const { data, error } = await sb.storage.from(THEME_BUCKET).remove(chunk);
      if (error) {
        log.error("theme-storage: limpeza da pasta falhou", error, { themeId });
        return { ok: false, removed };
      }
      removed += data?.length ?? chunk.length;
    } catch (e) {
      log.error("theme-storage: limpeza da pasta falhou", e, { themeId });
      return { ok: false, removed };
    }
  }

  invalidateThemeCount(themeId);

  // 3) E só então as miniaturas: são derivadas, e o seu destino não pode
  //    influenciar o resultado. Se a limpeza das fotos tivesse falhado
  //    saíamos acima — apagar miniaturas de fotos que ficaram lá só faria a
  //    grelha voltar a puxar originais de 3 MB.
  await purgeThumbFolder(folder);

  return { ok: complete, removed };
}

/**
 * Esvazia a pasta de miniaturas de um tema. Melhor esforço declarado: percorre
 * o que conseguir, regista o que falhar e devolve sempre `void` — nada aqui
 * pode impedir um tema de ser eliminado. Não cria o bucket: numa instalação
 * anterior às miniaturas não há nada para apagar.
 */
async function purgeThumbFolder(folder: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !folder) return;
  try {
    for (let page = 0; page < MAX_DELETE_PAGES; page++) {
      const { data, error } = await sb.storage.from(THEME_THUMB_BUCKET).list(folder, {
        limit: PAGE,
        offset: 0, // apaga-se sempre a primeira página: a pasta encolhe a cada volta
        sortBy: { column: "created_at", order: "desc" },
      });
      if (error || !data) return;
      const names = data.filter((o) => o.id && !o.name.startsWith(".")).map((o) => o.name);
      if (names.length === 0) return;
      // Sem confirmação da remoção, parar: insistir só voltaria a pedir a
      // mesma página, que continua lá.
      if (!(await removeThumbs(names.map((n) => `${folder}/${n}`)))) return;
      if (data.length < PAGE) return;
    }
  } catch (e) {
    log.warn("theme-storage: limpeza das miniaturas falhou", { folder, erro: String(e) });
  }
}

/**
 * Bytes de uma foto do tema, para copiar para a pasta de uma proposta.
 * Aceita SÓ caminhos do bucket de temas — nunca URLs — para que um caminho
 * vindo do cliente não possa apontar para outro sítio.
 */
export async function fetchThemeImageBytes(path: string): Promise<Buffer | null> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path)) return null;
  try {
    const { data, error } = await sb.storage.from(THEME_BUCKET).download(path);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch (e) {
    log.error("theme-storage: download falhou", e, { path });
    return null;
  }
}

/**
 * Copia uma foto do tema para a pasta de uma proposta e devolve o novo
 * caminho + URL assinado, no formato que o estúdio já usa.
 *
 * A cópia é feita DENTRO do Storage (`copy` com `destinationBucket`), sem os
 * bytes passarem por aqui — um lote de 40 fotos deixa de puxar dezenas de MB
 * para a função e voltar a enviá-los. Se o Storage recusar a cópia, cai no
 * caminho antigo (download + upload), que dá o mesmo resultado mais devagar.
 *
 * O destino é construído NO SERVIDOR, com o mesmo layout do
 * `uploadProposalImage` (`<quoteId>/<uuid>.<ext>`), para que nada a jusante
 * consiga notar que a foto veio de uma cópia.
 */
export async function copyThemeImageToProposal(
  themePath: string,
  quoteId: string,
): Promise<{ path: string; url: string } | null> {
  // O caminho vem do cliente: valida-o ANTES de tocar no Storage.
  if (!isThemePath(themePath)) return null;
  const sb = getSupabase();
  if (!sb || !(await ensureProposalBucket())) return null;
  const safeQuoteId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  if (!safeQuoteId) return null;

  const contentType = contentTypeForPath(themePath);
  const dest = `${safeQuoteId}/${randomUUID()}.${extFor(contentType)}`;
  try {
    const { error } = await sb.storage
      .from(THEME_BUCKET)
      .copy(themePath, dest, { destinationBucket: PROPOSAL_BUCKET });
    if (!error) {
      const { data } = await sb.storage
        .from(PROPOSAL_BUCKET)
        .createSignedUrl(dest, PROPOSAL_COPY_TTL);
      return { path: dest, url: data?.signedUrl ?? "" };
    }
    log.warn("theme-storage: cópia no Storage falhou, a descarregar", {
      themePath,
      erro: error.message,
    });
  } catch (e) {
    log.error("theme-storage: cópia no Storage falhou", e, { themePath });
  }

  // Recurso: puxar os bytes e voltar a carregá-los.
  const bytes = await fetchThemeImageBytes(themePath);
  if (!bytes) return null;
  return uploadProposalImage(quoteId, bytes, contentType);
}
