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
