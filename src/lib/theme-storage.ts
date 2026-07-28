import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
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

let bucketReady = false;

async function ensureBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (bucketReady) return true;
  const { data } = await sb.storage.getBucket(THEME_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(THEME_BUCKET, { public: false });
    // Ignora corridas "already exists"; qualquer outro erro é reportado.
    if (error && !/exist/i.test(error.message)) {
      log.error("theme-storage: createBucket falhou", error);
      return false;
    }
  }
  bucketReady = true;
  return true;
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

/**
 * Todas as fotos de um tema, mais recentes primeiro, cada uma com URL assinado.
 * A pasta do bucket é o índice — não há lista de imagens duplicada na base de
 * dados que possa dessincronizar. Devolve [] quando o Storage não está
 * disponível; nunca lança.
 */
export async function listThemeImages(themeId: string, limit = 500): Promise<ThemeImage[]> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return [];
  const folder = themeFolder(themeId);
  if (!folder) return [];
  try {
    const { data, error } = await sb.storage.from(THEME_BUCKET).list(folder, {
      limit,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data) return [];
    // Só ficheiros reais (o Storage devolve marcadores de pasta sem id).
    const paths = data
      .filter((o) => o.id && !o.name.startsWith("."))
      .map((o) => `${folder}/${o.name}`);
    if (paths.length === 0) return [];
    const { data: signed } = await sb.storage
      .from(THEME_BUCKET)
      .createSignedUrls(paths, SIGNED_TTL);
    return (signed ?? [])
      .map((s) => ({ path: s.path ?? "", url: s.signedUrl ?? "" }))
      .filter((im) => im.path && im.url);
  } catch (e) {
    log.error("theme-storage: list falhou", e, { themeId });
    return [];
  }
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

/** Esvazia a pasta de um tema (usado ao eliminar o tema). */
export async function deleteThemeFolder(themeId: string): Promise<void> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return;
  const images = await listThemeImages(themeId);
  if (images.length === 0) return;
  const { error } = await sb.storage.from(THEME_BUCKET).remove(images.map((i) => i.path));
  if (error) log.error("theme-storage: limpeza da pasta falhou", error, { themeId });
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
