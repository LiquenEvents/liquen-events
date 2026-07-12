"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import Lenis from "lenis";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";

gsap.registerPlugin(ScrollTrigger);

// Lenis instance shared with the whole tree so effects (ScrollTrigger-driven
// reveals, parallax, the WebGL layer) read a single, canonical scroll. `null`
// when reduced motion is on or before mount → callers fall back to native.
const LenisContext = createContext<Lenis | null>(null);

/** The active Lenis instance, or null (reduced motion / SSR / pre-mount). */
export function useLenis(): Lenis | null {
  return useContext(LenisContext);
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  const [lenis, setLenis] = useState<Lenis | null>(null);
  const lenisRef = useRef<Lenis | null>(null);

  useEffect(() => {
    // Users who ask for reduced motion get plain native scrolling — no inertia,
    // no rAF loop. This is also the accessibility-budget safety net.
    if (prefersReducedMotion()) return;

    const instance = new Lenis({
      // Cinematic-but-controlled easing — enough glide to feel premium, not so
      // much that it feels laggy or seasick.
      lerp: 0.1,
      wheelMultiplier: 1,
      smoothWheel: true,
      // Touch stays native (recommended): mobiles already feel great and
      // hijacking touch scroll fights the OS momentum.
      syncTouch: false,
      // Smooth-scroll same-page anchors (e.g. /servicos#empresas), offset by
      // the fixed navbar height (matches globals.css scroll-padding-top: 6rem).
      anchors: { offset: -96 },
    });
    lenisRef.current = instance;
    setLenis(instance);

    // Drive Lenis from GSAP's ticker (single rAF, no double-loop) and keep
    // ScrollTrigger in lockstep so pinned/scrubbed effects track the smoothed
    // scroll exactly.
    instance.on("scroll", ScrollTrigger.update);
    const onTick = (time: number) => instance.raf(time * 1000);
    gsap.ticker.add(onTick);
    gsap.ticker.lagSmoothing(0);

    // While the mobile menu is open the body is scroll-locked
    // (data-menu-open). Pause Lenis so its virtual wheel scroll can't leak
    // through behind the overlay; resume on close.
    const syncMenuLock = () => {
      if (document.body.dataset.menuOpen === "true") instance.stop();
      else instance.start();
    };
    const menuObserver = new MutationObserver(syncMenuLock);
    menuObserver.observe(document.body, {
      attributes: true,
      attributeFilter: ["data-menu-open"],
    });

    return () => {
      gsap.ticker.remove(onTick);
      menuObserver.disconnect();
      instance.destroy();
      lenisRef.current = null;
      setLenis(null);
    };
  }, []);

  return <LenisContext.Provider value={lenis}>{children}</LenisContext.Provider>;
}
