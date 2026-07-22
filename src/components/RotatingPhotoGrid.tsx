"use client";

import { useState } from "react";
import Image from "next/image";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

export type GridPic = { src: string; blurDataURL?: string };
export type GridCell = { cls: string; sizes: string };

// Fisher–Yates: an unbiased random sample of `n` distinct items from the pool.
function sample<T>(pool: T[], n: number): T[] {
  const a = pool.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, n);
}

/**
 * A bordered/masonry photo grid whose images are drawn fresh from a larger pool
 * on every entry to the page — so the wall feels alive and repeat visitors keep
 * seeing new work.
 *
 * Hydration-safe: the first render (server + first client paint) always shows
 * the pool's first `cells.length` images, so SSR and hydration match exactly.
 * A layout effect then swaps in a random selection BEFORE the browser paints, so
 * JS visitors never see the default set flash; no-JS visitors simply keep it.
 * This is a content change, not motion, so nothing here needs reduced-motion
 * gating — the per-tile hover/scale below is pure CSS and already subtle.
 */
export default function RotatingPhotoGrid({
  cells,
  pool,
  alt,
  className = "",
  imgClassName = "",
  overlayClassName = "bg-black/15 group-hover:bg-black/0",
  quality = 75,
}: {
  cells: GridCell[];
  pool: GridPic[];
  alt: string;
  className?: string;
  imgClassName?: string;
  overlayClassName?: string;
  quality?: number;
}) {
  const n = cells.length;
  const [pics, setPics] = useState<GridPic[]>(() => pool.slice(0, n));

  useIsomorphicLayoutEffect(() => {
    if (pool.length > n) setPics(sample(pool, n));
    // pool identity is stable (module-level array) — run once per mount/entry.
  }, []);

  return (
    <div className={className}>
      {cells.map((cell, i) => {
        const p = pics[i] ?? pool[i % pool.length];
        return (
          <div key={i} className={`relative overflow-hidden group ${cell.cls}`}>
            <Image
              src={p.src}
              alt={alt}
              fill
              sizes={cell.sizes}
              // Full quality (75) — these frames are real portfolio photos, and
              // WebP-only keeps them fast to encode/serve without lowering it.
              quality={quality}
              className={`object-cover ${imgClassName}`}
              {...(p.blurDataURL
                ? { placeholder: "blur" as const, blurDataURL: p.blurDataURL }
                : {})}
            />
            <div
              className={`absolute inset-0 transition-colors duration-500 ${overlayClassName}`}
            />
          </div>
        );
      })}
    </div>
  );
}
