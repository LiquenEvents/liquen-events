import { pt, type Dict } from "./pt";
import { en } from "./en";
import type { Locale } from "./config";

export type { Dict };
export {
  type Locale,
  LOCALES,
  DEFAULT_LOCALE,
  LANG_COOKIE,
  normalizeLocale,
  htmlLang,
} from "./config";

const dictionaries: Record<Locale, Dict> = { pt, en };

/** Synchronous dictionary lookup — safe in both server and client components. */
export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] ?? pt;
}
