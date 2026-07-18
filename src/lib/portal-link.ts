/**
 * Client-safe helper for building the relative path to a client's portal.
 *
 * Deliberately free of any `server-only` / repository / fs import so the back
 * office (a client component) can build a shareable "copiar link do portal"
 * URL from a token minted server-side, without pulling server code into the
 * client bundle. The token itself is created with `createPortalToken` in
 * `portal-token.ts` (server-only) — this only assembles the path.
 */
import { normalizeLocale } from "./i18n/config";

/** Relative path to the portal for a given token, e.g. `/pt/portal/<token>`.
 *  `lang` is coerced to a supported locale (defaults to pt). */
export function portalPath(token: string, lang?: string): string {
  return `/${normalizeLocale(lang)}/portal/${token}`;
}
