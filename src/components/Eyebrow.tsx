import type { ReactNode } from "react";

/**
 * Eyebrow — the small gold-hairline + uppercase-label kicker that sits above
 * section titles across the site. One primitive so the rule width, letter-
 * spacing and type size stay identical everywhere; only the colour changes
 * with the background (`tone`).
 *
 * tone:
 *   "onLight"  — dark text for cream / white sections (default)
 *   "onDark"   — light text for full-bleed dark / image sections
 *
 * `center` renders the hairline on both sides for centred section intros.
 */
type Tone = "onLight" | "onDark";

const TEXT: Record<Tone, string> = {
  onLight: "text-foreground/68",
  onDark: "text-white/70",
};

export default function Eyebrow({
  children,
  tone = "onLight",
  center = false,
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  center?: boolean;
  className?: string;
}) {
  const rule = <span className="block w-8 h-px bg-gold/60 flex-shrink-0" aria-hidden />;
  return (
    <p
      className={`flex items-center gap-3 text-[10px] tracking-[0.4em] uppercase ${TEXT[tone]} ${
        center ? "justify-center" : ""
      } ${className}`}
    >
      {rule}
      {children}
      {center && rule}
    </p>
  );
}
