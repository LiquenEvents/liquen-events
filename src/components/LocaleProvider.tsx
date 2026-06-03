"use client";

import { createContext, useContext } from "react";
import { getDictionary, type Dict, type Locale } from "@/lib/i18n";

const LocaleContext = createContext<Locale>("pt");

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

/** Current locale, provided server-side via the layout (no flash). */
export function useLocale(): Locale {
  return useContext(LocaleContext);
}

/** Current locale + its dictionary, for client components. */
export function useTranslations(): { locale: Locale; t: Dict } {
  const locale = useContext(LocaleContext);
  return { locale, t: getDictionary(locale) };
}
