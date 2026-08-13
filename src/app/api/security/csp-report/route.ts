import { NextRequest, NextResponse } from "next/server";
import { log } from "@/lib/logger";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Relatórios registados por pedido. O endereço é público por necessidade (é o
 * browser que escreve aqui) e o ramo do array percorria o que lhe mandassem:
 * um único POST com dez mil entradas enchia os registos. O limite de pedidos
 * por minuto já cá estava; isto fecha a outra metade.
 */
const MAX_RELATORIOS = 20;

/** Campos cortados antes de irem para os registos: um `blocked-uri` de 50 kB é
 *  igualmente inútil e igualmente caro de guardar. */
const MAX_CAMPO = 300;

const campo = (v: unknown) => (typeof v === "string" ? v.slice(0, MAX_CAMPO) : undefined);

/** Log one violation record, tolerant of the legacy (kebab-case) and modern
 *  Reporting API (camelCase, nested under `.body`) field names. */
function logViolation(r: Record<string, unknown>) {
  log.warn("CSP violation", {
    documentUri: campo(r["document-uri"] ?? r["documentURL"]),
    violatedDirective: campo(r["violated-directive"] ?? r["effectiveDirective"]),
    blockedUri: campo(r["blocked-uri"] ?? r["blockedURL"]),
  });
}

/**
 * Collects browser CSP violation reports. Handles BOTH wire formats: the legacy
 * report-uri body ({ "csp-report": {...} }, content-type application/csp-report)
 * and the modern report-to / Reporting API body (an array of
 * { type, body: {...} }, content-type application/reports+json). Useful to detect
 * injection attempts and to safely tighten the policy over time. Public by
 * necessity (browsers post here), so it's rate-limited and only logs a small,
 * fixed set of fields — never echoes anything back.
 */
export async function POST(req: NextRequest) {
  sweep();
  if (!(await rateLimit(`csp:${clientIp(req)}`, 30, 60_000)).ok) {
    return new NextResponse(null, { status: 429 });
  }
  try {
    const body = (await req.json().catch(() => null)) as unknown;
    if (Array.isArray(body)) {
      // Modern Reporting API: an array of reports; CSP ones carry the violation
      // under `.body`. Ignore other report types that may share the endpoint.
      for (const item of body.slice(0, MAX_RELATORIOS)) {
        const rec = item as Record<string, unknown>;
        if (rec?.["type"] && rec["type"] !== "csp-violation") continue;
        logViolation((rec?.["body"] ?? rec) as Record<string, unknown>);
      }
    } else {
      const obj = (body ?? {}) as Record<string, unknown>;
      logViolation((obj["csp-report"] ?? obj) as Record<string, unknown>);
    }
  } catch {
    /* ignore malformed reports */
  }
  return new NextResponse(null, { status: 204 });
}
