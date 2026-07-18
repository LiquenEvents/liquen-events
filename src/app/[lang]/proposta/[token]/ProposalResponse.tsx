"use client";

import { useState } from "react";
import type { ProposalStatus } from "@/lib/orcamento/types";
import type { Dict } from "@/lib/i18n";

interface Props {
  token: string;
  initialStatus: ProposalStatus;
  clientEmail: string;
  // Passed in from the server page instead of the site-wide chrome context, so
  // the proposta namespace only ships on this token route.
  proposta: Dict["proposta"];
}

export default function ProposalResponse({ token, initialStatus, clientEmail, proposta }: Props) {
  const tp = proposta.response;
  const decided = initialStatus === "aceite" || initialStatus === "rejeitada";
  const [status, setStatus] = useState<"aceite" | "rejeitada" | null>(
    initialStatus === "aceite" ? "aceite" : initialStatus === "rejeitada" ? "rejeitada" : null,
  );
  const [sending, setSending] = useState<"aceitar" | "recusar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "aceitar" | "recusar") {
    if (sending) return;
    // Both consequential actions confirm — accepting is a commitment, so it
    // must be at least as guarded as declining (WCAG 3.3.4 Error Prevention).
    if (action === "recusar" && !window.confirm(tp.confirmRecusar)) return;
    if (action === "aceitar" && !window.confirm(tp.confirmAceitar)) return;
    setSending(action);
    setError(null);
    // Abort a hung request instead of spinning "A aceitar…" forever on a stalled
    // connection. This is a client COMMITMENT (accept/decline a proposal), so a
    // silent infinite spinner is the worst failure mode — mirror the quote
    // form's guard so the visitor gets an error + a way to reach us.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    try {
      const res = await fetch("/api/proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
        signal: controller.signal,
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tp.errorFallback);
      setStatus(data.status === "aceite" ? "aceite" : "rejeitada");
    } catch (e) {
      // A timeout/abort has no server message → fall back to the generic retry
      // copy instead of surfacing a raw "AbortError" string.
      setError(e instanceof Error && e.name !== "AbortError" ? e.message : tp.errorGeneric);
    } finally {
      clearTimeout(timeout);
      setSending(null);
    }
  }

  if (status) {
    return (
      <div
        role="status"
        className={`mt-9 rounded-lg border p-6 text-center ${
          status === "aceite"
            ? "border-moss/30 bg-moss/8"
            : "border-foreground/12 bg-foreground/[0.03]"
        }`}
      >
        {status === "aceite" ? (
          <>
            <div className="w-12 h-12 rounded-full bg-moss/15 border border-moss/30 text-moss flex items-center justify-center text-2xl mx-auto mb-4">
              ✓
            </div>
            <p
              className="text-foreground/85 font-bold mb-2"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 3vw, 26px)" }}
            >
              {tp.aceiteTitle}
            </p>
            <p className="text-foreground/72 text-sm leading-relaxed">{tp.aceiteBody}</p>
          </>
        ) : (
          <>
            <p
              className="text-foreground/80 font-bold mb-2"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(19px, 3vw, 24px)" }}
            >
              {tp.rejeitadaTitle}
            </p>
            <p className="text-foreground/72 text-sm leading-relaxed">{tp.rejeitadaBody}</p>
          </>
        )}
        {decided && <p className="text-foreground/68 text-[11px] mt-4">{tp.jaRegistado}</p>}
      </div>
    );
  }

  return (
    <div className="mt-9">
      <div className="flex flex-col sm:flex-row gap-3">
        {/* aria-disabled (not the native `disabled` attribute): a real `disabled`
            flipped mid-request yanks focus off the button to <body>; the respond()
            handler already no-ops while `sending`, so the button stays focusable
            and operable-but-inert. (Mirrors OrcamentoForm's submit.) */}
        <button
          onClick={() => respond("aceitar")}
          aria-disabled={!!sending}
          className="flex-1 py-4 rounded-md bg-moss text-white text-xs tracking-[0.2em] uppercase font-medium hover:bg-moss-dark transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        >
          {sending === "aceitar" ? tp.aceitarSending : tp.aceitar}
        </button>
        <button
          onClick={() => respond("recusar")}
          aria-disabled={!!sending}
          className="sm:w-auto px-6 py-4 rounded-md border border-foreground/15 text-foreground/72 text-xs tracking-[0.2em] uppercase hover:border-foreground/30 hover:text-foreground/65 transition-colors aria-disabled:opacity-50 aria-disabled:cursor-not-allowed"
        >
          {sending === "recusar" ? tp.recusarSending : tp.recusar}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[#a04a2f] text-xs mt-3 text-center">
          {error} {tp.errorSuffix}{" "}
          <a href={`mailto:${clientEmail}`} className="underline">
            {tp.errorLink}
          </a>
          .
        </p>
      )}
    </div>
  );
}
