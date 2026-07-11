"use client";

import { useEffect, useRef } from "react";

/**
 * Subtle scroll parallax, engineered so NATIVE scrolling never pays for it:
 *
 *  - One shared scroll/resize listener + one rAF drives every instance on the
 *    page (not a loop per element).
 *  - Zero layout reads during scroll. Element positions are measured once
 *    (mount, resize, window load) into document-space coordinates; each frame
 *    only reads `window.scrollY` and writes transforms. No getBoundingClientRect
 *    per frame ⇒ no layout thrashing, no forced reflows.
 *  - Transform-only writes (compositor work), skipped entirely while the
 *    element is far off-screen, and skipped when the value didn't change.
 *  - Inert under prefers-reduced-motion.
 *
 * NB: the parent needs `overflow-hidden`, and the child some scale headroom
 * (e.g. `hero-settle` or `scale-110`), so the drift never exposes edges.
 */
interface Item {
  el: HTMLElement;
  speed: number;
  top: number; // document-space top (transform-compensated)
  height: number;
  shift: number; // last applied translateY
}

const items = new Set<Item>();
let raf = 0;
let listening = false;

function measureAll() {
  const y = window.scrollY;
  // Read phase only — all rects first, no interleaved writes.
  for (const it of items) {
    const r = it.el.getBoundingClientRect();
    // The rect already includes our own transform; subtract it to get the
    // element's untransformed document position.
    it.top = r.top + y - it.shift;
    it.height = r.height;
  }
  schedule();
}

function frame() {
  raf = 0;
  const y = window.scrollY;
  const vh = window.innerHeight;
  const viewCentre = y + vh / 2;
  for (const it of items) {
    const offset = it.top + it.height / 2 - viewCentre;
    // Far off-screen: nothing to move (bail before any DOM write).
    if (offset > vh * 1.5 || offset < -vh * 1.5) continue;
    const shift = Math.round(-offset * it.speed * 10) / 10;
    if (shift !== it.shift) {
      it.shift = shift;
      it.el.style.transform = `translate3d(0, ${shift}px, 0)`;
    }
  }
}

function schedule() {
  if (!raf) raf = requestAnimationFrame(frame);
}

let resizeRaf = 0;
function onResize() {
  if (resizeRaf) return;
  resizeRaf = requestAnimationFrame(() => {
    resizeRaf = 0;
    measureAll();
  });
}

function listen() {
  if (listening) return;
  listening = true;
  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", onResize, { passive: true });
  // Late layout shifts (images/fonts settling) move everything below them.
  window.addEventListener("load", measureAll);
}

function unlisten() {
  if (!listening || items.size > 0) return;
  listening = false;
  window.removeEventListener("scroll", schedule);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("load", measureAll);
  if (raf) cancelAnimationFrame(raf);
  raf = 0;
}

interface Props {
  children: React.ReactNode;
  className?: string;
  /** Fraction of the element's distance-from-viewport-centre to counter-move.
      0.1–0.2 is cinematic; beyond that it reads as a gimmick. */
  speed?: number;
}

export default function Parallax({ children, className = "", speed = 0.12 }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;

    const item: Item = { el, speed, top: 0, height: 0, shift: 0 };
    items.add(item);
    el.style.willChange = "transform";
    listen();

    // Measure this item now (others keep their cached geometry) and place it.
    const r = el.getBoundingClientRect();
    item.top = r.top + window.scrollY;
    item.height = r.height;
    schedule();
    // One late re-measure catches content that settles after hydration.
    const settle = window.setTimeout(measureAll, 900);

    return () => {
      window.clearTimeout(settle);
      items.delete(item);
      el.style.willChange = "";
      el.style.transform = "";
      unlisten();
    };
  }, [speed]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
