"use client";

import { useState } from "react";
import { LANG_COOKIE, type Locale } from "@/lib/i18n";
import { useTranslations } from "./LocaleProvider";

/**
 * PT | EN switch. Navigates to the chosen language's URL space — English lives
 * under /en/* (shareable & crawlable), Portuguese at the un-prefixed path — and
 * writes the cookie so the choice sticks. `light` mirrors the navbar's dark-hero
 * treatment so it stays legible over imagery.
 */
export default function LanguageToggle({ light = false }: { light?: boolean }) {
  const { locale, t } = useTranslations();
  const [pending, setPending] = useState(false);

  function choose(next: Locale) {
    if (next === locale) return;
    document.cookie = `${LANG_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    // Move to the language's URL space (EN at /en/* for sharing + crawling). A
    // full navigation — not router.push — so the root layout re-renders with the
    // right <html lang>, which client-side navigation would leave stale. Assign
    // synchronously (no transition) so nothing can race the cookie between the
    // write above and the document request.
    const bare = window.location.pathname.replace(/^\/en(?=\/|$)/, "") || "/";
    const dest = next === "en" ? (bare === "/" ? "/en" : `/en${bare}`) : bare;
    setPending(true);
    window.location.assign(dest + window.location.search);
  }

  const base = "text-[11px] tracking-[0.2em] uppercase transition-colors duration-300";
  const activeCls = light ? "text-white" : "text-moss";
  const idleCls = light
    ? "text-white/60 hover:text-white/90"
    : "text-foreground/55 hover:text-moss";

  return (
    <div
      className={`flex items-center gap-1.5 ${pending ? "opacity-60" : ""}`}
      role="group"
      aria-label={t.langToggle.label}
    >
      <button
        type="button"
        onClick={() => choose("pt")}
        aria-pressed={locale === "pt"}
        aria-label={t.langToggle.switchToPt}
        className={`${base} ${locale === "pt" ? activeCls : idleCls}`}
      >
        {t.langToggle.pt}
      </button>
      <span className={light ? "text-white/25" : "text-foreground/20"} aria-hidden>
        /
      </span>
      <button
        type="button"
        onClick={() => choose("en")}
        aria-pressed={locale === "en"}
        aria-label={t.langToggle.switchToEn}
        className={`${base} ${locale === "en" ? activeCls : idleCls}`}
      >
        {t.langToggle.en}
      </button>
    </div>
  );
}
