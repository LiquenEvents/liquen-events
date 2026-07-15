"use client";

import { useSyncExternalStore } from "react";

// SSR-safe `prefers-reduced-motion` reader. Server + first client render return
// `false` (assume motion is allowed) so hydration matches; the real value is
// picked up on subscribe. Everything cinematic in the site is gated on this —
// the accessibility budget (Lighthouse a11y ≥ 0.9) is a hard CI gate, and users
// who ask for reduced motion get a calm, static experience with zero animation.
const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => {};
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(QUERY).matches;
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** Imperative one-shot check for non-React code (Lenis/GSAP/WebGL setup). */
export function prefersReducedMotion(): boolean {
  return getSnapshot();
}
