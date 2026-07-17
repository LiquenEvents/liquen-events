"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { clientLogos } from "@/data";
import { logoHeight, logoDimsFor } from "@/lib/logo";
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
      <div className="flex-shrink-0 flex items-center h-11" {...hidden}>
        <span className="text-foreground/68 text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase whitespace-nowrap">
          {name}
        </span>
      </div>
    );
  }

  const h = logoHeight(logo);
  const d = logoDimsFor(logo);

  return (
    <div className="flex-shrink-0 flex items-center justify-center h-12" {...hidden}>
      <Image
        src={logo}
        alt={duplicate ? "" : name}
        width={d[0]}
        height={d[1]}
        style={{ height: `${h}px` }}
        className="w-auto max-w-[140px] sm:max-w-[170px] object-contain opacity-100 transition-opacity duration-300 brightness-0"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function ClientMarquee() {
  const { t } = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);

  // Pause the infinite scroll while the band is off-screen — no point
  // compositing a wide moving strip the user can't see (battery / GPU).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => el.classList.toggle("marquee-paused", !e.isIntersecting),
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative py-7 border-y border-foreground/8 overflow-hidden">
      {/* sr-only heading so heading-navigation users find the client band. */}
      <h2 className="sr-only">{t.nav.clientes}</h2>
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-surface to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-surface to-transparent z-10 pointer-events-none" />
      <div
        ref={trackRef}
        className="flex items-center gap-12 sm:gap-16 animate-marquee whitespace-nowrap"
      >
        {[...clientLogos, ...clientLogos].map((c, i) => (
          <Mark key={i} name={c.name} logo={c.logo} duplicate={i >= clientLogos.length} />
        ))}
      </div>
    </div>
  );
}
