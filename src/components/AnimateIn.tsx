"use client";

import { useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  from?: "bottom" | "left" | "right" | "fade" | "clip";
}

// AnimateIn is rendered dozens of times per page. Instead of each instance
// spinning up its OWN IntersectionObserver, they all share a SINGLE module-level
// observer. Each element registers a one-shot reveal callback in a WeakMap; when
// the shared observer reports the element intersecting, it fires that callback
// once and stops watching the element. N reveals therefore cost one observer, not
// N — with byte-for-byte the same threshold / rootMargin, so the reveal geometry
// is identical to the previous per-instance observers.
type RevealCallback = () => void;

let sharedObserver: IntersectionObserver | null = null;
const revealCallbacks = new WeakMap<Element, RevealCallback>();

function getSharedObserver(): IntersectionObserver {
  if (sharedObserver) return sharedObserver;
  sharedObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const cb = revealCallbacks.get(entry.target);
        if (cb) {
          // Fire once, then stop watching this element (mirrors the original
          // per-instance `observer.disconnect()` after the first intersection).
          revealCallbacks.delete(entry.target);
          sharedObserver!.unobserve(entry.target);
          cb();
        }
      }
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
  );
  return sharedObserver;
}

function observeReveal(el: Element, cb: RevealCallback) {
  revealCallbacks.set(el, cb);
  getSharedObserver().observe(el);
}

function unobserveReveal(el: Element) {
  if (!revealCallbacks.has(el)) return;
  revealCallbacks.delete(el);
  sharedObserver?.unobserve(el);
}

export default function AnimateIn({ children, className = "", delay = 0, from = "bottom" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  // Start VISIBLE so the server HTML — and anyone whose JS fails or is disabled —
  // always sees the content (previously the SSR markup was opacity:0, leaving it
  // permanently invisible without JS). The layout effect re-hides it before the
  // first paint to play the scroll reveal, so there's no flash.
  const [visible, setVisible] = useState(true);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion (and no IntersectionObserver): leave it visible, no reveal.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    setVisible(false); // hide synchronously, before paint
    observeReveal(el, () => setVisible(true));
    return () => unobserveReveal(el);
  }, []);

  const transforms: Record<string, string> = {
    bottom: "translateY(28px)",
    left: "translateX(-28px)",
    right: "translateX(28px)",
    fade: "none",
    clip: "translateY(16px)",
  };

  const isClip = from === "clip";
  const easing = `cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`;

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : isClip ? 1 : 0,
        transform: visible ? "none" : transforms[from],
        clipPath: isClip ? (visible ? "inset(0 0 0% 0)" : "inset(0 0 100% 0)") : undefined,
        transition: isClip
          ? `transform 0.75s ${easing}, clip-path 0.75s ${easing}`
          : `opacity 0.75s ${easing}, transform 0.75s ${easing}`,
        // Only hint the compositor while the element is armed (hidden, waiting to
        // reveal). Once revealed — and under reduced motion / no-JS, where it's
        // permanently visible and never animates — drop the hint so we don't pin
        // a compositor layer forever on dozens of instances per page.
        willChange: visible ? undefined : isClip ? "transform, clip-path" : "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
