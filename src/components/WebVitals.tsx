"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { isTokenRoute, sanitizeTelemetryPath } from "@/lib/safe-path";

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
 *
 * ── NAS ROTAS COM TOKEN NÃO SE MEDE NADA ──────────────────────────────────
 *
 * A proposta e o portal do casal são páginas privadas, e a regra do produto
 * sobre elas é explícita e é dela: «não registar quando a proposta é aberta».
 * Regista-se só o que o casal faz DE PROPÓSITO — uma escolha, um comentário,
 * o aceite.
 *
 * Uma baliza de Web Vitals é o contrário disso: é passiva, dispara por o
 * documento existir, e cada uma escreve nos registos de produção uma linha que
 * diz «abriu-se uma página de proposta, a esta hora, nesta ligação». O token
 * já era limpo antes de sair do aparelho — mas o que sobra continua a ser o
 * registo de uma abertura, que é precisamente o que não se pode ter.
 *
 * O `Analytics` e o `GoogleTag` já se recusavam a montar aqui (`isTokenRoute`,
 * em `safe-path.ts`); este ficou de fora dessa regra e era o furo.
 *
 * A guarda está em DOIS sítios de propósito. A da entrada evita importar
 * sequer a biblioteca. A de dentro do `send` apanha o caso que a primeira não
 * apanha: uma métrica que ficou pendente numa página pública e só é fechada
 * depois de o casal já ter navegado para a proposta — o `onCLS`, por exemplo,
 * só fecha à saída da página.
 */
export default function WebVitals() {
  const pathname = usePathname();
  const privada = isTokenRoute(pathname);
  // O `ref` existe para o `send` que JÁ está registado na biblioteca poder ler
  // o valor de agora, e não o que existia quando foi criado. Nasce com o valor
  // certo (o valor inicial de um `useRef` não é uma escrita durante o desenho)
  // e é actualizado num efeito — escrevê-lo no corpo do componente é um erro
  // que o `react-hooks/refs` apanha, e apanhou.
  const rotaPrivada = useRef(privada);
  useEffect(() => {
    rotaPrivada.current = privada;
  }, [privada]);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (privada) return;

    const conn = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection
      ?.effectiveType;

    const send = (metric: { name: string; value: number; rating: string }) => {
      // Ver o cabeçalho: uma métrica pode fechar já dentro de uma rota privada.
      if (rotaPrivada.current) return;
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
  }, [privada]);

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
