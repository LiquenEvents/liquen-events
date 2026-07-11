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
