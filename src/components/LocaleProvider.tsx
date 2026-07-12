"use client";

import { createContext, useContext } from "react";
import type { Dict, Locale } from "@/lib/i18n";

// Holds the already-resolved dictionary (not just the locale code) so client
// components never need to import lib/i18n's getDictionary — that module
// pulls in BOTH pt.ts and en.ts (~43KB combined) at module scope, which would
// otherwise ship both languages' full dictionary to every page's client
// bundle even though only one is ever used per request. The layout resolves
// the dictionary once, server-side, via getServerDictionary().
const LocaleContext = createContext<{ locale: Locale; dict: Dict } | null>(null);

export function LocaleProvider({
  locale,
  dict,
  children,
}: {
  locale: Locale;
  dict: Dict;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={{ locale, dict }}>{children}</LocaleContext.Provider>;
}

function useLocaleContext(): { locale: Locale; dict: Dict } {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale/useTranslations must be used within <LocaleProvider>");
  return ctx;
}

/** Current locale, provided server-side via the layout (no flash). */
export function useLocale(): Locale {
  return useLocaleContext().locale;
}

/** Current locale + its dictionary, for client components. */
export function useTranslations(): { locale: Locale; t: Dict } {
  const { locale, dict } = useLocaleContext();
  return { locale, t: dict };
}
