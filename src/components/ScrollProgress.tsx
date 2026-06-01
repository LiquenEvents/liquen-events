"use client";

import { useEffect, useRef } from "react";

/**
 * Thin moss progress line pinned to the very top of the viewport.
 * Reflects how far the page has been scrolled — a subtle, premium
 * structural cue. Hidden inside the full-screen orçamento wizard.
 *
 * The bar is driven imperatively: the scroll handler writes the transform
 * straight to the DOM, coalesced to one update per animation frame via rAF.
 * This avoids a React re-render on every scroll tick (the bar reflects a
 * continuous value), keeping the main thread free and scrolling smooth (INP).
 */
export default function ScrollProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = document.documentElement;
    const bar = barRef.current;
    if (!bar) return;

    let frame = 0;
    const apply = () => {
      frame = 0;
      const max = root.scrollHeight - root.clientHeight;
      const progress = max > 0 ? Math.min(root.scrollTop / max, 1) : 0;
      bar.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return (
    <div className="scroll-progress fixed top-0 left-0 right-0 z-[60] h-[2px] pointer-events-none">
      <div
        ref={barRef}
        className="h-full bg-gradient-to-r from-moss-dark via-moss to-moss-light origin-left"
        style={{ transform: "scaleX(0)", transition: "transform 0.1s linear" }}
      />
    </div>
  );
}
