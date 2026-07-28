/**
 * Tiny analytics event helper. Fires each event to BOTH destinations, each
 * inert until its tag loads, so calling `track()` anywhere is always safe:
 *
 *  1. Plausible — cookieless, no consent impact (`window.plausible`, set by
 *     Analytics.tsx only when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is configured).
 *  2. Google (GA4 + Ads) via `window.gtag` (GoogleTag.tsx). This is what lets
 *     Google SEE high-intent actions — WhatsApp/phone clicks, CTA clicks,
 *     quote-start — so it can optimise bidding toward them and you can build
 *     remarketing audiences (e.g. "started a quote but didn't finish"). Consent
 *     Mode governs whether it's cookie-based or a cookieless modelled ping, so
 *     no consent check is needed here.
 */
type PlausibleFn = (
  event: string,
  options?: { props?: Record<string, string | number | boolean> },
) => void;
type Gtag = (...args: unknown[]) => void;

export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  const w = window as unknown as { plausible?: PlausibleFn; gtag?: Gtag };
  if (typeof w.plausible === "function") w.plausible(event, props ? { props } : undefined);
  if (typeof w.gtag === "function") w.gtag("event", event, props ?? {});
}
