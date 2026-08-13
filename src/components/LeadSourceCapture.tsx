"use client";

import { useEffect } from "react";
import { capturarClique } from "@/lib/ads/click-id";

/** sessionStorage key holding the visitor's first-touch acquisition source. */
export const LEAD_SOURCE_KEY = "liquen-lead-source";

/**
 * First-touch attribution. On the visitor's FIRST page in a session, record what
 * brought them — UTM params and/or the external referrer host — into
 * sessionStorage. The quote form reads it at submit and sends it as
 * `referralSource`, so the admin's "where do leads come from" aggregation is fed
 * for web leads (which previously all showed "Não indicado" — only manual
 * entries had a source). First touch wins: later same-site navigations never
 * overwrite the original source.
 *
 * Renders nothing and is independent of Plausible, so attribution works whether
 * or not cookieless analytics is enabled.
 */
export default function LeadSourceCapture() {
  useEffect(() => {
    // O identificador do clique pago é guardado SEMPRE, e antes de tudo o
    // resto: vive em localStorage com a janela de 90 dias da Google, e não em
    // sessionStorage como a atribuição acima. São coisas diferentes com prazos
    // diferentes — a atribuição serve para a equipa perceber de onde vêm os
    // pedidos, o identificador serve para devolver o valor real do casamento
    // à Google. O `return` de primeiro-toque abaixo não pode saltar isto.
    try {
      capturarClique(window.location.search, window.location.pathname);
    } catch {
      /* nunca deixar a medição impedir o resto da captura */
    }

    try {
      if (sessionStorage.getItem(LEAD_SOURCE_KEY)) return; // first touch already recorded
      const params = new URLSearchParams(window.location.search);
      const utm = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"]
        .map((k) => {
          const v = params.get(k);
          return v ? `${k.slice(4)}=${v.slice(0, 60)}` : "";
        })
        .filter(Boolean)
        .join(" ");
      let ref = "";
      if (document.referrer) {
        try {
          const host = new URL(document.referrer).hostname;
          // Skip our own infrastructure. A visit that came from the Vercel
          // dashboard or a preview URL isn't attribution — it's us — and it
          // reached the team's inbox as "Origem: ref:vercel.com".
          const ours =
            host === window.location.hostname ||
            /(^|\.)(vercel\.app|vercel\.com|liquen-events\.com)$/i.test(host) ||
            host === "localhost";
          if (host && !ours) ref = `ref:${host}`;
        } catch {
          /* malformed referrer — ignore */
        }
      }
      // Only store a positive signal; a direct/unknown entry stays empty so a
      // later page in the same visit that DOES carry a source can still set it.
      const composed = [utm, ref].filter(Boolean).join(" · ").slice(0, 200);
      if (composed) sessionStorage.setItem(LEAD_SOURCE_KEY, composed);
    } catch {
      /* sessionStorage unavailable (private mode) — skip attribution silently */
    }
  }, []);
  return null;
}
