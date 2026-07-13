"use client";

import { useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

/**
 * Magnetic hover: the wrapped element eases toward the pointer while hovered and
 * springs back on leave — the tactile micro-interaction premium sites use on
 * their CTAs. Fine-pointer only (no-op on touch), and disabled under reduced
 * motion. Renders an inline-block wrapper so it hugs the child. GSAP is loaded
 * lazily so it never sits in the initial JS payload; the pull becomes active
 * once its small chunk resolves.
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
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;
    if (!window.matchMedia("(pointer: fine)").matches) return;

    let cancelled = false;
    let cleanup: (() => void) | undefined;

    import("gsap").then(({ gsap }) => {
      if (cancelled) return;
      const node = ref.current;
      if (!node) return;

      const xTo = gsap.quickTo(node, "x", { duration: 0.5, ease: "power3.out" });
      const yTo = gsap.quickTo(node, "y", { duration: 0.5, ease: "power3.out" });

      const onMove = (e: PointerEvent) => {
        const r = node.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * strength);
        yTo((e.clientY - (r.top + r.height / 2)) * strength);
      };
      const onLeave = () => {
        xTo(0);
        yTo(0);
      };
      node.addEventListener("pointermove", onMove);
      node.addEventListener("pointerleave", onLeave);
      cleanup = () => {
        node.removeEventListener("pointermove", onMove);
        node.removeEventListener("pointerleave", onLeave);
        gsap.killTweensOf(node);
      };
    });

    return () => {
      cancelled = true;
      cleanup?.();
    };
  }, [strength]);

  return (
    <span ref={ref} className={`inline-block will-change-transform ${className ?? ""}`}>
      {children}
    </span>
  );
}
