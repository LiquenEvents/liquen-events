"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { localizeHref, type Locale } from "@/lib/i18n/config";

// Minimal RGPD cookie-consent bar. It only governs the Google tag's Consent
// Mode signals (ad/analytics cookies) — the site's own first-party essentials
// don't need consent. Shown once; the choice is stored in localStorage and
// mirrored into gtag('consent','update',…). Denied by default (see GoogleTag),
// so doing nothing = no ad cookies.
type Gtag = (...args: unknown[]) => void;

const COPY = {
  pt: {
    text: "Usamos cookies do Google para estatísticas de visitas (Google Analytics) e para medir a eficácia da nossa publicidade (Google Ads). Pode aceitar ou recusar — a sua escolha fica guardada.",
    more: "Saber mais",
    accept: "Aceitar",
    decline: "Recusar",
    aria: "Aviso de cookies",
  },
  en: {
    text: "We use Google cookies for visit statistics (Google Analytics) and to measure how well our ads perform (Google Ads). You can accept or decline — your choice is remembered.",
    more: "Learn more",
    accept: "Accept",
    decline: "Decline",
    aria: "Cookie notice",
  },
} as const;

export default function ConsentBanner({ locale }: { locale: Locale }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    // Only surface the bar when no choice has been stored yet. Wrapped in
    // try/catch because localStorage throws in private-mode / blocked-storage.
    try {
      if (!localStorage.getItem("liquen-consent")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(true);
      }
    } catch {
      /* storage unavailable — skip the banner rather than risk a throw */
    }
  }, []);

  // Re-open on demand from the "Gerir cookies" footer link, so a visitor can
  // change or withdraw their choice at any time (RGPD: withdrawing consent must
  // be as easy as giving it).
  useEffect(() => {
    const open = () => setShow(true);
    window.addEventListener("liquen:open-consent", open);
    return () => window.removeEventListener("liquen:open-consent", open);
  }, []);

  const choose = (granted: boolean) => {
    const value = granted ? "granted" : "denied";
    try {
      localStorage.setItem("liquen-consent", value);
    } catch {
      /* ignore */
    }
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    gtag?.("consent", "update", {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value,
    });
    setShow(false);
  };

  if (!show) return null;
  const t = COPY[locale === "en" ? "en" : "pt"];

  return (
    <div
      // role="region" (a labelled landmark), NOT "dialog": the bar is
      // non-modal — it doesn't trap focus or block the page, so a dialog role
      // would be a false modal claim. It also kept colliding with the real
      // modal dialogs on the page (gallery lightbox) under getByRole('dialog').
      role="region"
      aria-label={t.aria}
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/12 bg-moss-dark/95 backdrop-blur-sm px-5 py-4 sm:px-8"
      style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-[12.5px] leading-relaxed text-white/80">
          {t.text}{" "}
          <Link
            href={localizeHref("/privacidade", locale)}
            className="whitespace-nowrap text-white underline underline-offset-2 hover:text-white/90"
          >
            {t.more}
          </Link>
        </p>
        {/* Accept and Decline are given equal visual weight (same border, size
            and contrast). CNPD cookie guidance requires refusing to be as easy
            and as prominent as accepting — a low-contrast "decline" would be a
            dark pattern that undermines freely-given consent. */}
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => choose(false)}
            className="border border-white/70 px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-white hover:text-[#0c0e0b]"
          >
            {t.decline}
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="border border-white/70 px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-white hover:text-[#0c0e0b]"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
