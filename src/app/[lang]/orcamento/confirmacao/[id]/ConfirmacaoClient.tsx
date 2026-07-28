"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Quote } from "@/lib/orcamento/types";
import {
  CATEGORIES,
  EVENT_TYPES_BY_CATEGORY,
  QUOTE_EVENT_OPTIONS,
  isPluralRegister,
} from "@/lib/orcamento/data";
import { SITE } from "@/lib/site";
import { waHref } from "@/data";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { useTranslations } from "@/components/LocaleProvider";
import AnimateIn from "@/components/AnimateIn";
import { fill, localizeHref } from "@/lib/i18n";
import type { Dict } from "@/lib/i18n";
import { daysUntil, isHighSeason, longDate, replyByDate, replyByOn } from "@/lib/workdays";
import { track } from "@/lib/track";
import { reportLeadConversion } from "@/lib/ads-conversion";
import { CONFIRMACAO_PHOTOS, type ConfirmacaoPhotoKey } from "./photos";

const STATUS_COLORS: Record<string, string> = {
  pendente: "text-moss-dark",
  em_revisao: "text-moss-dark",
  cotado: "text-moss-dark",
  aceite: "text-moss-dark",
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

export default function ConfirmacaoClient({
  id,
  confirmacao,
  eventTypeLabels,
  blur,
}: {
  id: string;
  confirmacao: Dict["confirmacao"];
  /** Localized labels for the form's six options, in QUOTE_EVENT_OPTIONS order. */
  eventTypeLabels: readonly string[];
  /** Blur placeholders for CONFIRMACAO_PHOTOS, resolved server-side. */
  blur: Record<ConfirmacaoPhotoKey, string>;
}) {
  // locale comes from the site-wide chrome context; the confirmacao namespace
  // is passed in from this route's server page.
  const { locale, t } = useTranslations();
  const tc = confirmacao;
  const [quote, setQuote] = useState<Quote | null>(null);
  // Three states, not two. "unknown" = we could neither read the hand-off nor
  // find the quote server-side, so this id is bogus/expired: we must NOT render
  // a celebratory success page (and must NOT report a conversion) for it.
  const [pageState, setPageState] = useState<"loading" | "ok" | "unknown">("loading");
  const loading = pageState === "loading";
  // After the client-side hand-off from the form, move focus to the confirmation
  // heading so the success is announced and keyboard focus isn't stranded on
  // <body> (WCAG 2.4.3 Focus Order).
  const h1Ref = useRef<HTMLHeadingElement>(null);
  // Client-only, so the petals play once on arrival without an SSR/hydration
  // mismatch (the server renders none).
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Funnel completion: reaching this page IS the successful submit landing, so
  // fire it here to measure submit → confirmation (the back half of the funnel
  // was previously invisible).
  //
  // CRITICAL: gated on a CONFIRMED quote (`status === "ok"`). Firing on mount
  // meant any URL under this route — a mistyped link, a stale link to a deleted
  // quote, or the throwaway id the honeypot hands a bot — reported a
  // `generate_lead` to Google Ads, poisoning smart bidding with phantom
  // conversions. Both events are deduped by quote id so a refresh or a re-open
  // in the same tab can't double-count.
  useEffect(() => {
    if (pageState !== "ok") return;
    let user: { email?: string; phone?: string } | undefined;
    try {
      if (sessionStorage.getItem(`liquen-confirmed-${id}`)) return;
      sessionStorage.setItem(`liquen-confirmed-${id}`, "1");
      const cached = sessionStorage.getItem(`liquen-quote-${id}`);
      if (cached) {
        const q = JSON.parse(cached) as { email?: string; phone?: string };
        user = { email: q.email, phone: q.phone };
      }
    } catch {
      /* storage blocked — still report once for this mount */
    }
    track("QuoteConfirmed");
    // Enhanced Conversions: reportLeadConversion only uses the contact data when
    // the visitor consented, and passes the id as transaction_id so Google
    // dedupes server-side across tabs and devices too.
    reportLeadConversion(id, user);
  }, [id, pageState]);
  useEffect(() => {
    if (!loading) h1Ref.current?.focus();
  }, [loading]);

  useEffect(() => {
    let cancelled = false;

    // 1) Prefer the hand-off saved by the wizard (works on any host).
    try {
      const cached = sessionStorage.getItem(`liquen-quote-${id}`);
      if (cached) {
        setQuote(JSON.parse(cached));
        setPageState("ok");
        return;
      }
    } catch {
      /* ignore */
    }

    // 2) Fall back to the API — the quote IS persisted server-side in
    //    production, so this is the normal path for a reload, a second device,
    //    or a forwarded link. Bounded by a timeout so a stalled connection
    //    can't leave the page on "a carregar…" indefinitely.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    (async () => {
      try {
        const res = await fetch(`/api/orcamento/${id}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        // Read the body BEFORE re-checking `cancelled`, then guard the write —
        // otherwise a response for a previous id could land on the new one.
        if (!res.ok) {
          if (!cancelled) setPageState("unknown");
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setQuote(data);
          setPageState("ok");
        }
      } catch {
        if (!cancelled) setPageState("unknown");
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [id]);

  const cat = quote ? CATEGORIES.find((c) => c.id === quote.category) : null;
  const et =
    quote && quote.category && quote.eventType
      ? EVENT_TYPES_BY_CATEGORY[quote.category]?.find((e) => e.id === quote.eventType)
      : null;

  // The event type in the VISITOR's language. The labels on the pricing
  // taxonomy (EVENT_TYPES_BY_CATEGORY) are Portuguese-only, so an English
  // visitor was reading "Casamentos" on an otherwise English page. Resolve the
  // form option's index instead and read the localized label from the dict;
  // fall back to the taxonomy for quotes created in the back office, whose
  // event type may not be one of the six the public form offers.
  const optIdx = quote
    ? QUOTE_EVENT_OPTIONS.findIndex((o) =>
        quote.eventType ? o.eventType === quote.eventType : o.label === quote.eventName,
      )
    : -1;
  const typeLabel =
    (optIdx >= 0 ? eventTypeLabels[optIdx] : undefined) ?? et?.label ?? quote?.eventName ?? "";

  // Plural ("o vosso pedido") for weddings and christenings, singular formal
  // otherwise — the same rule the confirmation email applies, so the page and
  // the inbox address the client the same way.
  const plural = isPluralRegister(quote?.eventType);
  const pick = (singular: string, pl: string) => (plural ? pl : singular);

  // One clock for the whole render, so the countdown and the reply-by promise
  // can't disagree by a day if the render straddles midnight.
  const now = useMemo(() => new Date(), []);
  // Anchor the promise to when the request was SENT, not to when this page is
  // being viewed — reopening the link a week later must not silently restart
  // the two working days.
  const sentAt = useMemo(() => {
    const parsed = quote?.submittedAt ? new Date(quote.submittedAt) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? parsed : now;
  }, [quote?.submittedAt, now]);

  const replyBy = useMemo(() => {
    if (!quote) return null;
    // Once the team has actually replied, the promise is history — showing it
    // would contradict the status pill right above it.
    if (quote.status !== "pendente" && quote.status !== "em_revisao") return null;
    const on = replyByOn(sentAt);
    const onDay = Date.UTC(on.getFullYear(), on.getMonth(), on.getDate());
    const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    // A date that has already gone by is worse than no date at all.
    if (onDay < today) return null;
    return replyByDate(sentAt, locale);
  }, [quote, sentAt, now, locale]);

  const eventDate = quote?.date ?? "";
  const countdown = eventDate ? daysUntil(eventDate, now) : null;
  const highSeason = isHighSeason(eventDate);

  // The form folds a "(Data ainda a definir)" marker into `notes` so the team
  // can segment early-stage leads. That's an internal signal — echoing it back
  // inside the client's own message made it look like we'd mangled their text.
  // Strip it here and let the Data row carry the meaning instead.
  const rawNotes = quote?.notes?.trim() ?? "";
  const openDate = !!quote && !eventDate;
  const clientMessage = openDate
    ? rawNotes.replace(/^\([^)\n]{1,60}\)(\n\n|$)/, "").trim()
    : rawNotes;

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
    const title = `${typeLabel || cat?.label || "Evento"} — Líquen Events`;
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
  }, [quote?.date, typeLabel, cat, id, tc.footerNote]);

  if (loading) {
    return (
      <div
        data-cream-page
        className="-mt-24 min-h-screen bg-cream pt-24 flex items-center justify-center"
      >
        <p
          role="status"
          className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase animate-pulse"
        >
          {tc.loading}
        </p>
      </div>
    );
  }

  // No hand-off AND no such quote server-side: this id is bogus or expired.
  // Show an honest panel — never the celebratory success page, which would
  // claim a request was received that never existed (and used to report a
  // phantom Google Ads conversion for it).
  if (pageState === "unknown") {
    return (
      <div
        data-cream-page
        className="-mt-24 min-h-screen bg-cream pt-24 flex items-center justify-center px-6 py-24"
      >
        <div className="max-w-md text-center">
          <h1
            ref={h1Ref}
            tabIndex={-1}
            className="font-display text-[clamp(26px,4vw,36px)] leading-[1.15] text-foreground focus:outline-none focus-quiet"
          >
            {tc.notFoundTitle}
          </h1>
          <p className="mt-5 text-[15px] leading-[1.8] text-foreground/72">{tc.notFoundBody}</p>
          <div className="mt-8 flex flex-col items-center gap-3 text-[14px]">
            <a href={`mailto:${SITE.email}`} className="link-line text-moss-dark">
              {SITE.email}
            </a>
            <a href={`tel:${SITE.phone}`} className="link-line text-moss-dark">
              {SITE.phoneDisplay}
            </a>
          </div>
          {/* Dark outline: this panel sits on cream, and the shared
              shared OUTLINE_LIGHT_BUTTON_CLASS is white-on-transparent — it was
              invisible here until you happened to hover it. */}
          <Link
            href={localizeHref("/", locale)}
            className="mt-10 inline-flex items-center gap-3 px-8 py-3.5 border border-foreground/25 text-foreground/80 text-[11px] tracking-[0.3em] uppercase hover:bg-foreground hover:text-cream hover:border-foreground transition-colors duration-300"
          >
            {tc.voltarInicio}
          </Link>
        </div>
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
  // flow, so they never appear here. "Categoria" is deliberately absent: it's
  // internal taxonomy ("Eventos Particulares"), it says nothing the type row
  // doesn't, and it only ever existed in Portuguese.
  const details: { label: string; value: string; note?: string }[] = quote
    ? [
        { label: tc.tipo, value: typeLabel },
        { label: tc.convidados, value: quote.guests ? String(quote.guests) : "" },
        {
          label: tc.data,
          // An open date is information, not a blank — say so, and turn it into
          // something useful for the client.
          value: eventDate ? longDate(eventDate, locale) : openDate ? tc.openDate : "",
          note: !eventDate && openDate ? tc.openDateNote : undefined,
        },
        { label: tc.local, value: quote.location ?? "" },
      ].filter((d) => d.value)
    : [];

  // Three doors out of the wait, each carrying a real photograph rather than a
  // line-art icon: this is a company whose product IS how things look, and a
  // wireframe glyph was the least persuasive thing we could have put here.
  const explore = [
    {
      href: localizeHref("/galeria", locale),
      label: tc.exploreGaleria,
      sub: tc.exploreGaleriaSub,
      external: false,
      photo: CONFIRMACAO_PHOTOS.galeria,
      blur: blur.galeria,
      alt: t.common.imageAlt.galeriaHeader,
    },
    {
      href: SITE.instagram,
      label: tc.exploreInsta,
      sub: tc.exploreInstaSub,
      external: true,
      photo: CONFIRMACAO_PHOTOS.instagram,
      blur: blur.instagram,
      alt: t.common.imageAlt.galeriaInstagram,
    },
    {
      href: localizeHref("/clientes", locale),
      label: tc.exploreClientes,
      sub: tc.exploreClientesSub,
      external: false,
      photo: CONFIRMACAO_PHOTOS.clientes,
      blur: blur.clientes,
      alt: t.common.imageAlt.clientesCorporate,
    },
  ];

  // /68 is the floor: on cream (#f7f4ee) anything lighter than ~/65 drops these
  // 10px tracked labels under 4.5:1. The old /58 measured 3.73:1.
  const microLabel = "text-foreground/68 text-[10px] tracking-[0.32em] uppercase";

  return (
    // -mt-24 pt-24 cancels the global <main> top padding and re-applies it
    // INSIDE the cream ground. Without it the body's white showed as a 96px
    // band above the page — a hard seam across the top of the spread. The
    // photograph still starts below the navbar, exactly as the form's own image
    // panel does, so the tall at-rest logo lockup never sits on top of it.
    <div data-cream-page className="relative -mt-24 min-h-screen overflow-hidden bg-cream pt-24">
      {/* Celebration petals — drift down once, in front but featherlight. */}
      {mounted && (
        <div aria-hidden className="pointer-events-none fixed inset-0 z-[5] overflow-hidden">
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

      {/* ── Opening spread: the message on paper, the work beside it ──
          The photograph is the same one that fills the form's left panel, so
          the client stays inside the world they were just in instead of being
          dropped onto a blank receipt. */}
      <section className="relative grid grid-cols-1 lg:grid-cols-[1.02fr_0.98fr] lg:min-h-[88vh]">
        <div className="relative z-10 flex flex-col justify-center px-6 sm:px-10 lg:pl-16 xl:pl-24 lg:pr-14 pt-28 pb-14 lg:py-28">
          <AnimateIn from="fade">
            <svg viewBox="0 0 52 52" className="h-10 w-10 mb-8" fill="none" aria-hidden>
              <circle
                className="confirm-ring"
                cx="26"
                cy="26"
                r="24"
                stroke="var(--color-moss)"
                strokeWidth="1.2"
                strokeOpacity="0.4"
              />
              <path
                className="confirm-check"
                d="M15 27l7.5 7.5L38 18"
                stroke="var(--color-moss)"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </AnimateIn>

          <AnimateIn from="bottom" delay={60}>
            <p className="text-gold-text text-[10px] tracking-[0.42em] uppercase mb-7 flex items-center gap-3">
              <span className="w-8 h-px bg-gold/70 shrink-0" />
              {tc.successEyebrow}
            </p>
          </AnimateIn>

          {/* Sentence case in Playfair, not uppercase grotesque. The old
              headline shouted the way a receipt header shouts; this one is
              addressed to a person. */}
          <AnimateIn from="bottom" delay={110}>
            <h1
              ref={h1Ref}
              tabIndex={-1}
              className="font-display font-normal text-foreground leading-[1.06] tracking-[-0.015em] text-balance focus:outline-none focus-quiet"
              style={{ fontSize: "clamp(38px, 5.4vw, 66px)" }}
            >
              {tc.titleLine1}{" "}
              <span className="text-moss">{pick(tc.titleMoss, tc.titleMossPlural)}</span>
            </h1>
          </AnimateIn>

          <AnimateIn from="bottom" delay={160}>
            <p className="mt-8 max-w-[34rem] text-foreground/75 text-[15.5px] leading-[1.85]">
              {lead}
            </p>
          </AnimateIn>

          {/* The promise, as a DATE. "Até 48 horas úteis" is a disclaimer the
              client has to decode; a named weekday is something they can hold
              us to — and it's the single thing they came to this page to know. */}
          {replyBy && (
            <AnimateIn from="bottom" delay={210}>
              <div className="mt-10 max-w-[34rem]">
                <p className={microLabel}>{tc.replyByLabel}</p>
                <p
                  className="font-display text-moss-dark leading-[1.12] mt-2.5 first-letter:uppercase"
                  style={{ fontSize: "clamp(26px, 3.2vw, 38px)" }}
                >
                  {replyBy}
                </p>
                <p className="mt-3.5 max-w-[30rem] text-foreground/65 text-[13.5px] leading-relaxed">
                  {pick(tc.replyByNote, tc.replyByNotePlural)}
                </p>
              </div>
            </AnimateIn>
          )}

          {/* Perspective: two working days is nothing against 300 days of
              planning. Shown only when there IS a date to count towards. */}
          {(countdown !== null || (highSeason && !!eventDate)) && (
            <AnimateIn from="bottom" delay={250}>
              <div className="mt-9 max-w-[32rem] border-t border-foreground/12 pt-5 flex flex-col gap-2">
                {countdown !== null && (
                  <p className="text-foreground/70 text-[13.5px] tabular-nums">
                    {fill(tc.countdown, { days: String(countdown) })}
                  </p>
                )}
                {highSeason && (
                  <p className="text-foreground/70 text-[13px] leading-relaxed">
                    {tc.highSeasonNote}
                  </p>
                )}
              </div>
            </AnimateIn>
          )}
        </div>

        <div className="relative min-h-[78vw] sm:min-h-[48vw] lg:min-h-0">
          <Image
            src={CONFIRMACAO_PHOTOS.hero}
            alt={t.common.imageAlt.orcamentoPanel}
            fill
            priority
            sizes="(max-width: 1024px) 100vw, 50vw"
            quality={72}
            placeholder="blur"
            blurDataURL={blur.hero}
            className="object-cover"
          />
          {/* Feather the photograph into the paper so the split reads as one
              spread rather than two boxes shoved together. Kept SHORT (16–20%)
              and written as an explicit stop: a default 50% midpoint washed out
              half the photograph. Two elements rather than responsive gradient
              utilities because the direction flips at lg and the fade must end
              in transparent CREAM — plain `transparent` is rgba(0,0,0,0), which
              greys the blend on the way out. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 lg:hidden"
            style={{ background: "linear-gradient(to bottom, #f7f4ee 0%, #f7f4ee00 16%)" }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 hidden lg:block"
            style={{ background: "linear-gradient(to right, #f7f4ee 0%, #f7f4ee00 20%)" }}
          />
        </div>
      </section>

      {/* ── The dossier ── */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 xl:px-24 py-20 lg:py-28">
        <div className="mx-auto max-w-6xl grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-16 lg:gap-24">
          <div>
            <AnimateIn from="bottom">
              <div className="flex items-baseline justify-between gap-6 border-b border-foreground/20 pb-4">
                <h2
                  className="font-display text-foreground leading-tight"
                  style={{ fontSize: "clamp(21px, 2.3vw, 27px)" }}
                >
                  {pick(tc.recapTitle, tc.recapTitlePlural)}
                </h2>
                <span
                  className={`shrink-0 inline-flex items-center gap-2 text-[11px] tracking-wide ${status.color}`}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {status.label}
                </span>
              </div>
            </AnimateIn>

            <AnimateIn from="bottom" delay={60}>
              {details.length === 0 && (
                <p className="py-5 text-foreground/70 text-sm leading-relaxed">
                  {pick(tc.noDataNote, tc.noDataNotePlural)}
                </p>
              )}

              {/* The reference row lives INSIDE this <dl> — a dt/dd pair sitting
                  after the closing tag is invalid markup, and assistive tech
                  drops the pairing entirely. */}
              <dl>
                {details.map((d) => (
                  <div
                    key={d.label}
                    className="flex items-baseline justify-between gap-8 py-5 border-b border-foreground/10"
                  >
                    <dt className={`${microLabel} shrink-0`}>{d.label}</dt>
                    <dd className="text-foreground/88 text-[16px] text-right leading-snug">
                      {d.value}
                      {d.note && (
                        <span className="mt-1.5 block text-foreground/70 text-[12.5px] leading-relaxed">
                          {d.note}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
                <div className="flex items-baseline justify-between gap-8 py-5 border-b border-foreground/10">
                  <dt className={`${microLabel} shrink-0`}>{tc.refLabel}</dt>
                  <dd className="text-foreground/75 font-mono text-[14px] tracking-tight">{id}</dd>
                </div>
              </dl>

              <div className="flex flex-wrap items-center gap-x-8 gap-y-3 pt-5">
                {icsHref && (
                  <a
                    href={icsHref}
                    download="liquen-events.ics"
                    className="inline-flex items-center gap-2 text-moss-dark text-[12.5px] font-medium hover:text-moss transition-colors"
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
                )}
                <p className="text-foreground/70 text-[11.5px] leading-relaxed">{tc.footerNote}</p>
              </div>
            </AnimateIn>

            {/* The client's own words, set as a pull-quote. They wrote the
                brief; giving it the page's most beautiful type is the clearest
                way to say it was read. */}
            {clientMessage && (
              <AnimateIn from="bottom" delay={100}>
                <figure className="mt-14">
                  <figcaption className={`${microLabel} mb-4`}>{tc.mensagem}</figcaption>
                  <blockquote
                    className="font-display italic text-foreground/85 leading-[1.62] whitespace-pre-line border-l border-gold/60 pl-6"
                    style={{ fontSize: "clamp(17px, 1.9vw, 22px)" }}
                  >
                    {clientMessage}
                  </blockquote>
                </figure>
              </AnimateIn>
            )}
          </div>

          <div className="flex flex-col gap-14">
            <AnimateIn from="bottom" delay={80}>
              <div>
                <p className={`${microLabel} pb-4 border-b border-foreground/20`}>
                  {tc.proximosPassos}
                </p>
                <ol>
                  {tc.steps.map((item, i) => (
                    <li
                      key={i}
                      className="flex gap-5 py-5 border-b border-foreground/10 last:border-b-0"
                    >
                      <span className="font-display text-moss/70 text-[16px] tabular-nums shrink-0 w-4">
                        {i + 1}
                      </span>
                      <div>
                        <p className="text-foreground/85 text-[14px] font-medium">{item.label}</p>
                        <p className="text-foreground/70 text-[12.5px] leading-relaxed mt-1">
                          {item.desc}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </AnimateIn>

            <AnimateIn from="bottom" delay={140}>
              <div>
                <span aria-hidden className="block w-8 h-px bg-gold/70 mb-5" />
                <p className="text-foreground/72 text-[13.5px] leading-relaxed mb-5 max-w-[24rem]">
                  {pick(tc.contactIntro, tc.contactIntroPlural)}
                </p>

                {/* WhatsApp, as the primary action. The floating pill is
                    suppressed across /orcamento* so it can't cover the form's
                    submit button — which left this page, the moment a lead is
                    warmest, with no way to start a conversation at all. The
                    prefill carries the reference so the team knows who's
                    writing before they answer. */}
                <a
                  href={waHref(`${t.common.whatsappPrefill}\n${tc.refLabel}: ${id}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => track("WhatsAppClick", { source: "confirmacao" })}
                  className="group flex items-center gap-3.5 bg-moss px-5 py-4 text-white shadow-lg shadow-moss/15 transition-colors hover:bg-moss-dark"
                >
                  <WhatsAppIcon className="h-5 w-5 shrink-0" />
                  <span className="min-w-0">
                    <span className="block text-[14px] font-medium leading-tight">
                      {tc.contactWhatsapp}
                    </span>
                    <span className="block text-[11.5px] leading-tight text-white/75 mt-1">
                      {tc.contactWhatsappSub}
                    </span>
                  </span>
                  <span className="ml-auto shrink-0 transition-transform duration-300 group-hover:translate-x-1">
                    →
                  </span>
                  <span className="sr-only"> ({t.common.newWindow})</span>
                </a>

                <div className="mt-6 flex flex-col gap-2.5">
                  <a
                    href={`mailto:${SITE.email}`}
                    className="text-moss-dark text-[13px] hover:text-moss transition-colors w-fit"
                  >
                    {SITE.email}
                  </a>
                  <a
                    href={`tel:${SITE.phone}`}
                    className="text-moss-dark text-[13px] hover:text-moss transition-colors w-fit"
                  >
                    {SITE.phoneDisplay}
                  </a>
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── While you wait — three photographs, not three icons ── */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 xl:px-24 pb-20 lg:pb-28">
        <div className="mx-auto max-w-6xl">
          <AnimateIn from="bottom">
            <div className="flex items-start gap-4 mb-8">
              <span aria-hidden className="w-8 h-px bg-gold/70 shrink-0 mt-3.5" />
              <div>
                <h2
                  className="font-display text-foreground leading-tight"
                  style={{ fontSize: "clamp(21px, 2.5vw, 29px)" }}
                >
                  {pick(tc.whileTitle, tc.whileTitlePlural)}
                </h2>
                <p className="text-foreground/70 text-[13.5px] mt-1.5">
                  {pick(tc.whileLead, tc.whileLeadPlural)}
                </p>
              </div>
            </div>
          </AnimateIn>

          <AnimateIn from="bottom" delay={70}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 lg:gap-6">
              {explore.map((c) => {
                const inner = (
                  <>
                    <Image
                      src={c.photo}
                      alt={c.alt}
                      fill
                      sizes="(max-width: 640px) 100vw, 33vw"
                      quality={70}
                      placeholder="blur"
                      blurDataURL={c.blur}
                      className="object-cover transition-transform duration-700 ease-expo group-hover:scale-[1.04]"
                    />
                    <span
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-[#14140f]/88 via-[#14140f]/20 to-transparent"
                    />
                    <span className="absolute inset-x-0 bottom-0 p-5 lg:p-6">
                      <span className="flex items-center gap-1.5 text-cream text-[15px] font-medium">
                        {c.label}
                        <span className="transition-transform duration-300 group-hover:translate-x-1">
                          →
                        </span>
                      </span>
                      <span className="block text-cream/72 text-[12px] mt-1.5 leading-relaxed">
                        {c.sub}
                      </span>
                    </span>
                  </>
                );
                const cls =
                  "group relative block overflow-hidden aspect-[4/5] sm:aspect-[3/4] focus:outline-none focus-visible:ring-2 focus-visible:ring-moss focus-visible:ring-offset-2 focus-visible:ring-offset-cream";
                return c.external ? (
                  <a
                    key={c.label}
                    href={c.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={cls}
                  >
                    {inner}
                    <span className="sr-only"> ({t.common.newWindow})</span>
                  </a>
                ) : (
                  <Link key={c.label} href={c.href} className={cls}>
                    {inner}
                  </Link>
                );
              })}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Sign-off ── */}
      <section className="relative z-10 px-6 sm:px-10 lg:px-16 xl:px-24 pb-28">
        <AnimateIn from="fade">
          <div className="mx-auto max-w-6xl border-t border-foreground/15 pt-10 flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p
                className="font-display italic text-moss-dark leading-snug max-w-md"
                style={{ fontSize: "clamp(17px, 1.9vw, 21px)" }}
              >
                {tc.greetingWarm}
              </p>
              <p className="mt-7 text-foreground/70 text-[13px]">{tc.signOff}</p>
              <p
                className="font-display italic text-moss mt-1"
                style={{ fontSize: "clamp(22px, 2.6vw, 28px)" }}
              >
                {tc.signName}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4 shrink-0">
              <Link
                href={localizeHref("/", locale)}
                className="inline-flex items-center gap-3 px-8 py-3.5 border border-foreground/25 text-foreground/80 text-[11px] tracking-[0.3em] uppercase hover:bg-foreground hover:text-cream hover:border-foreground transition-colors duration-300"
              >
                {tc.voltarInicio}
              </Link>
              <Link
                href={localizeHref("/orcamento", locale)}
                className="text-[11px] tracking-[0.2em] uppercase text-foreground/72 hover:text-moss transition-colors"
              >
                {tc.novoPedido}
              </Link>
            </div>
          </div>
        </AnimateIn>
      </section>
    </div>
  );
}
