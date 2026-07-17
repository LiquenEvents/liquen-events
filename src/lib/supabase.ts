import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Server-side Supabase client built from environment variables. Uses the
 * service-role key, so it must NEVER be imported into client components.
 * Returns null when unconfigured so callers can fall back gracefully
 * (e.g. local development without a database).
 *
 * Required env vars (Vercel → Settings → Environment Variables):
 *   SUPABASE_URL                e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY   the service_role secret (NOT the anon key)
 */
let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  if (!cached) {
    cached = createClient(url, key, { auth: { persistSession: false } });
  }
  return cached;
}

export function isDatabaseConfigured(): boolean {
  return getSupabase() !== null;
}
