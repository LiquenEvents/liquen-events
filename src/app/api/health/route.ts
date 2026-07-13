import { NextRequest, NextResponse } from "next/server";
import { isAuthed } from "@/lib/admin-auth";
import { isDatabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness/readiness probe for uptime monitors and load balancers.
 * Public and secret-free: reports that the app is up and which integrations are
 * configured (booleans only — never values). The build SHA is only revealed to
 * an authenticated admin — for a public probe it's needless fingerprinting.
 */
export async function GET(request: NextRequest) {
  const body = {
    status: "ok" as const,
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    ...(isAuthed(request)
      ? { version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev" }
      : {}),
    checks: {
      database: isDatabaseConfigured() ? "configured" : "fallback",
      email: Boolean(process.env.SMTP_HOST),
      push: Boolean(process.env.VAPID_PUBLIC_KEY),
    },
  };
  return NextResponse.json(body, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
