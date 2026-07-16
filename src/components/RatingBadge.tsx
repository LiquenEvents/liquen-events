import { SITE } from "@/lib/site";

// Visible aggregate-rating badge (★★★★★ 5,0). Shows the REAL Google rating
// (average only) from SITE.reviews — the review COUNT is intentionally not
// rendered so the site never contradicts the live Google Business Profile.
// Displayed VISIBLY only — it is deliberately NOT emitted as schema
// aggregateRating (Google disallows self-serving review markup on
// Organization/LocalBusiness). Prop-based (no hooks) so it renders in server
// or client components.
export default function RatingBadge({
  label,
  ptFormat = true,
  className,
  // Default targets LIGHT surfaces: gold-dark (#b88f28) clears the 3:1 graphics
  // floor for the star glyphs. Hero usages over dark photos pass text-gold.
  starClassName = "text-gold-dark",
  textClassName = "text-foreground/72",
}: {
  label: string;
  ptFormat?: boolean;
  className?: string;
  starClassName?: string;
  textClassName?: string;
}) {
  const { rating } = SITE.reviews;
  const ratingStr = ptFormat ? rating.toFixed(1).replace(".", ",") : rating.toFixed(1);
  return (
    <span
      role="img"
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
      aria-label={`${ratingStr}/5 — ${label}`}
    >
      <span className={`flex gap-0.5 ${starClassName}`} aria-hidden>
        {[0, 1, 2, 3, 4].map((i) => (
          <svg key={i} className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 1.6l2.47 5.01 5.53.8-4 3.9.94 5.5L10 14.9l-4.95 2.6.95-5.5-4-3.9 5.53-.8z" />
          </svg>
        ))}
      </span>
      <span className={`text-xs tracking-wide tabular-nums ${textClassName}`}>{ratingStr}</span>
    </span>
  );
}
