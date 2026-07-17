"use client";

import { useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

interface Props {
  to: number;
  /** Value the count starts from (default 0). Use a nearby base for years so
   *  every intermediate frame is a plausible number (e.g. from=2000 → 2018). */
  from?: number;
  suffix?: string;
  prefix?: string;
  duration?: number;
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Count-up number that ticks from `from` to `to` once, when scrolled into view.
 *
 * SSR / no-JS / reduced-motion safe: the initial (and server-rendered) state is
 * the FINAL value, so anyone without JS — or who asks for reduced motion — sees
 * the real number immediately, never a stuck 0. A layout effect re-seeds it to
 * `from` synchronously before the first paint, then a single IntersectionObserver
 * (fires once, then disconnects — no scroll listener) drives a bounded rAF that
 * stops on completion. Only text content changes; no layout thrash.
 */
export default function CountUp({
  to,
  from = 0,
  suffix = "",
  prefix = "",
  duration = 1800,
}: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  // Start at the FINAL value (SSR + no-JS + reduced-motion all show the truth).
  const [value, setValue] = useState(to);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion (or no IntersectionObserver): leave the final value, no count.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    setValue(from); // seed the start synchronously, before paint
    let raf = 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect(); // fire once
        const t0 = performance.now();
        const tick = (now: number) => {
          const p = Math.min((now - t0) / duration, 1);
          setValue(Math.round(from + easeOutCubic(p) * (to - from)));
          if (p < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.5 },
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      if (raf) cancelAnimationFrame(raf);
    };
  }, [to, from, duration]);

  return (
    <span ref={ref}>
      {prefix}
      {value}
      {suffix}
    </span>
  );
}
