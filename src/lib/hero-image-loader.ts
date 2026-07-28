/**
 * Custom next/image loader for the six full-bleed page heroes.
 *
 * Instead of routing through the on-demand `/_next/image` optimizer (which
 * cold-encodes on the first request after a deploy — the visible "blur, then it
 * snaps sharp" gap), it points each srcset candidate at a static WebP that
 * `scripts/pregen-heroes.mjs` produces at build time: `/_img/<key>-<w>.webp`.
 * So the very first visitor gets the fully-optimized hero with zero encode
 * latency.
 *
 * Used via the `<HeroImage>` client wrapper (a function loader can't be passed
 * as a prop from a Server Component). Keep HERO_SOURCES / HERO_WIDTHS / the key
 * sanitiser in sync with scripts/pregen-heroes.mjs.
 */
import type { ImageLoaderProps } from "next/image";

// The widths pregen-heroes.mjs emits. Each srcset candidate rounds up to the
// nearest of these (and clamps to the largest).
export const HERO_WIDTHS = [640, 1080, 1536, 2048] as const;

// The six sources that have pre-generated files. Anything else falls through to
// the default optimizer so <HeroImage> can't silently 404 on an unknown src.
const HERO_SOURCES = new Set([
  "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/DaniGui_Preview20.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/EW1_1393.jpg",
]);

/** Basename without extension, non-[A-Za-z0-9_-] collapsed to "_". */
export function heroKey(src: string): string {
  const base = (src.split("/").pop() ?? src).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Round a requested width up to the nearest pre-generated width. */
export function snapHeroWidth(width: number): number {
  return HERO_WIDTHS.find((w) => w >= width) ?? HERO_WIDTHS[HERO_WIDTHS.length - 1];
}

/** The static path a given hero + width resolves to. */
export function heroImageUrl(src: string, width: number): string {
  return `/_img/${heroKey(src)}-${snapHeroWidth(width)}.webp`;
}

export function heroImageLoader({ src, width, quality }: ImageLoaderProps): string {
  if (HERO_SOURCES.has(src)) return heroImageUrl(src, width);
  // Defensive fallback: mirror the built-in optimizer URL so an unexpected src
  // still renders (just without pre-generation).
  return `/_next/image?url=${encodeURIComponent(src)}&w=${width}&q=${quality ?? 75}`;
}
