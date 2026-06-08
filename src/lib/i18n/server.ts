import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, normalizeLocale, type Locale } from "./config";
import { getDictionary } from "./index";

/**
 * Reads the active locale (server components only).
 *
 * The /en/* mirror sets `x-liquen-locale` via the proxy to force English; for
 * every other URL we fall back to the `liquen-lang` cookie (the toggle's UX),
 * defaulting to Portuguese.
 */
export async function getLocale(): Promise<Locale> {
  const forced = (await headers()).get("x-liquen-locale");
  if (forced === "en" || forced === "pt") return forced;
  const store = await cookies();
  return normalizeLocale(store.get(LANG_COOKIE)?.value);
}

/** Convenience: locale + its dictionary in one call. */
export async function getServerDictionary() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
