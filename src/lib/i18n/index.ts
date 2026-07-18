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
  localizeHref,
} from "./config";

const dictionaries: Record<Locale, Dict> = { pt, en };

/** Synchronous dictionary lookup — safe in both server and client components. */
export function getDictionary(locale: Locale): Dict {
  return dictionaries[locale] ?? pt;
}

/**
 * The dictionary slice carried by the site-wide client context (LocaleProvider).
 *
 * The always-mounted chrome (Navbar, StickyCTA, WhatsAppButton, LanguageToggle,
 * ClientMarquee) and the error/not-found boundaries only ever read these
 * namespaces. Passing just this slice across the RSC boundary — instead of the
 * whole ~25KB dictionary — keeps every page's flight payload/hydration data
 * small. Page-scoped components that need a heavier namespace (the quote form,
 * gallery, testimonials, confirmation, proposal, FAQ) receive it as an explicit
 * prop from their own server page instead, so each page ships only what it uses.
 */
export type ChromeDict = Pick<Dict, "nav" | "langToggle" | "common" | "errors" | "footer">;

export function pickChromeDict(t: Dict): ChromeDict {
  return {
    nav: t.nav,
    langToggle: t.langToggle,
    common: t.common,
    errors: t.errors,
    footer: t.footer,
  };
}
