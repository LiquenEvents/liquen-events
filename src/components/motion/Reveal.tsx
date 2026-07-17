"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

type Variant = "rise" | "fade" | "mask";

/**
 * Scroll-reveal primitive driven by GSAP ScrollTrigger (which tracks Lenis'
 * smoothed scroll — see SmoothScroll). GSAP is loaded LAZILY so the ~27KB
 * runtime stays out of the initial payload; to keep it FOUC-safe despite the
 * async load, the hidden "from" state is applied SYNCHRONOUSLY with plain inline
 * styles in a layout effect (before first paint), and GSAP re-applies the
 * identical from-state when its chunk resolves — a seamless handoff. The effect
 * never runs on the server, so no-JS / reduced-motion users just see the content.
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

    const targets: HTMLElement[] = stagger ? (Array.from(el.children) as HTMLElement[]) : [el];
    const step = typeof stagger === "number" ? stagger : 0.09;

    // Hide synchronously, before paint — plain inline styles, no GSAP needed —
    // so above-the-fold reveals never flash before the async runtime lands.
    const applyHide = (t: HTMLElement) => {
      if (variant === "mask") {
        t.style.clipPath = "inset(0 0 100% 0)";
        t.style.transform = `translateY(${y * 0.5}px)`;
        t.style.willChange = "clip-path, transform";
      } else if (variant === "fade") {
        t.style.opacity = "0";
      } else {
        t.style.opacity = "0";
        t.style.transform = `translateY(${y}px)`;
        t.style.willChange = "transform";
      }
    };
    const clearHide = (t: HTMLElement) => {
      t.style.clipPath = "";
      t.style.transform = "";
      t.style.opacity = "";
      t.style.willChange = "";
      t.style.transition = "";
    };
    // Plain-CSS reveal to the final visible state — used only as the degraded
    // fallback when the lazy GSAP chunk is slow or fails. It transitions to the
    // same end state GSAP would land on, so content is never left stuck hidden.
    const cssReveal = (t: HTMLElement) => {
      const ease = "cubic-bezier(0.16, 1, 0.3, 1)";
      if (variant === "mask") {
        t.style.transition = `clip-path ${duration}s ${ease}, transform ${duration}s ${ease}`;
        t.style.clipPath = "inset(0 0 0% 0)";
        t.style.transform = "translateY(0px)";
      } else if (variant === "fade") {
        t.style.transition = `opacity ${duration}s ${ease}`;
        t.style.opacity = "1";
      } else {
        t.style.transition = `opacity ${duration}s ${ease}, transform ${duration}s ${ease}`;
        t.style.opacity = "1";
        t.style.transform = "translateY(0px)";
      }
    };
    for (const t of targets) applyHide(t);

    let ctx: { revert: () => void } | undefined;
    let cancelled = false;
    let gsapReady = false;

    // Time-based failsafe: if the ~27KB GSAP chunk hasn't resolved within
    // FAILSAFE_MS (slow network, offline, or a failed request), reveal the
    // content with a plain-CSS transition and skip the GSAP handoff, so
    // above-the-fold content can never be stranded in its hidden "from" state.
    // On a normal load GSAP resolves well within this window and clears the
    // timer, leaving the cinematic ScrollTrigger reveal completely intact.
    const FAILSAFE_MS = 1200;
    const failsafe = window.setTimeout(() => {
      if (gsapReady || cancelled || !ref.current) return;
      cancelled = true; // block the pending GSAP handoff from re-hiding/replaying
      for (const t of targets) cssReveal(t);
    }, FAILSAFE_MS);

    Promise.all([import("gsap"), import("gsap/ScrollTrigger")])
      .then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled || !ref.current) return;
        gsapReady = true;
        window.clearTimeout(failsafe);
        gsap.registerPlugin(ScrollTrigger);
        const ease = "power3.out";
        ctx = gsap.context(() => {
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
      })
      .catch(() => {
        // Chunk failed to load — clear the inline hide so content is never
        // left stuck invisible.
        if (cancelled || !ref.current) return;
        cancelled = true;
        window.clearTimeout(failsafe);
        for (const t of targets) clearHide(t);
      });

    return () => {
      cancelled = true;
      window.clearTimeout(failsafe);
      if (ctx) ctx.revert();
      // GSAP never loaded (slow chunk / unmounted first) — clear the inline hide
      // so content is never left stuck invisible.
      else for (const t of targets) clearHide(t);
    };
  }, [variant, delay, y, duration, stagger, start]);

  return (
    <Tag ref={ref} className={className}>
      {children}
    </Tag>
  );
}
