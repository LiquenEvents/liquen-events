/**
 * Motion helpers shared by the film's scenes.
 */

export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const easeOutQuint = (t: number): number => 1 - Math.pow(1 - t, 5);

/**
 * Piecewise scroll: divides the scroll into `stops` segments, easing through
 * each and dwelling between them — reads like a person browsing, not a
 * conveyor belt.
 *
 * @param t        overall progress 0..1
 * @param stops    number of scroll movements (e.g. 4 = 4 sections)
 * @param dwell    fraction of each segment spent paused (0..0.9)
 * @returns        eased scroll progress 0..1
 */
export function steppedScroll(t: number, stops: number, dwell = 0.3): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const seg = 1 / stops;
  const i = Math.min(Math.floor(t / seg), stops - 1);
  const local = (t - i * seg) / seg; // 0..1 within this segment
  const moveWindow = 1 - dwell;
  const moved = local >= moveWindow ? 1 : easeInOutCubic(local / moveWindow);
  return (i + moved) / stops;
}
