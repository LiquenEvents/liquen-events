import type { CSSProperties } from "react";

export type HeroWord = { text: string; moss?: boolean };

/**
 * Server-rendered kinetic hero heading. Each word rises out of its baseline on
 * load via the pure-CSS `word-rise` animation (staggered by `--word-delay`) —
 * the same signature the homepage <h1> uses. No client JS and no hydration
 * surface, so it stays compatible with the statically prerendered pages, and
 * under prefers-reduced-motion the words simply appear (globals.css collapses
 * `word-rise` to opacity:1).
 *
 * `lines` is an array of lines; each line is an array of `{ text, moss }`
 * segments so a single visual line can mix default and moss-coloured words.
 * Words are split on whitespace and laid out with a flex gap (matching the
 * homepage), keeping reading order and spacing correct for screen readers.
 */
export default function KineticHeading({
  lines,
  className,
  style,
  step = 90,
  delay = 150,
}: {
  lines: HeroWord[][];
  className?: string;
  style?: CSSProperties;
  /** ms between consecutive words. */
  step?: number;
  /** ms before the first word rises. */
  delay?: number;
}) {
  let word = 0;
  return (
    <h1 className={className} style={style}>
      {lines.map((segments, li) => (
        <span key={li} className="flex flex-wrap" style={{ gap: "0.26em" }}>
          {segments.flatMap((seg, si) =>
            seg.text
              .split(/\s+/)
              .filter(Boolean)
              .map((w, wi) => {
                const d = delay + word * step;
                word += 1;
                return (
                  <span
                    key={`${si}-${wi}`}
                    className={`inline-block word-rise${seg.moss ? " text-moss" : ""}`}
                    style={{ "--word-delay": `${d}ms` } as CSSProperties}
                  >
                    {w}
                  </span>
                );
              }),
          )}
        </span>
      ))}
    </h1>
  );
}
