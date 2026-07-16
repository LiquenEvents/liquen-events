"use client";

import { useEffect, useMemo, useState } from "react";
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
  rejeitado: "text-foreground/70",
};

// Celebration petals — drift down once on arrival. Fixed config (no RNG) so it's
// deterministic; rendered client-only so it never blocks the server HTML.
const PETALS = [
  { l: 6, w: 16, h: 11, c: "moss-light", d: 7.5, dl: 0.1, r: 300, x: 40, o: 0.85 },
  { l: 14, w: 12, h: 9, c: "gold", d: 8.5, dl: 1.2, r: -260, x: -30, o: 0.7 },
  { l: 22, w: 19, h: 13, c: "moss", d: 6.8, dl: 0.5, r: 340, x: 60, o: 0.6 },
  { l: 30, w: 13, h: 10, c: "cream-dark", d: 9, dl: 2.1, r: 220, x: -50, o: 0.95 },
  { l: 38, w: 15, h: 10, c: "moss-light", d: 7.2, dl: 0.9, r: -300, x: 30, o: 0.75 },
  { l: 46, w: 11, h: 9, c: "gold", d: 8, dl: 1.7, r: 280, x: 45, o: 0.65 },
  { l: 54, w: 17, h: 13, c: "moss", d: 6.5, dl: 0.3, r: -320, x: -40, o: 0.55 },
  { l: 62, w: 13, h: 10, c: "moss-light", d: 8.8, dl: 2.4, r: 260, x: 55, o: 0.8 },
  { l: 70, w: 12, h: 9, c: "cream-dark", d: 7.6, dl: 1.0, r: -240, x: -35, o: 0.9 },
  { l: 78, w: 16, h: 11, c: "gold", d: 9.2, dl: 0.7, r: 300, x: 40, o: 0.6 },
  { l: 85, w: 15, h: 10, c: "moss", d: 7, dl: 1.9, r: -280, x: -55, o: 0.6 },
  { l: 92, w: 12, h: 9, c: "moss-light", d: 8.2, dl: 0.4, r: 320, x: 30, o: 0.75 },
  { l: 10, w: 10, h: 8, c: "gold", d: 9.5, dl: 3.0, r: 240, x: -30, o: 0.6 },
  { l: 50, w: 13, h: 10, c: "cream-dark", d: 8.6, dl: 3.4, r: -300, x: 50, o: 0.85 },
  { l: 66, w: 17, h: 13, c: "moss", d: 7.4, dl: 2.8, r: 280, x: -45, o: 0.55 },
  { l: 34, w: 12, h: 9, c: "moss-light", d: 8, dl: 3.7, r: -260, x: 35, o: 0.75 },
];

export default function ConfirmacaoClient({ id }: { id: string }) {
  const { locale, t } = useTranslations();
  const tc = t.confirmacao;
  const [quote, setQuote] = useState<Quote | null>(null);
  const [loading, setLoading] = useState(true);
  // Client-only, so the petals play once on arrival without an SSR/hydration
  // mismatch (the server renders none).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

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

  const cat = quote ? CATEGORIES.find((c) => c.id === quote.category) : null;
  const et =
    quote && quote.category && quote.eventType
      ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)
      : null;

  // "Add to calendar" — an all-day event on the client's chosen date, offered
  // as a downloadable .ics (works with Apple/Google/Outlook calendars).
  const icsHref = useMemo(() => {
    if (!quote?.date || !/^\d{4}-\d{2}-\d{2}$/.test(quote.date)) return null;
    const start = quote.date.replace(/-/g, "");
    const next = new Date(quote.date + "T00:00:00");
    next.setDate(next.getDate() + 1);
    const end = `${next.getFullYear()}${String(next.getMonth() + 1).padStart(2, "0")}${String(
      next.getDate(),
    ).padStart(2, "0")}`;
    const title = `${et?.label ?? cat?.label ?? "Evento"} — Líquen Events`;
    // Escape per RFC 5545 §3.3.11 — a stray comma/semicolon in the copy would
    // otherwise split the value and corrupt the event.
    const esc = (s: string) =>
      s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
    // DTSTAMP is REQUIRED in a VEVENT; strict parsers (Outlook) reject its
    // absence. Client-only render (quote is fetched), so new Date() is safe.
    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Liquen Events//Orcamento//PT",
      "BEGIN:VEVENT",
      `UID:${id}@liquen-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${esc(title)}`,
      `DESCRIPTION:${esc(tc.footerNote)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    return "data:text/calendar;charset=utf-8," + encodeURIComponent(ics);
  }, [quote?.date, et, cat, id, tc.footerNote]);

  if (loading) {
    return (
      <div className="min-h-screen bg-surface flex items-center justify-center">
        <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase animate-pulse">
          {tc.loading}
        </p>
      </div>
    );
  }

  const statusKey = quote?.status ?? "pendente";
  const status = {
    label: (tc.statusLabels as Record<string, string>)[statusKey] ?? tc.statusLabels.pendente,
    color: STATUS_COLORS[statusKey] ?? STATUS_COLORS.pendente,
  };
  const firstName = quote?.name?.trim().split(/\s+/)[0] || "";
  // Address the client by name in the lead when we know it.
  const lead = firstName
    ? `${firstName}, ${tc.lead.charAt(0).toLowerCase()}${tc.lead.slice(1)}`
    : tc.lead;

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

  const explore = [
    {
      href: localizeHref("/galeria", locale),
      label: tc.exploreGaleria,
      sub: tc.exploreGaleriaSub,
      external: false,
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 16l4.5-4.5a2 2 0 0 1 2.8 0L16 16m-2-2l1.5-1.5a2 2 0 0 1 2.8 0L20 14M4 6h16v12H4z"
        />
      ),
    },
    {
      href: SITE.instagram,
      label: tc.exploreInsta,
      sub: tc.exploreInstaSub,
      external: true,
      icon: (
        <>
          <rect x="4" y="4" width="16" height="16" rx="4" />
          <circle cx="12" cy="12" r="3.2" />
          <circle cx="17" cy="7" r="0.6" fill="currentColor" />
        </>
      ),
    },
    {
      href: localizeHref("/clientes", locale),
      label: tc.exploreClientes,
      sub: tc.exploreClientesSub,
      external: false,
      icon: (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 21s-7-4.35-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 3.5C19 16.65 12 21 12 21z"
        />
      ),
    },
  ];

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

      {/* Celebration petals — drift down once, in front but featherlight. */}
      {mounted && (
        <div aria-hidden className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
          {PETALS.map((p, i) => (
            <span
              key={i}
              className="petal"
              style={
                {
                  left: `${p.l}%`,
                  width: p.w,
                  height: p.h,
                  background: `var(--color-${p.c})`,
                  animationDuration: `${p.d}s`,
                  animationDelay: `${p.dl}s`,
                  "--petal-rot": `${p.r}deg`,
                  "--petal-x": `${p.x}px`,
                  "--petal-op": p.o,
                } as React.CSSProperties
              }
            />
          ))}
        </div>
      )}

      <div className="relative z-10 max-w-5xl mx-auto px-6 lg:px-16 py-24 lg:py-28">
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
            <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase mb-6 flex items-center gap-3">
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
            <p className="text-foreground/72 text-[15px] leading-[1.9] max-w-xl">{lead}</p>
          </AnimateIn>

          <AnimateIn from="bottom" delay={230}>
            <p
              className="mt-4 text-moss-dark text-[15px] italic max-w-xl"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {tc.greetingWarm}
            </p>
          </AnimateIn>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] items-start gap-6 lg:gap-8">
          {/* ── Quote details ── */}
          <AnimateIn from="bottom" delay={220}>
            <div className="rounded-2xl border border-foreground/10 bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04),0_12px_40px_-24px_rgba(42,38,32,0.25)]">
              {/* Reference + status */}
              <div className="flex items-start justify-between gap-4 px-7 pt-7 pb-6 border-b border-foreground/8">
                <div>
                  <p className="text-foreground/72 text-[10px] tracking-[0.4em] uppercase mb-2">
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
                      <dt className="text-foreground/72 text-[10px] tracking-[0.28em] uppercase shrink-0">
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
                  <p className="text-foreground/72 text-sm leading-relaxed">{tc.noDataNote}</p>
                </div>
              )}

              {/* Save the date */}
              {icsHref && (
                <div className="px-7 pb-5 pt-1">
                  <a
                    href={icsHref}
                    download="liquen-events.ics"
                    className="inline-flex items-center gap-2 text-moss-dark text-[12px] font-medium hover:text-moss transition-colors"
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={1.6}
                      viewBox="0 0 24 24"
                    >
                      <rect x="4" y="5" width="16" height="16" rx="2" />
                      <path strokeLinecap="round" d="M8 3v4M16 3v4M4 10h16M12 14v4M10 16h4" />
                    </svg>
                    {tc.saveDate}
                  </a>
                </div>
              )}

              {/* Footer note */}
              <div className="flex items-center gap-3 px-7 py-5 border-t border-foreground/8">
                <span className="h-1 w-1 rounded-full bg-gold shrink-0" />
                <p className="text-foreground/72 text-[11px] leading-relaxed">{tc.footerNote}</p>
              </div>
            </div>
          </AnimateIn>

          {/* ── Next steps + contact ── */}
          <div className="flex flex-col gap-6">
            <AnimateIn from="bottom" delay={280}>
              <div className="rounded-2xl border border-foreground/10 bg-white p-7">
                <p className="text-foreground/68 text-[10px] tracking-[0.4em] uppercase mb-6">
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
                        <p className="text-foreground/72 text-[11px] leading-relaxed">
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
                <p className="text-foreground/72 text-[13px] leading-relaxed mb-4">
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

        {/* ── While you wait — explore our world ── */}
        <AnimateIn from="bottom" delay={380}>
          <div className="mt-16">
            <div className="flex items-center gap-3 mb-6">
              <span className="w-6 h-px bg-gold/60 shrink-0" />
              <div>
                <p
                  className="text-foreground/85 text-lg leading-tight"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {tc.whileTitle}
                </p>
                <p className="text-foreground/72 text-[13px] mt-0.5">{tc.whileLead}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {explore.map((c) => {
                const inner = (
                  <>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-moss/8 text-moss">
                      <svg
                        className="h-[18px] w-[18px]"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        viewBox="0 0 24 24"
                      >
                        {c.icon}
                      </svg>
                    </span>
                    <div className="mt-4">
                      <p className="text-foreground/85 text-[14px] font-medium flex items-center gap-1.5">
                        {c.label}
                        <span className="text-moss transition-transform duration-300 group-hover:translate-x-1">
                          →
                        </span>
                      </p>
                      <p className="text-foreground/72 text-[12px] mt-1 leading-relaxed">{c.sub}</p>
                    </div>
                  </>
                );
                const cls =
                  "group block rounded-2xl border border-foreground/10 bg-white p-6 transition-all duration-300 hover:border-moss/30 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_-20px_rgba(42,38,32,0.3)]";
                return c.external ? (
                  <a
                    key={c.label}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cls}
                  >
                    {inner}
                  </a>
                ) : (
                  <Link key={c.label} href={c.href} className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </div>
        </AnimateIn>

        {/* ── CTA ── */}
        <AnimateIn from="bottom" delay={430}>
          <div className="mt-14 flex flex-wrap gap-4">
            <Link
              href={localizeHref("/", locale)}
              className="inline-flex items-center gap-2 px-9 py-4 btn-shine bg-moss text-white text-[11px] tracking-[0.2em] uppercase rounded-full hover:bg-moss-dark transition-colors shadow-lg shadow-moss/15"
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

        {/* ── Personal sign-off ── */}
        <AnimateIn from="fade" delay={480}>
          <div className="mt-16 pt-8 border-t border-foreground/8">
            <p className="text-foreground/72 text-[13px]">{tc.signOff}</p>
            <p
              className="text-moss text-2xl mt-1"
              style={{ fontFamily: "var(--font-playfair)", fontStyle: "italic" }}
            >
              {tc.signName}
            </p>
          </div>
        </AnimateIn>
      </div>
    </div>
  );
}
