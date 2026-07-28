/**
 * Speculation Rules — near-instant page changes on supporting browsers
 * (Chrome/Edge). When the visitor shows intent on a same-origin link (hovers,
 * or starts a tap), the browser PRERENDERS the whole next page in the
 * background, so the actual click swaps to an already-rendered document in ~0ms
 * — a step beyond Next's data-only prefetch.
 *
 * This is pure progressive enhancement: browsers without the API simply ignore
 * the script and fall back to the normal (already fast) client navigation.
 *
 * Safety rules baked in:
 * - `eagerness: "moderate"` fires on hover / pointer-down intent, not eagerly
 *   on every visible link, so we don't prerender pages the visitor never wants.
 * - The auth'd/dynamic surfaces (back office, quote flow, client portals,
 *   proposal links) are EXCLUDED — we never want to prerender something that
 *   mutates state, needs fresh data, or is behind a token.
 * - Any link can opt out with `data-no-prerender`.
 *
 * Prerendered pages run their scripts in a hidden state; analytics is made
 * prerender-aware (see Analytics) so a prerender never counts as a pageview.
 */
export default function SpeculationRules() {
  const rules = {
    prerender: [
      {
        where: {
          and: [
            { href_matches: "/*" },
            { not: { href_matches: "/orcamento/*" } },
            { not: { href_matches: "/en/orcamento/*" } },
            { not: { href_matches: "/portal/*" } },
            { not: { href_matches: "/en/portal/*" } },
            { not: { href_matches: "/proposta/*" } },
            { not: { href_matches: "/en/proposta/*" } },
            { not: { selector_matches: "[data-no-prerender]" } },
          ],
        },
        eagerness: "moderate",
      },
    ],
  };
  return (
    <script
      type="speculationrules"
      // Static JSON policy — allowed by the CSP `script-src 'unsafe-inline'`.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}
