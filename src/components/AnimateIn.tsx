"use client";

import { useEffect, useRef, useState } from "react";

interface Props {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  from?: "bottom" | "left" | "right" | "fade" | "clip";
}

export default function AnimateIn({ children, className = "", delay = 0, from = "bottom" }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Respect users who prefer reduced motion: reveal immediately, skip the
    // observer-driven transition entirely (matches the CSS @media handling).
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
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
