"use client";

import { useEffect } from "react";
import { sanitizeTelemetryPath } from "@/lib/safe-path";

/**
 * Reports real-user Web Vitals (LCP, CLS, INP, TTFB, FCP) to /api/vitals, so we
 * can see the site's ACTUAL fluidity in the field — on real phones and
 * networks — not only in the lab (Lighthouse + the Playwright harness).
 *
 * Uses the standard `web-vitals` library (correct CLS session-windowing and INP
 * percentile logic, which are easy to get wrong by hand), dynamically imported
 * so it stays out of the initial bundle. Each finalized metric is sent with
 * `navigator.sendBeacon` (survives the page being closed) to a same-origin
 * endpoint (allowed by CSP connect-src 'self'). Production-only.
 */
export default function WebVitals() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;

    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
      ?.effectiveType;

    const send = (metric: { name: string; value: number; rating: string }) => {
      try {
        const body = JSON.stringify({
          name: metric.name,
          value: metric.value,
          rating: metric.rating,
          // RGPD/segurança: `location.pathname` em /portal/<token> ou
          // /proposta/<token> É o segredo do cliente (148 caracteres medidos,
          // logo cabe inteiro no campo). A baliza é gravada nos registos de
          // produção da Vercel, que ficam conservados e consultáveis, por isso
          // o token é retirado AQUI, antes de sair do dispositivo. O servidor
          // repete a limpeza — nenhum dos lados confia no outro.
          path: sanitizeTelemetryPath(location.pathname),
          nav: getNavType(),
          conn,
        });
        // sendBeacon is fire-and-forget and survives unload; fall back to fetch
        // keepalive where it's unavailable.
        if (navigator.sendBeacon) navigator.sendBeacon("/api/vitals", body);
        else void fetch("/api/vitals", { method: "POST", body, keepalive: true });
      } catch {
        /* never let telemetry throw into the app */
      }
    };

    let cancelled = false;
    import("web-vitals")
      .then(({ onLCP, onCLS, onINP, onTTFB, onFCP }) => {
        if (cancelled) return;
        onLCP(send);
        onCLS(send);
        onINP(send);
        onTTFB(send);
        onFCP(send);
      })
      .catch(() => {
        /* library failed to load — no telemetry, app unaffected */
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

/** Best-effort navigation type (navigate / reload / back_forward / prerender). */
function getNavType(): string | undefined {
  try {
    const nav = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;
    return nav?.type;
  } catch {
    return undefined;
  }
}
