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
    let last = -1;
    // Cache the scrollable range. `scrollHeight` is a layout-derived read; doing
    // it every scroll frame risks a forced reflow whenever something else dirtied
    // layout between ticks. Measure it only when the page can actually change
    // height (resize + a ResizeObserver on <body>) and keep the scroll hot path
    // reading nothing but scrollTop.
    let max = root.scrollHeight - root.clientHeight;
    const measure = () => {
      max = root.scrollHeight - root.clientHeight;
    };
    const apply = () => {
      frame = 0;
      const progress = max > 0 ? Math.min(root.scrollTop / max, 1) : 0;
      // Skip the DOM write when the value hasn't moved (e.g. resize ticks at the
      // same scroll position) so we don't re-trigger the transform/transition.
      if (progress === last) return;
      last = progress;
      bar.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onResize = () => {
      measure();
      schedule();
    };

    apply();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    // Content that changes page height without a resize event (images loading,
    // the gallery appending tiles, accordions opening) keeps `max` fresh here.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => {
            measure();
            schedule();
          })
        : null;
    ro?.observe(document.body);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", onResize);
      ro?.disconnect();
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
