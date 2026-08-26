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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LÍNGUA LIDA DE UM CAMINHO — E PORQUE É QUE O PRIMEIRO SEGMENTO NÃO SERVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O site é português SEM prefixo: a página canónica vive em `/orcamento/admin`,
 * e só o espelho inglês leva `/en/…` à frente (ver `localizeHref` e a reescrita
 * em `src/proxy.ts`).
 *
 * Quem lê a língua com `pathname.split("/").filter(Boolean)[0]` acerta em
 * `/en/orcamento/admin` e falha em tudo o resto — em `/orcamento/admin` esse
 * primeiro segmento é a palavra **`orcamento`**.
 *
 * Era o que estava a acontecer no back office, e o resultado era um link para
 * `/orcamento/orcamento/admin/evento/{id}`: o 404 do site público, com o menu
 * comercial e um botão «Voltar ao início» que leva à homepage. Não havia
 * caminho de volta ao back office a não ser escrever o URL à mão — e o destino
 * verdadeiro é o Dossier do Evento, que é o ecrã mais completo do produto.
 *
 * Aqui a pergunta é a certa — «o caminho começa pelo espelho inglês?» — e a
 * resposta para tudo o resto é o português, que é o que a casa é.
 */
export function localeDoCaminho(pathname: string | null | undefined): Locale {
  if (!pathname) return DEFAULT_LOCALE;
  return pathname === "/en" || pathname.startsWith("/en/") ? "en" : DEFAULT_LOCALE;
}

/** BCP-47 tag for the <html lang> attribute. */
export function htmlLang(locale: Locale): string {
  return locale === "en" ? "en" : "pt-PT";
}

/**
 * Prefixes an internal href with /en when browsing the English mirror, so
 * client-side navigation between pages stays on /en/* URLs (matching the
 * proxy rewrite in src/proxy.ts) instead of relying solely on the
 * liquen-lang cookie to keep the chosen language across a click. External
 * URLs, mailto:/tel:, same-page anchors, and already-prefixed hrefs pass
 * through unchanged. Mirrors the destination logic in LanguageToggle.
 */
export function localizeHref(href: string, locale: Locale): string {
  if (locale !== "en" || !href.startsWith("/")) return href;
  // Already localized — don't double-prefix. (Guard against `startsWith("/en")`
  // alone, which would wrongly skip real paths like `/enigma`.)
  if (href === "/en" || href.startsWith("/en/")) return href;
  return href === "/" ? "/en" : `/en${href}`;
}
