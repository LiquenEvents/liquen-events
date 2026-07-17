"use client";

import { useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

/**
 * Magnetic hover: the wrapped element eases toward the pointer while hovered and
 * springs back on leave — the tactile micro-interaction premium sites use on
 * their CTAs. Fine-pointer only (no-op on touch), and disabled under reduced
 * motion. Renders an inline-block wrapper so it hugs the child.
 *
 * The follow is a tiny self-contained requestAnimationFrame lerp: each frame the
 * current translate is interpolated toward the target (the pointer offset scaled
 * by `strength`), which produces the same exponential-decay "power3.out" settle
 * GSAP's `quickTo` gave — pointer retargets continuously, leave targets zero, so
 * it eases back to center. The smoothing is frame-rate independent (`1 - e^-kt`)
 * so it feels identical on 60/120Hz displays. No animation library ships.
 */
export default function Magnetic({
  children,
  strength = 0.35,
  className,
}: {
  children: ReactNode;
  strength?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (!node || prefersReducedMotion()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    // Per-second smoothing rate. Tuned to match GSAP's duration:0.5 power3.out
    // settle — the element covers most of the gap in ~0.3s and eases the rest.
    const SMOOTH = 11;

    let curX = 0;
    let curY = 0;
    let tgtX = 0;
    let tgtY = 0;
    let raf = 0;
    let last = 0;

    const tick = (now: number) => {
      const dt = last ? Math.min((now - last) / 1000, 0.05) : 1 / 60;
      last = now;

      // Frame-rate-independent exponential approach toward the target.
      const a = 1 - Math.exp(-SMOOTH * dt);
      curX += (tgtX - curX) * a;
      curY += (tgtY - curY) * a;

      const settled = Math.abs(tgtX - curX) < 0.01 && Math.abs(tgtY - curY) < 0.01;
      if (settled) {
        curX = tgtX;
        curY = tgtY;
      }
      node.style.transform = `translate(${curX}px, ${curY}px)`;

      // Keep spinning until we've converged on the current target; then idle
      // (a held-still hover or a completed ease-back to center both stop here).
      if (!settled) {
        raf = requestAnimationFrame(tick);
      } else {
        raf = 0;
      }
    };

    const ensureRunning = () => {
      if (!raf) {
        last = 0;
        raf = requestAnimationFrame(tick);
      }
    };

    const onMove = (e: PointerEvent) => {
      const r = node.getBoundingClientRect();
      tgtX = (e.clientX - (r.left + r.width / 2)) * strength;
      tgtY = (e.clientY - (r.top + r.height / 2)) * strength;
      ensureRunning();
    };
    const onLeave = () => {
      tgtX = 0;
      tgtY = 0;
      ensureRunning();
    };

    node.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);

    return () => {
      node.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      node.style.transform = "";
    };
  }, [strength]);

  return (
    <span ref={ref} className={`inline-block will-change-transform ${className ?? ""}`}>
      {children}
    </span>
  );
}
