import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { getSupabase } from "./supabase";
import { log } from "./logger";

/**
 * Tiny persistent key-value state for operational markers (e.g. the inbox
 * high-water mark the cron uses for dedupe). Supabase-backed when configured —
 * a local file is EPHEMERAL on serverless, so markers stored there reset on
 * every deploy/instance swap. Falls back to data/app-state.json in dev.
 *
 * Never throws: a broken marker must degrade (worst case, a duplicate
 * notification), not take the caller down. Failures are logged.
 */
const FILE = path.join(process.cwd(), "data", "app-state.json");

async function readFileState(): Promise<Record<string, unknown>> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf-8"));
  } catch {
    return {};
  }
}

export async function getState<T>(key: string): Promise<T | null> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("app_state")
        .select("value")
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return (data?.value as T) ?? null;
    } catch (err) {
      log.error("app-state: leitura falhou (a tabela app_state existe? ver db/schema.sql)", err, {
        key,
      });
      return null;
    }
  }
  const all = await readFileState();
  return (all[key] as T) ?? null;
}

/**
 * Todas as entradas cuja chave começa por `prefix`.
 *
 * Existe por causa de UMA pergunta que não se conseguia responder de outra
 * maneira: *quais os rascunhos do estúdio que usam esta foto da Biblioteca?*
 * Os rascunhos vivem aqui, com a chave `proposal-draft:<pedido>` (ver
 * `proposal-drafts.ts`), e apagar uma foto sem saber quem a usa é a única
 * forma de a referência — em vez da cópia — poder perder trabalho.
 *
 * Não é para o caminho de leitura de nada: é uma varredura, chamada quando ela
 * apaga uma foto ou um tema. Por isso tem tecto, e o tecto é reportado a quem
 * chama em vez de ser escondido — uma varredura truncada não pode passar por
 * uma varredura completa numa decisão sobre perder fotos.
 */
export async function listStateByPrefix<T>(
  prefix: string,
  limite = 2000,
): Promise<{ entradas: { key: string; value: T }[]; completa: boolean }> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { data, error } = await sb
        .from("app_state")
        .select("key, value")
        // `%` e `_` são curingas do LIKE: escapá-los impede que um prefixo com
        // um deles varra mais do que devia.
        .like("key", `${prefix.replace(/([%_\\])/g, "\\$1")}%`)
        .limit(limite + 1);
      if (error) throw error;
      const linhas = (data ?? []) as { key: string; value: T }[];
      return { entradas: linhas.slice(0, limite), completa: linhas.length <= limite };
    } catch (err) {
      log.error("app-state: varredura por prefixo falhou", err, { prefix });
      // Devolver "vazio e completo" faria quem chama concluir que ninguém usa a
      // foto. Vazio e INCOMPLETO é a verdade: não se sabe.
      return { entradas: [], completa: false };
    }
  }
  const all = await readFileState();
  const entradas = Object.entries(all)
    .filter(([k]) => k.startsWith(prefix))
    .map(([key, value]) => ({ key, value: value as T }));
  return { entradas: entradas.slice(0, limite), completa: entradas.length <= limite };
}

export async function setState<T>(key: string, value: T): Promise<void> {
  const sb = getSupabase();
  if (sb) {
    try {
      const { error } = await sb
        .from("app_state")
        .upsert({ key, value, updated_at: new Date().toISOString() });
      if (error) throw error;
      return;
    } catch (err) {
      log.error("app-state: escrita falhou (a tabela app_state existe? ver db/schema.sql)", err, {
        key,
      });
      return;
    }
  }
  try {
    const all = await readFileState();
    all[key] = value;
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(all, null, 2));
  } catch (err) {
    log.error("app-state: escrita em ficheiro falhou", err, { key });
  }
}
