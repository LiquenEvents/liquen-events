"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

gsap.registerPlugin(ScrollTrigger);

type Variant = "rise" | "fade" | "mask";

/**
 * Scroll-reveal primitive driven by GSAP ScrollTrigger (which tracks Lenis'
 * smoothed scroll — see SmoothScroll). FOUC-safe: the hidden "from" state is
 * applied in a layout effect, before the first paint, and never on the server —
 * so no-JS / reduced-motion users just see the content, fully visible.
 *
 * - `rise`  — fade + gentle upward glide (the workhorse).
 * - `fade`  — opacity only.
 * - `mask`  — a clip-path wipe, as if the image/line is uncovered. Cinematic;
 *             use on hero-grade images and display headings.
 * `stagger` animates the element's direct children in sequence instead.
 */
export default function Reveal({
  children,
  variant = "rise",
  as: Tag = "div",
  className,
  delay = 0,
  y = 42,
  duration = 1.1,
  stagger,
  start = "top 85%",
}: {
  children: ReactNode;
  variant?: Variant;
  as?: ElementType;
  className?: string;
  delay?: number;
  y?: number;
  duration?: number;
  stagger?: number | boolean;
  start?: string;
}) {
  const ref = useRef<HTMLElement | null>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion()) return;

    const targets: gsap.TweenTarget = stagger ? Array.from(el.children) : el;
    const step = typeof stagger === "number" ? stagger : 0.09;
    const ease = "power3.out";

    const ctx = gsap.context(() => {
      const from =
        variant === "mask"
          ? { clipPath: "inset(0 0 100% 0)", y: y * 0.5, opacity: 1 }
          : variant === "fade"
            ? { opacity: 0 }
            : { opacity: 0, y };
      const to =
        variant === "mask"
          ? { clipPath: "inset(0 0 0% 0)", y: 0, opacity: 1 }
          : variant === "fade"
            ? { opacity: 1 }
            : { opacity: 1, y: 0 };

      gsap.set(targets, from);
      gsap.to(targets, {
        ...to,
        duration,
        delay,
        ease,
        stagger: stagger ? step : 0,
        scrollTrigger: { trigger: el, start, once: true },
      });
    }, el);

    return () => ctx.revert();
  }, [variant, delay, y, duration, stagger, start]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
