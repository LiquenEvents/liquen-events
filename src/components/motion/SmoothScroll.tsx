"use client";

import { createContext, useContext } from "react";

/**
 * Smooth-scroll (Lenis) is intentionally DISABLED in favour of native scrolling.
 *
 * Why: Lenis interpolates the scroll position, so the page GLIDES instead of
 * tracking the wheel/finger 1:1. That inertia reads as "sluggish to respond"
 * on real devices, and its ~1s glide after every gesture kept the WebGL hero
 * re-rendering the whole time — the main reason the site felt un-fluid. Native
 * scroll responds instantly and costs nothing.
 *
 * Nothing visible is lost: the scroll-reveals are pure CSS (IntersectionObserver
 * + transitions), Parallax uses its own passive scroll listener, and the WebGL
 * layers read `window.scrollY` directly — all work exactly the same on native
 * scroll. Anchor jumps stay smooth via the CSS `scroll-behavior: smooth` on
 * <html> (that only affects programmatic scrolls, never the user's wheel/touch).
 *
 * The `lenis` package is no longer a dependency; the context is a thin `null`
 * passthrough so `useLenis()` stays a stable no-op and re-enabling the inertia
 * later is a contained change (reinstall lenis, restore the instance type).
 */
const LenisContext = createContext<null>(null);

/** Always null now (smooth scroll disabled) — callers fall back to native. */
export function useLenis(): null {
  return useContext(LenisContext);
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  return <LenisContext.Provider value={null}>{children}</LenisContext.Provider>;
}
