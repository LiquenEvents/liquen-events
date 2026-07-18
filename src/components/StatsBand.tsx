"use client";

import CountUp from "@/components/CountUp";

export interface Stat {
  /** Target value the numeral counts up to. */
  value: number;
  /** Value the count starts from (default 0). See CountUp for the years note. */
  from?: number;
  /** Optional suffix glued to the numeral (e.g. "+"). */
  suffix?: string;
  /** Small uppercase label beneath the numeral. */
  label: string;
}

interface Props {
  stats: Stat[];
  /** Optional small uppercase eyebrow, centred above the band. */
  eyebrow?: string;
  className?: string;
}

/**
 * SpaceX vehicle-page STATS band: giant thin count-up numerals (D-DIN feel —
 * `font-light` + the display negative-tracking) with small wide-tracked
 * uppercase labels beneath, on black. Columns are split by hairline rules and
 * NO corners are rounded, matching the spacex.com specification.
 *
 * The dividers are drawn the fully-responsive way: a `gap-px` grid over a
 * `bg-white/12` wrapper, so the 1px gutters between cells reveal the hairline
 * colour — vertical AND horizontal, at any column count, with no border on the
 * outer edges and no fragile nth-child rules. Each cell repaints the dark
 * ground over the gutter.
 *
 * Client component because CountUp is; CountUp already handles SSR / no-JS /
 * reduced-motion (it renders the final number and only animates on scroll-in
 * when motion is allowed), so this band is reduced-motion safe by construction.
 */
export default function StatsBand({ stats, eyebrow, className = "" }: Props) {
  // Desktop column count follows the number of stats. Full literal class names
  // (not interpolated fragments) so Tailwind's scanner keeps them; mobile stays
  // 2-up. Dynamic `lg:grid-cols-${n}` would be purged, hence the lookup.
  const lgCols = stats.length === 3 ? "lg:grid-cols-3" : "lg:grid-cols-4";
  return (
    <section className={`bg-[#0c0e0b] ${className}`}>
      <div className="max-w-7xl mx-auto px-6 lg:px-16 py-20 lg:py-28">
        {eyebrow ? (
          <p className="text-white/55 text-[10px] tracking-[0.5em] uppercase flex items-center justify-center gap-3 mb-14 lg:mb-20">
            <span className="w-6 h-px bg-gold flex-shrink-0" />
            {eyebrow}
          </p>
        ) : null}
        <dl className={`grid grid-cols-2 ${lgCols} gap-px bg-white/12`}>
          {stats.map((s, i) => {
            // On the 2-up mobile/tablet grid an odd count leaves the last cell
            // stranded beside an empty quadrant — let it span both columns so it
            // centres on its own row instead. (Above lg the grid is exact.)
            const orphanSpan =
              stats.length % 2 === 1 && i === stats.length - 1 ? "max-lg:col-span-2" : "";
            return (
              <div
                key={`${s.label}-${i}`}
                className={`bg-[#0c0e0b] flex flex-col items-center justify-start text-center px-4 py-10 sm:px-6 lg:py-14 ${orphanSpan}`}
              >
                {/* Label first in source (valid <dt> before <dd>); flex `order`
                  flips the paint so the giant numeral sits on top. */}
                <dt className="order-2 mt-4 lg:mt-6 text-white/55 text-[10px] sm:text-[11px] tracking-[0.35em] uppercase">
                  {s.label}
                </dt>
                <dd
                  className="order-1 m-0 text-white font-light tracking-display leading-[0.9]"
                  style={{ fontSize: "clamp(52px, 10vw, 132px)" }}
                >
                  <CountUp to={s.value} from={s.from} suffix={s.suffix} duration={1600} />
                </dd>
              </div>
            );
          })}
        </dl>
      </div>
    </section>
  );
}
