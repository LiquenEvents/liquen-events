let cached: boolean | null = null;

/**
 * Cached check for whether a WebGL context can actually be created.
 *
 * OGL's Renderer calls `console.error('unable to create webgl context')` the
 * moment `getContext` returns null (headless/no-GPU environments, ancient
 * devices) — which fires *before* our try/catch can swallow the throw, and
 * surfaces as a console error in audits. Gating every WebGL layer on this
 * check means we never even ask OGL to build a renderer when the platform
 * can't support one, so there's no error to log. The probe runs once and the
 * result is memoised (one throwaway canvas for the whole session).
 */
export function webglAvailable(): boolean {
  if (cached !== null) return cached;
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    cached = !!(
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl")
    );
  } catch {
    cached = false;
  }
  return cached;
}

/**
 * Device-pixel-ratio cap for the WebGL layers. Every OGL renderer used to run
 * at `min(dpr, 2)`, i.e. 4× the pixels on a 2× display and up to 9× on a 3×
 * phone — the single biggest GPU cost of the whole motion layer, and the main
 * reason weaker devices stutter. These effects are *subtle overlays* over a
 * full-resolution DOM image (the real photo is a separate <img>), so their own
 * buffer doesn't need the display's full density: dropping to 1.5× (1.25× on
 * coarse-pointer phones/tablets, where DPR is highest and GPUs weakest) cuts
 * fill-rate roughly in half or more with no perceptible change to the effect.
 * Purely a resolution trade — nothing is removed.
 */
export function glDpr(): number {
  if (typeof window === "undefined") return 1;
  const dpr = window.devicePixelRatio || 1;
  const coarse = window.matchMedia?.("(pointer: coarse)")?.matches;
  return Math.min(dpr, coarse ? 1.25 : 1.5);
}
