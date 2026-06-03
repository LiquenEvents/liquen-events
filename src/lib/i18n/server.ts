import "server-only";
import { cookies } from "next/headers";
import { LANG_COOKIE, normalizeLocale, type Locale } from "./config";
import { getDictionary } from "./index";

/** Reads the active locale from the language cookie (server components only). */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  return normalizeLocale(store.get(LANG_COOKIE)?.value);
}

/** Convenience: locale + its dictionary in one call. */
export async function getServerDictionary() {
  const locale = await getLocale();
  return { locale, t: getDictionary(locale) };
}
