/**
 * Fire the Google "lead" conversion event (Google Ads via the linked GA4
 * property). Called on the quote-confirmation page — reaching that page IS a
 * successful "Pedido de orçamento".
 *
 * Sends the GA4 recommended `generate_lead` event through the Google tag (see
 * GoogleTag.tsx). The tag routes it to the linked GA4 property, where it's
 * marked a key event and imported into Google Ads as the conversion. Consent
 * Mode decides whether it's cookie-based or a cookieless modeled ping, so this
 * is always safe to call — no consent check needed here.
 *
 * Completely inert if the tag never loaded (`window.gtag` undefined), so it's
 * a no-op with no analytics configured. `dedupeKey` (the quote id) guards
 * against a page refresh / re-open double-counting within the same tab.
 */
type Gtag = (...args: unknown[]) => void;

export function reportLeadConversion(dedupeKey?: string): void {
  if (typeof window === "undefined") return;
  const gtag = (window as unknown as { gtag?: Gtag }).gtag;
  if (typeof gtag !== "function") return;

  if (dedupeKey) {
    try {
      const k = `liquen-lead-${dedupeKey}`;
      if (sessionStorage.getItem(k)) return;
      sessionStorage.setItem(k, "1");
    } catch {
      /* storage blocked — fall through and still report once */
    }
  }

  gtag("event", "generate_lead");
}
