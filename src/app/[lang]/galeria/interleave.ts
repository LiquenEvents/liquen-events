import type { PhotoSrc } from "./photos-data";
import { collectionFor } from "./collections";

/**
 * Photo enriched server-side with its real aspect ratio and (for the tiles that
 * paint first) a blur placeholder. `blurDataURL` is OPTIONAL: to keep the
 * gallery's initial payload small we only ship blur data for the first screenful
 * (see galeria/page.tsx) — the rest gracefully fall back to the gallery's near-
 * black background while their image decodes. `aspectRatio` is present on every
 * photo because the masonry layout needs it up front.
 *
 * This module is deliberately framework-neutral (no "use client") so the server
 * page can compute the exact first-paint order and enrich only those photos.
 */
export interface Photo extends PhotoSrc {
  blurDataURL?: string;
  aspectRatio: string;
}

/** The event/collection bucket a photo belongs to (named couple, else its
    category). Photos with no bucket match still cluster by category. */
export function bucketKey(p: Photo): string {
  return collectionFor(p.src) ?? `cat:${p.label}`;
}

// Stable per-string hash → [0,1). Deterministic (same on server + client, so
// no hydration mismatch) and independent of array position, so it seeds a
// reproducible "shuffle" without any global RNG state. FNV-1a.
function hashUnit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Spread photos so the grid feels genuinely shuffled — no two consecutive
 * photos from the same event, every collection appearing throughout (not
 * bunched), AND no rigid repeating pattern.
 *
 * Method: within its own bucket each photo gets an evenly-stepped position
 * `(j + 0.5) / size`, so a big shoot's frames land ~1/frequency apart across
 * the whole list (never bunched). Crucially, each bucket is then rotated by its
 * OWN random phase (`hashUnit(key)`, wrapped into [0,1)) — so the shoots don't
 * all start at 0 and fall into a mechanical A,B,C,A,B,C rotation; they
 * interleave at different offsets, reading as a real shuffle. A small per-photo
 * jitter breaks any residual lock-step. Fully deterministic (same on SSR +
 * client — no hydration mismatch). A final de-adjacency pass removes the rare
 * same-event neighbour.
 *
 * `seed` re-rolls the arrangement per visit: mixed into every hash input so the
 * per-bucket phase, jitter and tiebreak all shift together — a genuinely
 * different (but still well-spread, no-bunching) order each time. Empty seed on
 * the server + first client render keeps SSR and hydration identical; the client
 * swaps in a random seed once mounted (see `orderSeed`), so each entry differs
 * while the order stays fixed for the whole visit (never reshuffles mid-scroll).
 */
export function interleaveByCollection(list: Photo[], seed = ""): Photo[] {
  const buckets = new Map<string, Photo[]>();
  const order: string[] = [];
  for (const p of list) {
    const key = bucketKey(p);
    let arr = buckets.get(key);
    if (!arr) {
      arr = [];
      buckets.set(key, arr);
      order.push(key);
    }
    arr.push(p);
  }
  const ranked: { p: Photo; rank: number }[] = [];
  for (const key of order) {
    const arr = buckets.get(key)!;
    const phase = hashUnit(key + seed); // per-bucket rotation → staggered interleave
    for (let j = 0; j < arr.length; j++) {
      const jitter = (hashUnit(arr[j].src + seed) - 0.5) * 0.12;
      let rank = (j + 0.5) / arr.length + phase + jitter;
      rank -= Math.floor(rank); // wrap into [0,1)
      ranked.push({ p: arr[j], rank });
    }
  }
  ranked.sort((a, b) => a.rank - b.rank || hashUnit(a.p.src + seed) - hashUnit(b.p.src + seed));
  return deAdjacent(ranked.map((r) => r.p));
}

/**
 * Final safety pass: keep same-event photos apart. Beyond the immediate
 * neighbour, it enforces a WINDOW — no photo may share its event with any of the
 * `window` photos just before it — so a big shoot never shows two of its frames
 * a tile or two apart (which in a 2–3 column masonry reads as "fotos do mesmo
 * evento juntas"). For each violation it pulls forward the nearest later photo
 * whose event isn't in that window. When no such photo exists (the tail, or a
 * category that is a single shoot) it's left as-is — best effort.
 */
function deAdjacent(list: Photo[], window = 3): Photo[] {
  const out = [...list];
  for (let i = 1; i < out.length; i++) {
    const recent = new Set<string>();
    for (let k = Math.max(0, i - window); k < i; k++) recent.add(bucketKey(out[k]));
    if (!recent.has(bucketKey(out[i]))) continue;
    let swap = -1;
    for (let j = i + 1; j < out.length; j++) {
      if (!recent.has(bucketKey(out[j]))) {
        swap = j;
        break;
      }
    }
    if (swap !== -1) {
      const [moved] = out.splice(swap, 1);
      out.splice(i, 0, moved);
    }
  }
  return out;
}
