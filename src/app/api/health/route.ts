import { NextResponse } from "next/server";
import { isDatabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for uptime monitors and load balancers.
 * Public and secret-free: reports that the app is up and which integrations are
 * configured (booleans only — never values).
 */
export async function GET() {
  const body = {
    status: "ok" as const,
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    checks: {
      database: isDatabaseConfigured() ? "configured" : "fallback",
      email: Boolean(process.env.SMTP_HOST || process.env.RESEND_API_KEY),
      push: Boolean(process.env.VAPID_PUBLIC_KEY),
    },
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
