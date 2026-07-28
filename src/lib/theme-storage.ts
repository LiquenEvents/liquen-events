import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import {
  PROPOSAL_BUCKET,
  uploadProposalImage,
  ensureBucket as ensureProposalBucket,
} from "./proposal-storage";
import { log } from "./logger";
import type { ThemeImage } from "./theme-types";

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

// URLs assinados de 10 anos — na prática permanentes para uso interno; o
// bucket mantém-se privado, nada é publicamente enumerável.
const SIGNED_TTL = 60 * 60 * 24 * 365 * 10;

/** Fotos pedidas de uma vez ao Storage (limite por página da listagem). */
const PAGE = 500;

/** Teto de páginas ao esvaziar uma pasta — 40 × 500 = 20 000 fotos. */
const MAX_DELETE_PAGES = 40;

let ready: Promise<boolean> | null = null;

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
 * Garante o bucket, uma vez por processo. Memoiza a PROMESSA (e não um
 * booleano): vários pedidos em paralelo — a lista de temas faz um por tema —
 * partilham a mesma verificação em vez de dispararem getBucket/createBucket
 * ao mesmo tempo. Numa falha o memo é limpo, para que uma indisponibilidade
 * passageira não fique marcada para sempre.
 */
async function ensureBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (!ready) {
    const attempt = (async () => {
      const { data, error } = await sb.storage.getBucket(THEME_BUCKET);
      if (data) return true;
      if (error && !isNotFound(error)) {
        log.error("theme-storage: getBucket falhou", error);
        return false;
      }
      const { error: createError } = await sb.storage.createBucket(THEME_BUCKET, { public: false });
      // Ignora corridas "already exists"; qualquer outro erro é reportado.
      if (createError && !/exist/i.test(createError.message)) {
        log.error("theme-storage: createBucket falhou", createError);
        return false;
      }
      return true;
    })();
    ready = attempt.then(
      (ok) => {
        if (!ok) ready = null;
        return ok;
      },
      (err) => {
        ready = null;
        log.error("theme-storage: ensureBucket falhou", err);
        return false;
      },
    );
  }
  return ready;
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

/** Carrega uma foto (bytes) para a pasta de um tema. */
export async function uploadThemeImage(
  themeId: string,
  bytes: Buffer,
  contentType: string,
): Promise<ThemeImage | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return null;
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
  const { data } = await sb.storage.from(THEME_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return { path, url: data?.signedUrl ?? "" };
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
  if (!sb || !(await ensureBucket())) return unreadable;
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

/**
 * Assina em bloco um conjunto de caminhos do bucket de temas — podem ser de
 * pastas diferentes, é o mesmo bucket. Um único pedido ao Storage para todos:
 * é o que permite desenhar a lista de temas assinando só as capas em vez de
 * todas as fotos de todos os temas. Devolve `caminho → URL`; nunca lança.
 */
export async function signThemePaths(paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const sb = getSupabase();
  if (!sb) return urls;
  try {
    const { data, error } = await sb.storage.from(THEME_BUCKET).createSignedUrls(paths, SIGNED_TTL);
    if (error || !data) {
      log.error("theme-storage: assinatura falhou", error, { count: paths.length });
      return urls;
    }
    for (const s of data) if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
  } catch (e) {
    log.error("theme-storage: assinatura falhou", e, { count: paths.length });
  }
  return urls;
}

/**
 * Todas as fotos de um tema, mais recentes primeiro, cada uma com URL assinado.
 * A pasta do bucket é o índice — não há lista de imagens duplicada na base de
 * dados que possa dessincronizar. Devolve [] quando o Storage não está
 * disponível; nunca lança.
 */
export async function listThemeImages(themeId: string, limit = PAGE): Promise<ThemeImage[]> {
  const { names } = await listThemeFiles(themeId, limit);
  if (names.length === 0) return [];
  const folder = themeFolder(themeId);
  const paths = names.map((n) => `${folder}/${n}`);
  const urls = await signThemePaths(paths);
  return paths.map((path) => ({ path, url: urls.get(path) ?? "" })).filter((im) => im.url);
}

/** Apaga uma foto do tema. `true` se o Storage confirmou a remoção. */
export async function deleteThemeImage(path: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb || !isThemePath(path) || !(await ensureBucket())) return false;
  const { error } = await sb.storage.from(THEME_BUCKET).remove([path]);
  if (error) {
    log.error("theme-storage: remove falhou", error, { path });
    return false;
  }
  return true;
}

/**
 * Esvazia a pasta de um tema (usado ao eliminar o tema).
 *
 * Percorre a pasta em páginas até uma página curta, para que um tema com mais
 * fotos do que uma página não deixe as restantes órfãs e invisíveis. `ok` é a
 * palavra da rota: só com `ok: true` é que o tema pode desaparecer da lista —
 * caso contrário a eliminação é recusada e pode ser repetida.
 */
export async function deleteThemeFolder(
  themeId: string,
): Promise<{ ok: boolean; removed: number }> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return { ok: false, removed: 0 };
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
  return { ok: complete, removed };
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
      const { data } = await sb.storage.from(PROPOSAL_BUCKET).createSignedUrl(dest, SIGNED_TTL);
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
