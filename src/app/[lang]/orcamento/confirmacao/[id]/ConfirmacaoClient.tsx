"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Quote } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { SITE } from "@/lib/site";
import { useTranslations } from "@/components/LocaleProvider";
import AnimateIn from "@/components/AnimateIn";
import { localizeHref } from "@/lib/i18n";

const STATUS_COLORS: Record<string, string> = {
  pendente: "text-moss",
  em_revisao: "text-moss",
  cotado: "text-moss",
  aceite: "text-moss",
  rejeitado: "text-foreground/35",
};

export default function ConfirmacaoClient({ id }: { id: string }) {
  const { locale, t } = useTranslations();
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
        <p className="text-foreground/30 text-[10px] tracking-[0.5em] uppercase animate-pulse">
          {tc.loading}
        </p>
      </div>
    );
  }

  const cat = quote ? CATEGORIES.find((c) => c.id === quote.category) : null;
  const et =
    quote && quote.category && quote.eventType
      ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)
      : null;
  const statusKey = quote?.status ?? "pendente";
  const status = {
    label: (tc.statusLabels as Record<string, string>)[statusKey] ?? tc.statusLabels.pendente,
    color: STATUS_COLORS[statusKey] ?? STATUS_COLORS.pendente,
  };

  // Only the fields we actually collect — packages/add-ons aren't part of the
  // flow, so they never appear here.
  const details: { label: string; value: string }[] = quote
    ? [
        { label: tc.categoria, value: cat?.label ?? "" },
        { label: tc.tipo, value: et?.label ?? quote.eventName ?? "" },
        { label: tc.convidados, value: quote.guests ? String(quote.guests) : "" },
        {
          label: tc.data,
          value: quote.date
            ? new Date(quote.date + "T12:00:00").toLocaleDateString(tc.dateLocale, {
                day: "numeric",
                month: "long",
                year: "numeric",
              })
            : "",
        },
        { label: tc.local, value: quote.location ?? "" },
      ].filter((d) => d.value)
    : [];

  return (
    <div className="relative min-h-screen overflow-hidden bg-surface">
      {/* Soft moss wash at the very top for a calm, premium arrival. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px]"
        style={{
          background:
            "radial-gradient(120% 80% at 50% -20%, color-mix(in srgb, var(--color-moss) 12%, transparent), transparent 70%)",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6 lg:px-16 py-24 lg:py-28">
        {/* ── Success header ── */}
        <div className="flex flex-col items-start mb-16 lg:mb-20">
          <AnimateIn from="fade">
            <span className="mb-9 inline-flex h-16 w-16 items-center justify-center rounded-full bg-moss/10 ring-1 ring-moss/25">
              <svg viewBox="0 0 52 52" className="h-9 w-9" fill="none" aria-hidden>
                <circle
                  className="confirm-ring"
                  cx="26"
                  cy="26"
                  r="24"
                  stroke="var(--color-moss)"
                  strokeWidth="1.5"
                  strokeOpacity="0.45"
                />
                <path
                  className="confirm-check"
                  d="M15 27l7.5 7.5L38 18"
                  stroke="var(--color-moss)"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          </AnimateIn>

          <AnimateIn from="bottom" delay={60}>
            <p className="text-foreground/30 text-[10px] tracking-[0.5em] uppercase mb-6 flex items-center gap-3">
              <span className="w-6 h-px bg-gold/60" />
              {tc.successEyebrow}
            </p>
          </AnimateIn>

          <AnimateIn from="bottom" delay={120}>
            <h1
              className="text-foreground font-bold leading-[0.92] mb-7"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 5.4vw, 72px)" }}
            >
              {tc.titleLine1}
              <br />
              <span className="text-moss">{tc.titleMoss}</span>
            </h1>
          </AnimateIn>

          <AnimateIn from="bottom" delay={180}>
            <p className="text-foreground/60 text-[15px] leading-[1.9] max-w-xl">{tc.lead}</p>
          </AnimateIn>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] items-start gap-6 lg:gap-8">
          {/* ── Quote details ── */}
          <AnimateIn from="bottom" delay={220}>
            <div className="rounded-2xl border border-foreground/10 bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04),0_12px_40px_-24px_rgba(42,38,32,0.25)]">
              {/* Reference + status */}
              <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-6 border-b border-foreground/8">
                <div>
                  <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
                    {tc.refLabel}
                  </p>
                  <p className="text-foreground/80 font-mono text-[15px] tracking-tight">{id}</p>
                </div>
                <span
                  className={`shrink-0 inline-flex items-center gap-2 rounded-full bg-moss/8 px-3 py-1.5 text-[11px] tracking-wide ${status.color}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {status.label}
                </span>
              </div>

              {/* Event details — hairline-separated definition list */}
              {details.length > 0 ? (
                <dl className="px-7 py-2">
                  {details.map((d, i) => (
                    <div
                      key={d.label}
                      className={`flex items-baseline justify-between gap-6 py-4 ${
                        i < details.length - 1 ? "border-b border-foreground/8" : ""
                      }`}
                    >
                      <dt className="text-foreground/35 text-[10px] tracking-[0.28em] uppercase shrink-0">
                        {d.label}
                      </dt>
                      <dd className="text-foreground/85 text-[15px] text-right leading-snug">
                        {d.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <div className="px-7 py-6">
                  <p className="text-foreground/60 text-sm leading-relaxed">{tc.noDataNote}</p>
                </div>
              )}

              {/* Footer note */}
              <div className="flex items-center gap-3 px-7 py-5 border-t border-foreground/8">
                <span className="h-1 w-1 rounded-full bg-gold shrink-0" />
                <p className="text-foreground/50 text-[11px] leading-relaxed">{tc.footerNote}</p>
              </div>
            </div>
          </AnimateIn>

          {/* ── Next steps + contact ── */}
          <div className="flex flex-col gap-6">
            <AnimateIn from="bottom" delay={280}>
              <div className="rounded-2xl border border-foreground/10 bg-white p-7">
                <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-6">
                  {tc.proximosPassos}
                </p>
                <ol className="relative flex flex-col gap-6">
                  {/* Connecting rail behind the numbered nodes. */}
                  <span
                    aria-hidden
                    className="absolute left-[13px] top-2 bottom-2 w-px bg-foreground/10"
                  />
                  {tc.steps.map((item, i) => (
                    <li key={i} className="relative flex gap-4">
                      <span className="relative z-10 flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full border border-moss/30 bg-white text-moss text-[10px] font-medium tabular-nums">
                        {i + 1}
                      </span>
                      <div className="pt-0.5">
                        <p className="text-foreground/80 text-[13px] font-medium mb-0.5">
                          {item.label}
                        </p>
                        <p className="text-foreground/50 text-[11px] leading-relaxed">
                          {item.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </AnimateIn>

            <AnimateIn from="bottom" delay={340}>
              <div className="rounded-2xl border border-moss/20 bg-moss/[0.06] p-7">
                <div className="w-6 h-px bg-gold/60 mb-4" />
                <p className="text-foreground/60 text-[13px] leading-relaxed mb-4">
                  {tc.contactIntro}
                </p>
                <div className="flex flex-col gap-2.5">
                  <a
                    href={`mailto:${SITE.email}`}
                    className="text-moss-dark text-[13px] hover:text-moss transition-colors"
                  >
                    {SITE.email}
                  </a>
                  <a
                    href={`tel:${SITE.phone}`}
                    className="text-moss-dark text-[13px] hover:text-moss transition-colors"
                  >
                    {SITE.phoneDisplay}
                  </a>
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>

        {/* ── CTA ── */}
        <AnimateIn from="bottom" delay={400}>
          <div className="mt-14 flex flex-wrap gap-4">
            <Link
              href={localizeHref("/", locale)}
              className="inline-flex items-center gap-2 px-9 py-4 btn-shine bg-moss text-cream text-[11px] tracking-[0.2em] uppercase rounded-full hover:bg-moss-dark transition-colors shadow-lg shadow-moss/15"
            >
              {tc.voltarInicio} →
            </Link>
            <Link
              href={localizeHref("/orcamento", locale)}
              className="inline-flex items-center gap-2 px-9 py-4 border border-foreground/20 text-foreground/55 text-[11px] tracking-[0.2em] uppercase rounded-full hover:border-foreground/40 hover:text-foreground/75 transition-colors"
            >
              {tc.novoPedido}
            </Link>
          </div>
        </AnimateIn>
      </div>
    </div>
  );
}
