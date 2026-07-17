import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { getSupabase, isDatabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Actually probe the database instead of only reporting whether it's configured.
 * A cheap HEAD count on `quotes` (no rows transferred) confirms the connection
 * is live. Bounded by a short timeout so a hung DB can't stall the probe.
 * Returns:
 *   "ok"       — configured and responding
 *   "down"     — configured but the query failed/timed out (this is the case a
 *                config-only check silently missed: the site looks healthy while
 *                leads are being rejected)
 *   "fallback" — no Supabase configured (dev / file backend)
 */
async function probeDatabase(): Promise<"ok" | "down" | "fallback"> {
  const sb = getSupabase();
  if (!sb) return "fallback";
  try {
    const { error } = await sb
      .from("quotes")
      .select("id", { count: "exact", head: true })
      .abortSignal(AbortSignal.timeout(4000));
    return error ? "down" : "ok";
  } catch {
    return "down";
  }
}

/**
 * Liveness/readiness probe for uptime monitors and load balancers.
 * Public and secret-free: reports that the app is up, whether the database is
 * actually responding, and which other integrations are configured (booleans
 * only — never values). A "down" database flips the whole probe to HTTP 503 so
 * an external monitor can alert. The build SHA is only revealed to an
 * authenticated admin — for a public probe it's needless fingerprinting.
 */
export async function GET(request: NextRequest) {
  const database = await probeDatabase();
  const healthy = database !== "down";
  const body = {
    status: healthy ? ("ok" as const) : ("degraded" as const),
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    ...(isAuthed(request)
      ? { version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" }
      : {}),
    checks: {
      database,
      email: Boolean(process.env.SMTP_HOST),
      push: Boolean(process.env.VAPID_PUBLIC_KEY),
    },
  };
  return NextResponse.json(body, {
    status: healthy ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
