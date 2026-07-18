"use client";

import { useRef, type ReactNode } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * Tactile 3D tilt-on-hover wrapper — the "liquid glass" moment for the service
 * tiles. On a fine pointer the card tips toward the cursor in perspective and a
 * soft specular sheen tracks the pointer; on leave it eases back to flat.
 *
 * The whole effect is a couple of CSS transforms plus two custom properties
 * (`--mx`/`--my`) set on the root and *inherited* by a `[data-sheen]` child, so
 * it never reads or writes layout (no CLS) and stays cheap on the GPU. Pointer
 * updates are coalesced to one per frame with rAF. It is gated to mouse input
 * and disabled under prefers-reduced-motion, where the card simply sits flat —
 * keyboard focus and the underlying <Link> are never affected.
 */
export default function TiltCard({
  children,
  className,
  max = 7,
  fill = false,
}: {
  children: ReactNode;
  className?: string;
  /** Maximum tilt in degrees on each axis. */
  max?: number;
  /** Stretch the wrapper (and its inner) to 100% — for cards that must fill a
   *  fixed grid cell rather than size to their own aspect ratio. */
  fill?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);

  const write = (rx: number, ry: number, mx: number, my: number) => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", `${rx}deg`);
    el.style.setProperty("--ry", `${ry}deg`);
    el.style.setProperty("--mx", `${mx}%`);
    el.style.setProperty("--my", `${my}%`);
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse") return;
    if (prefersReducedMotion()) return;
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width; // 0..1
    const py = (e.clientY - r.top) / r.height; // 0..1
    const ry = (px - 0.5) * 2 * max; // pointer right → tip right
    const rx = -(py - 0.5) * 2 * max; // pointer down → tip toward viewer
    if (raf.current) cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => write(rx, ry, px * 100, py * 100));
  };

  const onLeave = () => {
    if (raf.current) cancelAnimationFrame(raf.current);
    write(0, 0, 50, 50);
  };

  return (
    <div
      ref={ref}
      className={className}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ perspective: "1000px", ...(fill ? { height: "100%", width: "100%" } : null) }}
    >
      <div
        style={{
          transform: "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))",
          transition: "transform 260ms cubic-bezier(0.16, 1, 0.3, 1)",
          willChange: "transform",
          ...(fill ? { height: "100%", width: "100%" } : null),
        }}
      >
        {children}
      </div>
    </div>
  );
}
