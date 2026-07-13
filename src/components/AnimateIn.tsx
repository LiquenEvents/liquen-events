"use client";

import { useRef, useState } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  from?: "bottom" | "left" | "right" | "fade" | "clip";
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
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
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
        willChange: "opacity, transform",
      }}
      onTransitionEnd={() => {
        if (visible && ref.current) {
          ref.current.style.willChange = "auto";
        }
      }}
    >
      {children}
    </div>
  );
}
