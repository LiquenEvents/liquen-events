import Script from "next/script";

// Google tag IDs for Líquen Events. PUBLIC identifiers — they ship in the page
// source by design, so hard-coding them here is fine (no secret). We configure
// BOTH concrete destinations explicitly (rather than the GT- container, which
// wasn't actually feeding this GA4 property): Google Ads for conversions +
// remarketing, and GA4 for analytics + the `generate_lead` key event that gets
// imported into Ads as the "Pedido de orçamento" conversion.
export const GOOGLE_ADS_ID = "AW-16724349653";
export const GA4_ID = "G-WH8B0Y53X3";

// Consent Mode v2 bootstrap. Emitted as a PLAIN inline <script> (not
// next/script beforeInteractive) so it executes synchronously in document
// order — before the async gtag.js below — which is exactly what Consent Mode
// requires: the `default` (everything denied) must be queued before the
// library processes anything. Everything here just pushes onto dataLayer; the
// library flushes that queue in order once it loads.
const CONSENT_BOOTSTRAP = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
var g = 'denied';
try { if (localStorage.getItem('liquen-consent') === 'granted') g = 'granted'; } catch (e) {}
gtag('consent', 'default', {
  ad_storage: g,
  ad_user_data: g,
  ad_personalization: g,
  analytics_storage: g,
  wait_for_update: 500
});
gtag('js', new Date());
gtag('config', '${GOOGLE_ADS_ID}');
gtag('config', '${GA4_ID}');
`;

/**
 * Google tag (gtag.js) with Consent Mode v2, wired for RGPD/GDPR.
 *
 * Everything is DENIED by default (no ad/analytics cookies) until the visitor
 * explicitly accepts via <ConsentBanner>. If they accepted on a previous visit
 * the choice is restored from localStorage before the tag loads, so consent
 * persists. Under "denied", gtag still sends cookieless pings so Google can
 * model conversions — but sets no cookies, which keeps us compliant without
 * re-asking on every page. The library loads `afterInteractive` so it never
 * competes with first paint.
 */
export default function GoogleTag() {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: CONSENT_BOOTSTRAP }} />
      {/* lazyOnload (browser idle, after load) — mirrors the Plausible loader:
          keeps the ad tag off the critical path so it never competes with
          hydration or an interaction. The Consent Mode default above is set
          inline (synchronously) regardless, so consent ordering is unaffected. */}
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`} strategy="lazyOnload" />
    </>
  );
}
