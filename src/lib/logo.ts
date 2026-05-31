import logoDims from "./logo-dims.json";

/**
 * Optical sizing for client logos. Logos vary wildly in shape (thin wordmarks
 * vs square marks), so a single height makes some dominate. We size each logo
 * by AREA — every logo occupies a similar visual area — within a clamped
 * height range, which is the balanced "logo wall" approach.
 */
const DIMS = logoDims as Record<string, number[]>;

export function logoDimsFor(src: string): number[] {
  return DIMS[src] ?? [400, 120];
}

export function logoHeight(src: string, targetArea = 1600, min = 26, max = 46): number {
  const d = DIMS[src];
  if (!d || !d[1]) return Math.round(Math.sqrt(targetArea));
  const ratio = d[0] / d[1];
  return Math.round(Math.max(min, Math.min(max, Math.sqrt(targetArea / ratio))));
}
