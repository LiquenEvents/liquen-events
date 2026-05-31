import blurMap from "./blur-map.json";

/**
 * Blur-up placeholders for images. The map is generated from the real images
 * by `npm run gen:blur` (scripts/gen-blur.mjs). Spread the result onto a
 * next/image: `<Image {...blurFor(src)} ... />` to get an elegant fade-in
 * from a tiny blurred version instead of a blank flash.
 */
const map = blurMap as Record<string, string>;

// Neutral dark placeholder for any image not present in the map.
const FALLBACK =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vOdgAA=";

export function blurFor(src: string): { placeholder: "blur"; blurDataURL: string } {
  return { placeholder: "blur", blurDataURL: map[src] ?? FALLBACK };
}
