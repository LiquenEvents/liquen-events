import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getSupabase } from "@/lib/supabase";
import { rateLimit, clientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEM_CACHE = { "Cache-Control": "no-store, max-age=0" } as const;

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
 * ── O DETALHE SÓ COM O TOKEN (auditoria externa, S3) ──────────────────────
 *
 * Esta rota era pública e dizia a quem perguntasse o estado da base de dados,
 * se havia email e notificações configurados, e há quanto tempo o processo
 * estava de pé. Nenhum valor secreto — mas é exactamente o mapa que um
 * atacante quer: o que está ligado, o que está em baixo, e quando foi o último
 * arranque.
 *
 * Ao público sai só `{"status":"ok"}` — chega para dizer que o sítio responde,
 * e não toca na base de dados. O detalhe (e o 503 quando a base de dados está
 * em baixo) exige `Authorization: Bearer <HEALTH_TOKEN>`. Sem `HEALTH_TOKEN`
 * definido, ninguém o vê. Um monitor externo que precise de saber da base de
 * dados tem de mandar o token.
 *
 * Compara-se o RESUMO e não a cadeia, em tempo constante: os dois lados têm
 * sempre 32 bytes, e o tempo de resposta não diz quantos caracteres estavam
 * certos (o mesmo cuidado de `identificadorIgual`, em admin-auth.ts).
 */
function temOToken(request: NextRequest): boolean {
  const esperado = process.env.HEALTH_TOKEN?.trim();
  if (!esperado) return false;
  const cabecalho = request.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(cabecalho.trim());
  if (!m) return false;
  const a = createHash("sha256").update(m[1].trim(), "utf8").digest();
  const b = createHash("sha256").update(esperado, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function GET(request: NextRequest) {
  if (!temOToken(request)) {
    return NextResponse.json({ status: "ok" }, { status: 200, headers: SEM_CACHE });
  }

  // The DB probe is a real query, so cap how often one IP can trigger it —
  // even with the token. When exceeded, answer the liveness 200 without
  // probing the database.
  const limited = await rateLimit(`health:${clientIp(request)}`, 30, 60_000);
  if (!limited.ok) {
    return NextResponse.json({ status: "ok" }, { status: 200, headers: SEM_CACHE });
  }

  const database = await probeDatabase();
  const healthy = database !== "down";
  const body = {
    status: healthy ? ("ok" as const) : ("degraded" as const),
    time: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
    checks: {
      database,
      email: Boolean(process.env.SMTP_HOST),
      push: Boolean(process.env.VAPID_PUBLIC_KEY),
    },
  };
  return NextResponse.json(body, { status: healthy ? 200 : 503, headers: SEM_CACHE });
}
