"use client";

import { useState } from "react";
import type { ProposalStatus } from "@/lib/orcamento/types";
import { useTranslations } from "@/components/LocaleProvider";

interface Props {
  token: string;
  initialStatus: ProposalStatus;
  clientEmail: string;
}

export default function ProposalResponse({ token, initialStatus, clientEmail }: Props) {
  const { t } = useTranslations();
  const tp = t.proposta.response;
  const decided = initialStatus === "aceite" || initialStatus === "rejeitada";
  const [status, setStatus] = useState<"aceite" | "rejeitada" | null>(
    initialStatus === "aceite" ? "aceite" : initialStatus === "rejeitada" ? "rejeitada" : null,
  );
  const [sending, setSending] = useState<"aceitar" | "recusar" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function respond(action: "aceitar" | "recusar") {
    if (sending) return;
    if (action === "recusar" && !window.confirm(tp.confirmRecusar)) {
      return;
    }
    setSending(action);
    setError(null);
    try {
      const res = await fetch("/api/proposta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || tp.errorFallback);
      setStatus(data.status === "aceite" ? "aceite" : "rejeitada");
    } catch (e) {
      setError(e instanceof Error ? e.message : tp.errorGeneric);
    } finally {
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
            <p className="text-foreground/55 text-sm leading-relaxed">{tp.aceiteBody}</p>
          </>
        ) : (
          <>
            <p
              className="text-foreground/80 font-bold mb-2"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(19px, 3vw, 24px)" }}
            >
              {tp.rejeitadaTitle}
            </p>
            <p className="text-foreground/55 text-sm leading-relaxed">{tp.rejeitadaBody}</p>
          </>
        )}
        {decided && <p className="text-foreground/30 text-[11px] mt-4">{tp.jaRegistado}</p>}
      </div>
    );
  }

  return (
    <div className="mt-9">
      <div className="flex flex-col sm:flex-row gap-3">
        <button
          onClick={() => respond("aceitar")}
          disabled={!!sending}
          className="flex-1 py-4 rounded-md bg-moss text-cream text-xs tracking-[0.2em] uppercase font-medium hover:bg-moss-dark transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending === "aceitar" ? tp.aceitarSending : tp.aceitar}
        </button>
        <button
          onClick={() => respond("recusar")}
          disabled={!!sending}
          className="sm:w-auto px-6 py-4 rounded-md border border-foreground/15 text-foreground/45 text-xs tracking-[0.2em] uppercase hover:border-foreground/30 hover:text-foreground/65 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending === "recusar" ? tp.recusarSending : tp.recusar}
        </button>
      </div>
      {error && (
        <p role="alert" className="text-[#b5654a] text-xs mt-3 text-center">
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
