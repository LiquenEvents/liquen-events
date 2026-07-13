"use client";

import { useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

/**
 * A soft ring that trails the pointer and blooms over interactive elements —
 * a premium accent that keeps the NATIVE cursor (safer for a conversion site
 * than hiding it). Fine-pointer only; absent under reduced motion. `mix-blend`
 * keeps it legible over both the dark hero and the light sections.
 *
 * Deliberately NOT driven by GSAP: GSAP's global ticker runs a rAF every frame
 * for as long as it has work, and that continuous loop starves React's
 * experimental View Transitions (the gallery lightbox close would fire but the
 * transition never committed). This self-terminating rAF only spins while the
 * ring is catching up to the pointer, then idles — leaving the main thread free
 * for the browser's transition frames.
 */
export default function Cursor() {
  const ringRef = useRef<HTMLDivElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const ring = ringRef.current;
    if (!ring || prefersReducedMotion()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let tx = 0;
    let ty = 0;
    let cx = 0;
    let cy = 0;
    let scale = 1;
    let targetScale = 1;
    let raf = 0;
    let shown = false;

    const render = () => {
      cx += (tx - cx) * 0.2;
      cy += (ty - cy) * 0.2;
      scale += (targetScale - scale) * 0.2;
      ring.style.transform = `translate(${cx}px, ${cy}px) translate(-50%, -50%) scale(${scale})`;
      const settled =
        Math.abs(tx - cx) < 0.1 && Math.abs(ty - cy) < 0.1 && Math.abs(targetScale - scale) < 0.01;
      raf = settled ? 0 : requestAnimationFrame(render);
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(render);
    };

    const onMove = (e: PointerEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!shown) {
        shown = true;
        ring.style.opacity = "1";
      }
      const interactive = !!(e.target as Element)?.closest?.(
        "a, button, [role='button'], input, textarea, select, [data-cursor]",
      );
      targetScale = interactive ? 1.8 : 1;
      ring.style.borderColor = interactive ? "rgba(99,122,95,0.9)" : "rgba(255,255,255,0.55)";
      kick();
    };
    const onLeave = () => {
      ring.style.opacity = "0";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={ringRef}
      aria-hidden
      className="pointer-events-none fixed left-0 top-0 z-[70] hidden h-8 w-8 rounded-full border mix-blend-difference lg:block"
      style={{
        opacity: 0,
        borderColor: "rgba(255,255,255,0.55)",
        willChange: "transform",
        transition: "opacity 0.3s ease",
      }}
    />
  );
}
