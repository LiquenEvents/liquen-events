import { NextRequest, NextResponse } from "next/server";
import { getSupabase, isDatabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for uptime monitors and load balancers.
 *
 * GET /api/health         — fast liveness check (no DB ping)
 * GET /api/health?deep=1  — full readiness check (includes DB ping, returns 503 on error)
 *
 * Public and secret-free: reports booleans only, never secret values.
 */
export async function GET(req: NextRequest) {
  const deep = req.nextUrl.searchParams.has("deep");

  type DbStatus = "ok" | "error" | "configured" | "disabled";
  let database: DbStatus = isDatabaseConfigured() ? "configured" : "disabled";
  let dbLatencyMs: number | undefined;

  if (deep && isDatabaseConfigured()) {
    const db = getSupabase()!;
    const t0 = Date.now();
    try {
      const { error } = await db.from("quotes").select("id").limit(1);
      dbLatencyMs = Date.now() - t0;
      database = error ? "error" : "ok";
    } catch {
      database = "error";
    }
  }

  const degraded = database === "error";

  const body: Record<string, unknown> = {
    status: degraded ? "degraded" : "ok",
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    checks: {
      database,
      ...(dbLatencyMs !== undefined && { dbLatencyMs }),
      email: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY),
      push: Boolean(process.env.VAPID_PUBLIC_KEY),
    },
  };

  return NextResponse.json(body, {
    status: degraded ? 503 : 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
