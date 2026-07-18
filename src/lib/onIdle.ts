/**
 * Run `cb` when the browser is idle, falling back to a short timeout where
 * requestIdleCallback isn't available (Safari). Returns a canceller.
 *
 * Use it to keep non-critical setup — decorative islands, WebGL init, scroll
 * listener/observer attachment — OUT of the post-navigation hydration window, so
 * the page becomes responsive to the first tap sooner (measured: WebGL init on
 * mount was a ~1.2s main-thread task on desktop route arrivals).
 */
export function onIdle(cb: () => void, timeout = 2000): () => void {
  if (typeof window === "undefined") return () => {};
  const w = window as Window & {
    requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(cb, { timeout });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
}
