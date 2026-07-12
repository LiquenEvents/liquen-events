"use client";

import { useRef } from "react";
import { gsap } from "gsap";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

/**
 * A soft ring that trails the pointer and blooms over interactive elements —
 * a premium accent that keeps the NATIVE cursor (safer for a conversion site
 * than hiding it). Fine-pointer only; absent under reduced motion. `mix-blend`
 * keeps it legible over both the dark hero and the light sections.
 */
export default function Cursor() {
  const ringRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const ring = ringRef.current;
    if (!ring || prefersReducedMotion()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    gsap.set(ring, { xPercent: -50, yPercent: -50, opacity: 0, scale: 1 });
    const xTo = gsap.quickTo(ring, "x", { duration: 0.45, ease: "power3.out" });
    const yTo = gsap.quickTo(ring, "y", { duration: 0.45, ease: "power3.out" });

    let shown = false;
    const onMove = (e: PointerEvent) => {
      xTo(e.clientX);
      yTo(e.clientY);
      if (!shown) {
        shown = true;
        gsap.to(ring, { opacity: 1, duration: 0.3 });
      }
      // grow + tint when hovering something interactive
      const interactive = !!(e.target as Element)?.closest?.(
        "a, button, [role='button'], input, textarea, select, [data-cursor]",
      );
      gsap.to(ring, {
        scale: interactive ? 1.8 : 1,
        borderColor: interactive ? "rgba(99,122,95,0.9)" : "rgba(255,255,255,0.55)",
        duration: 0.3,
        overwrite: "auto",
      });
    };
    const onLeave = () => gsap.to(ring, { opacity: 0, duration: 0.3 });

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      gsap.killTweensOf(ring);
    };
  }, []);

  return (
    <div
      ref={ringRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] hidden h-8 w-8 rounded-full border mix-blend-difference lg:block"
      // opacity:0 by default so it stays hidden unless JS activates it (i.e. it
      // never shows under reduced motion, where the effect early-returns before
      // wiring the follow/fade-in).
      style={{ opacity: 0, borderColor: "rgba(255,255,255,0.55)", willChange: "transform" }}
    />
  );
}
