"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quote } from "../../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "../../data";
import { SITE } from "@/lib/site";
import { useTranslations } from "@/components/LocaleProvider";
import AnimateIn from "@/components/AnimateIn";

const STATUS_COLORS: Record<string, string> = {
  pendente: "text-foreground/60",
  em_revisao: "text-moss",
  cotado: "text-moss",
  aceite: "text-moss",
  rejeitado: "text-foreground/35",
};

export default function ConfirmacaoClient({ id }: { id: string }) {
  const { t } = useTranslations();
  const tc = t.confirmacao;
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
        <div className="flex flex-col items-center gap-5">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full rounded-full bg-moss opacity-60 animate-ping" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-moss" />
          </span>
          <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase">{tc.loading}</p>
        </div>
      </div>
    );
  }

  const cat = quote ? CATEGORIES.find((c) => c.id === quote.category) : null;
  const et =
    quote && quote.category && quote.eventType
      ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)
      : null;
  const pkg = quote ? PACKAGES.find((p) => p.id === quote.packageTier) : null;
  const statusKey = quote?.status ?? "pendente";
  const status = {
    label: (tc.statusLabels as Record<string, string>)[statusKey] ?? tc.statusLabels.pendente,
    color: STATUS_COLORS[statusKey] ?? STATUS_COLORS.pendente,
  };

  return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-4xl mx-auto px-6 lg:px-16 py-24">
        {/* Success header */}
        <div className="flex flex-col items-start mb-16">
          <div className="check-pop w-16 h-16 rounded-full bg-moss/15 border border-moss/30 flex items-center justify-center text-moss text-2xl mb-10">
            ✓
          </div>
          <p className="anim-1 text-foreground/28 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center gap-3">
            <span className="w-5 h-px bg-moss/50" />
            {tc.successEyebrow}
          </p>
          <h1
            className="anim-2 text-foreground font-bold leading-[0.9] mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 5vw, 64px)" }}
          >
            {tc.titleLine1}
            <br />
            <span className="text-moss">{tc.titleMoss}</span>
          </h1>
          <p className="anim-3 text-foreground/68 text-sm leading-[1.85] max-w-lg">{tc.lead}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-8">
          {/* Quote details */}
          <AnimateIn delay={200}>
            <div className="border border-foreground/10 rounded-sm">
              {/* ID + Status */}
              <div className="px-6 py-5 border-b border-foreground/8 flex items-center justify-between">
                <div>
                  <p className="text-foreground/22 text-[10px] tracking-[0.4em] uppercase mb-1">
                    {tc.refLabel}
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
                        {tc.categoria}
                      </p>
                      <p className="text-foreground/65 text-sm">{cat?.label ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                        {tc.tipo}
                      </p>
                      <p className="text-foreground/65 text-sm">
                        {et?.label ?? quote.eventName ?? "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                        {tc.pacote}
                      </p>
                      <p className="text-foreground/65 text-sm">{pkg?.label ?? "—"}</p>
                    </div>
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                        {tc.convidados}
                      </p>
                      <p className="text-foreground/65 text-sm">{quote.guests}</p>
                    </div>
                    {quote.date && (
                      <div>
                        <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                          {tc.data}
                        </p>
                        <p className="text-foreground/65 text-sm">
                          {new Date(quote.date + "T12:00:00").toLocaleDateString(tc.dateLocale, {
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
                          {tc.local}
                        </p>
                        <p className="text-foreground/65 text-sm">{quote.location}</p>
                      </div>
                    )}
                  </div>

                  {quote.addons?.length > 0 && (
                    <div className="px-6 py-5 border-b border-foreground/8">
                      <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-3">
                        {tc.adicionais}
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
                  <p className="text-foreground/68 text-sm leading-relaxed">{tc.noDataNote}</p>
                </div>
              )}

              {/* Footer note */}
              <div className="px-6 py-5 flex items-center gap-3">
                <span className="w-1 h-1 rounded-full bg-moss/50 shrink-0" />
                <p className="text-foreground/60 text-[10px] leading-relaxed">{tc.footerNote}</p>
              </div>
            </div>
          </AnimateIn>

          {/* Next steps + contact */}
          <AnimateIn delay={280}>
            <div className="flex flex-col gap-6">
              <div className="border border-foreground/10 rounded-sm p-5">
                <p className="text-foreground/22 text-[10px] tracking-[0.4em] uppercase mb-5">
                  {tc.proximosPassos}
                </p>
                <div className="flex flex-col gap-4">
                  {tc.steps.map((item, i) => (
                    <div key={i} className="flex gap-4">
                      <span className="text-foreground/18 text-xs font-mono w-5 shrink-0 mt-0.5">
                        {`0${i + 1}`}
                      </span>
                      <div>
                        <p className="text-foreground/72 text-xs font-medium mb-0.5">
                          {item.label}
                        </p>
                        <p className="text-foreground/60 text-[11px] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border border-moss/20 bg-moss/8 rounded-sm p-5">
                <div className="w-5 h-px bg-moss/40 mb-4" />
                <p className="text-foreground/68 text-xs leading-relaxed mb-4">{tc.contactIntro}</p>
                <div className="flex flex-col gap-2">
                  <a href={`mailto:${SITE.email}`} className="text-moss text-xs hover:underline">
                    {SITE.email}
                  </a>
                  <a href={`tel:${SITE.phone}`} className="text-moss text-xs hover:underline">
                    {SITE.phoneDisplay}
                  </a>
                </div>
              </div>
            </div>
          </AnimateIn>
        </div>

        {/* CTA */}
        <AnimateIn delay={360}>
          <div className="mt-12 flex flex-wrap gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 px-8 py-3.5 btn-shine bg-moss text-cream text-[11px] tracking-[0.2em] uppercase rounded-sm hover:bg-moss-dark transition-colors shadow-lg shadow-moss/15"
            >
              {tc.voltarInicio} →
            </Link>
            <Link
              href="/orcamento"
              className="inline-flex items-center gap-2 px-8 py-3.5 border border-foreground/20 text-foreground/50 text-[11px] tracking-[0.2em] uppercase rounded-sm hover:border-foreground/40 hover:text-foreground/70 transition-colors"
            >
              {tc.novoPedido}
            </Link>
          </div>
        </AnimateIn>
      </div>
    </div>
  );
}
