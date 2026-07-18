// Shared one-shot "in view" observer, keyed by geometry.
//
// Several components (AnimateIn has its own copy of this pattern) each used to
// spin up their OWN IntersectionObserver per mounted instance. Here we share a
// SINGLE observer per unique { threshold, rootMargin } pair: every element
// registers a one-shot callback in a WeakMap, and when the shared observer
// reports it intersecting we fire that callback once and stop watching it. N
// reveals with the same geometry therefore cost one observer, not N — with the
// identical threshold/rootMargin, so the trigger point is byte-for-byte the same
// as the previous per-instance observers.

type InViewCallback = () => void;

const observers = new Map<string, IntersectionObserver>();
const callbacks = new WeakMap<Element, InViewCallback>();

function getObserver(threshold: number, rootMargin: string): IntersectionObserver {
  const key = `${threshold}|${rootMargin}`;
  const existing = observers.get(key);
  if (existing) return existing;
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cb = callbacks.get(entry.target);
        if (cb) {
          callbacks.delete(entry.target);
          observer.unobserve(entry.target);
          cb();
        }
      }
    },
    { threshold, rootMargin },
  );
  observers.set(key, observer);
  return observer;
}

/**
 * Fire `cb` once, the first time `el` scrolls into view (then stop watching it).
 * Returns a cleanup that unregisters the element if it never intersected.
 */
export function observeOnceInView(
  el: Element,
  opts: { threshold?: number; rootMargin?: string },
  cb: InViewCallback,
): () => void {
  const threshold = opts.threshold ?? 0;
  const rootMargin = opts.rootMargin ?? "0px";
  const observer = getObserver(threshold, rootMargin);
  callbacks.set(el, cb);
  observer.observe(el);
  return () => {
    if (!callbacks.has(el)) return;
    callbacks.delete(el);
    observer.unobserve(el);
  };
}
