/**
 * Tiny analytics event helper (Plausible custom events).
 *
 * Completely inert unless Plausible is actually loaded (`window.plausible` is
 * only defined by Analytics.tsx when NEXT_PUBLIC_PLAUSIBLE_DOMAIN is set), so
 * calling `track()` anywhere is safe with no analytics configured — it no-ops.
 * Cookieless, no consent impact.
 */
type PlausibleFn = (
  event: string,
  options?: { props?: Record<string, string | number | boolean> },
) => void;

export function track(event: string, props?: Record<string, string | number | boolean>): void {
  if (typeof window === "undefined") return;
  const p = (window as unknown as { plausible?: PlausibleFn }).plausible;
  if (typeof p === "function") p(event, props ? { props } : undefined);
}
