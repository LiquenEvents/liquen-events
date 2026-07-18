"use client";

import { useSyncExternalStore } from "react";

// SSR-safe `prefers-reduced-motion` reader. Server + first client render return
// `false` (assume motion is allowed) so hydration matches; the real value is
// picked up on subscribe. Everything cinematic in the site is gated on this —
// the accessibility budget (Lighthouse a11y ≥ 0.9) is a hard CI gate, and users
// who ask for reduced motion get a calm, static experience with zero animation.
const QUERY = "(prefers-reduced-motion: reduce)";

// Cache the MediaQueryList at module scope. Every reveal primitive checks
// reduced-motion in a synchronous pre-paint layout effect, once per instance —
// and pages like /servicos mount dozens, on every navigation. Reusing one
// MediaQueryList (instead of calling matchMedia N times per render) cuts that
// repeated work from the destination-render path that a page transition waits on.
let cachedMq: MediaQueryList | null = null;
function mediaQuery(): MediaQueryList | null {
  if (typeof window === "undefined" || !window.matchMedia) return null;
  if (!cachedMq) cachedMq = window.matchMedia(QUERY);
  return cachedMq;
}

function subscribe(callback: () => void): () => void {
  const mq = mediaQuery();
  if (!mq) return () => {};
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return mediaQuery()?.matches ?? false;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Imperative one-shot check for non-React code (Lenis/GSAP/WebGL setup). */
export function prefersReducedMotion(): boolean {
  return getSnapshot();
}
