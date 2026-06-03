"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quote } from "../../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "../../data";

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pendente: { label: "Pedido Recebido", color: "text-foreground/60" },
  em_revisao: { label: "Em Revisão", color: "text-moss" },
  cotado: { label: "Proposta Enviada", color: "text-moss" },
  aceite: { label: "Aceite", color: "text-moss" },
  rejeitado: { label: "Rejeitado", color: "text-foreground/35" },
};

export default function ConfirmacaoClient({ id }: { id: string }) {
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // 1) Prefer the hand-off saved by the wizard (works on any host).
    try {
      const cached = sessionStorage.getItem(`liquen-quote-${id}`);
      if (cached) {
        setQuote(JSON.parse(cached));
        setLoading(false);
        return;
      }
    } catch {
      /* ignore */
    }

    // 2) Fall back to the API (works when persisted server-side, e.g. dev).
    (async () => {
      try {
        const res = await fetch(`/api/orcamento/${id}`, { cache: "no-store" });
        if (res.ok && !cancelled) setQuote(await res.json());
      } catch {
        /* ignore — generic confirmation will be shown */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-foreground/30 text-[10px] tracking-[0.5em] uppercase animate-pulse">
          A carregar…
        </p>
      </div>
    );
  }

  const cat = quote ? CATEGORIES.find((c) => c.id === quote.category) : null;
  const et =
    quote && quote.category && quote.eventType
      ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)
      : null;
  const pkg = quote ? PACKAGES.find((p) => p.id === quote.packageTier) : null;
  const status = STATUS_LABELS[quote?.status ?? "pendente"] ?? STATUS_LABELS.pendente;

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-6 lg:px-16 py-24">
        {/* Success header */}
        <div className="flex flex-col items-start mb-16">
          <div className="w-16 h-16 rounded-full bg-moss/15 border border-moss/30 flex items-center justify-center text-moss text-2xl mb-10">
            ✓
          </div>
          <p className="text-foreground/28 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center gap-3">
            <span className="w-5 h-px bg-moss/50" />
            Pedido enviado com sucesso
          </p>
          <h1
            className="text-foreground font-bold leading-[0.9] mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 5vw, 64px)" }}
          >
            Recebemos o<br />
            <span className="text-moss">vosso pedido.</span>
          </h1>
          <p className="text-foreground/45 text-sm leading-[1.85] max-w-lg">
            A nossa equipa irá analisar o pedido e entrar em contacto em menos de 24 horas úteis com
            uma proposta personalizada.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8">
          {/* Quote details */}
          <div className="border border-foreground/10 rounded-sm">
            {/* ID + Status */}
            <div className="px-6 py-5 border-b border-foreground/8 flex items-center justify-between">
              <div>
                <p className="text-foreground/22 text-[10px] tracking-[0.4em] uppercase mb-1">
                  Referência do Pedido
                </p>
                <p className="text-foreground/70 font-mono text-sm">{id}</p>
              </div>
              <span className={`text-xs tracking-wide ${status.color}`}>● {status.label}</span>
            </div>

            {/* Event details — only when we have the data */}
            {quote ? (
              <>
                <div className="px-6 py-5 grid grid-cols-2 gap-4 border-b border-foreground/8">
                  <div>
                    <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                      Categoria
                    </p>
                    <p className="text-foreground/65 text-sm">{cat?.label ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                      Tipo
                    </p>
                    <p className="text-foreground/65 text-sm">
                      {et?.label ?? quote.eventName ?? "—"}
                    </p>
                  </div>
                  <div>
                    <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                      Pacote
                    </p>
                    <p className="text-foreground/65 text-sm">{pkg?.label ?? "—"}</p>
                  </div>
                  <div>
                    <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                      Convidados
                    </p>
                    <p className="text-foreground/65 text-sm">{quote.guests}</p>
                  </div>
                  {quote.date && (
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                        Data
                      </p>
                      <p className="text-foreground/65 text-sm">
                        {new Date(quote.date + "T12:00:00").toLocaleDateString("pt-PT", {
                          day: "numeric",
                          month: "long",
                          year: "numeric",
                        })}
                      </p>
                    </div>
                  )}
                  {quote.location && (
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                        Local
                      </p>
                      <p className="text-foreground/65 text-sm">{quote.location}</p>
                    </div>
                  )}
                </div>

                {quote.addons?.length > 0 && (
                  <div className="px-6 py-5 border-b border-foreground/8">
                    <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-3">
                      Serviços Adicionais
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {quote.addons.map((a) => (
                        <span
                          key={a.id}
                          className="text-[10px] tracking-[0.1em] px-2.5 py-1 rounded-sm bg-foreground/6 text-foreground/40 capitalize"
                        >
                          {a.name} · {a.tier}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="px-6 py-5 border-b border-foreground/8">
                <p className="text-foreground/40 text-sm leading-relaxed">
                  Guarde a referência acima. Enviámos os detalhes para a nossa equipa e entraremos
                  em contacto consigo brevemente.
                </p>
              </div>
            )}

            {/* Footer note */}
            <div className="px-6 py-5 flex items-center gap-3">
              <span className="w-1 h-1 rounded-full bg-moss/50 shrink-0" />
              <p className="text-foreground/30 text-[10px] leading-relaxed">
                Proposta formal enviada após análise do pedido pela nossa equipa.
              </p>
            </div>
          </div>

          {/* Next steps + contact */}
          <div className="flex flex-col gap-6">
            <div className="border border-foreground/10 rounded-sm p-5">
              <p className="text-foreground/22 text-[10px] tracking-[0.4em] uppercase mb-5">
                Próximos passos
              </p>
              <div className="flex flex-col gap-4">
                {[
                  {
                    n: "01",
                    label: "Análise do pedido",
                    desc: "A nossa equipa analisa todos os detalhes.",
                  },
                  {
                    n: "02",
                    label: "Proposta personalizada",
                    desc: "Enviamos uma proposta detalhada por email.",
                  },
                  {
                    n: "03",
                    label: "Reunião de briefing",
                    desc: "Marcamos uma reunião para alinhar a visão.",
                  },
                  { n: "04", label: "Produção do evento", desc: "Tomamos conta de tudo para si." },
                ].map((item) => (
                  <div key={item.n} className="flex gap-4">
                    <span className="text-foreground/18 text-xs font-mono w-5 shrink-0 mt-0.5">
                      {item.n}
                    </span>
                    <div>
                      <p className="text-foreground/60 text-xs font-medium mb-0.5">{item.label}</p>
                      <p className="text-foreground/28 text-[11px] leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="border border-moss/20 bg-moss/8 rounded-sm p-5">
              <div className="w-5 h-px bg-moss/40 mb-4" />
              <p className="text-foreground/50 text-xs leading-relaxed mb-4">
                Para qualquer questão, pode contactar-nos directamente:
              </p>
              <div className="flex flex-col gap-2">
                <a
                  href="mailto:liquen.alentejo@gmail.com"
                  className="text-moss text-xs hover:underline"
                >
                  liquen.alentejo@gmail.com
                </a>
                <a href="tel:+351919259820" className="text-moss text-xs hover:underline">
                  +351 919 259 820
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="mt-12 flex flex-wrap gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-8 py-3.5 btn-shine bg-moss text-cream text-[11px] tracking-[0.2em] uppercase rounded-sm hover:bg-moss-dark transition-colors shadow-lg shadow-moss/15"
          >
            Voltar ao Início →
          </Link>
          <Link
            href="/orcamento"
            className="inline-flex items-center gap-2 px-8 py-3.5 border border-foreground/20 text-foreground/50 text-[11px] tracking-[0.2em] uppercase rounded-sm hover:border-foreground/40 hover:text-foreground/70 transition-colors"
          >
            Novo Pedido
          </Link>
        </div>
      </div>
    </div>
  );
}
