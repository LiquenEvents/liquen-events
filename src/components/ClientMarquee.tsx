"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { clientLogos } from "@/data";
import { logoHeight, logoDimsFor } from "@/lib/logo";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useTranslations } from "./LocaleProvider";

/**
 * Scrolling band of client logos on the homepage. Logos are balanced optically
 * by area (see logoHeight) and width-capped so no wordmark runs away. Rendered
 * white over the dark band; a missing logo falls back to the client name.
 *
 * The list is duplicated for a seamless loop — the second copy is `aria-hidden`
 * so a screen reader reads each client once, not twice.
 */
function Mark({
  name,
  logo,
  duplicate = false,
}: {
  name: string;
  logo: string;
  duplicate?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const hidden = duplicate ? { "aria-hidden": true as const } : {};

  if (failed || !logo) {
    return (
      <div className="flex-shrink-0 flex items-center h-8 sm:h-11" {...hidden}>
        <span className="text-foreground/68 text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase whitespace-nowrap">
          {name}
        </span>
      </div>
    );
  }

  const h = logoHeight(logo);
  const d = logoDimsFor(logo);

  return (
    <div className="flex-shrink-0 flex items-center justify-center h-8 sm:h-12" {...hidden}>
      <Image
        src={logo}
        alt={duplicate ? "" : name}
        width={d[0]}
        height={d[1]}
        // Without `sizes`, next/image builds a 1x/2x srcset off the raw source
        // width and serves a ~640–1280px file for a logo rendered ≤170px wide.
        // Declaring the CSS cap switches it to a viewport/DPR-aware srcset that
        // picks a correctly-small candidate — same pixels, far fewer bytes.
        sizes="(max-width: 640px) 120px, 170px"
        // Rendered as flat black silhouettes (brightness-0), so encoder quality
        // is imperceptible — 50 just trims the bytes of every logo in the strip.
        quality={50}
        style={{ height: `${h}px` }}
        // Slimmer strip on mobile: cap the logo height (max-h) so the whole band
        // reads as a fine line on a phone, full size from sm+.
        className="w-auto max-h-[22px] sm:max-h-none max-w-[120px] sm:max-w-[170px] object-contain opacity-100 transition-opacity duration-300 brightness-0"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function ClientMarquee() {
  const { t } = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  // Persistent user control (WCAG 2.2.2 Pause, Stop, Hide): the band scrolls for
  // more than 5s, so a visitor must be able to stop it. Orthogonal to the
  // off-screen IntersectionObserver pause below — user pause is applied via an
  // inline animation-play-state, which wins over the observer's class either way.
  const [userPaused, setUserPaused] = useState(false);

  // Shuffle the logo order once per visit so a DIFFERENT set of clients leads
  // each time — otherwise the same first few always hold the prime, first-
  // visible slot and the rest are rarely seen before the visitor scrolls on.
  // Starts as the server order (SSR-safe: initial client render matches), then
  // reshuffles after mount; the marquee still cycles the full set within a view.
  const [order, setOrder] = useState(clientLogos);
  useEffect(() => {
    const a = [...clientLogos];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(a);
  }, []);

  // Pause the infinite scroll while the band is off-screen — no point
  // compositing a wide moving strip the user can't see (battery / GPU).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // Under prefers-reduced-motion the marquee animation is already `none`
    // (globals.css), so there's nothing to pause — skip the observer entirely
    // rather than run it to toggle a class that does nothing.
    if (prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => el.classList.toggle("marquee-paused", !e.isIntersecting),
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative py-3.5 sm:py-7 border-y border-foreground/8 overflow-hidden">
      {/* sr-only heading so heading-navigation users find the client band. */}
      <h2 className="sr-only">{t.nav.clientes}</h2>
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-surface to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-surface to-transparent z-10 pointer-events-none" />
      <div
        ref={trackRef}
        className="flex items-center gap-12 sm:gap-16 animate-marquee whitespace-nowrap"
        style={userPaused ? { animationPlayState: "paused" } : undefined}
      >
        {[...order, ...order].map((c, i) => (
          <Mark key={i} name={c.name} logo={c.logo} duplicate={i >= order.length} />
        ))}
      </div>
      {/* Pause/resume control. Hidden from the reduced-motion path — there the
          band doesn't animate (globals.css), so there's nothing to pause. */}
      <button
        type="button"
        onClick={() => setUserPaused((p) => !p)}
        aria-pressed={userPaused}
        aria-label={userPaused ? t.common.retomarLogos : t.common.pausarLogos}
        className="motion-reduce:hidden absolute bottom-1 right-2 z-20 flex h-7 w-7 items-center justify-center rounded-full border border-foreground/15 bg-surface/80 text-foreground/60 backdrop-blur-sm transition-colors hover:text-foreground/90 hover:border-foreground/30"
      >
        <span aria-hidden className="text-[11px] leading-none">
          {userPaused ? "▶" : "❚❚"}
        </span>
      </button>
    </div>
  );
}
