/**
 * i18n configuration — shared by server and client.
 *
 * The site is Portuguese-first (canonical, statically meaningful) with an
 * English reading option toggled via the `liquen-lang` cookie. URLs stay the
 * same in both languages; the chosen locale is read server-side from the
 * cookie so the correct language is in the initial HTML (no flash).
 */
export const LOCALES = ["pt", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "pt";
export const LANG_COOKIE = "liquen-lang";

/** Coerce any cookie/string value to a supported locale (defaults to pt). */
export function normalizeLocale(value: string | undefined | null): Locale {
  return value === "en" ? "en" : "pt";
}

/** BCP-47 tag for the <html lang> attribute. */
export function htmlLang(locale: Locale): string {
  return locale === "en" ? "en" : "pt-PT";
}
