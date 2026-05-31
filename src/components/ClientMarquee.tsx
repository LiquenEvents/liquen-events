"use client";

import Image from "next/image";
import { useState } from "react";
import { clientLogos } from "@/data";
import { logoHeight, logoDimsFor } from "@/lib/logo";

/**
 * Scrolling band of client logos on the homepage. Logos are balanced optically
 * by area (see logoHeight) and width-capped so no wordmark runs away. Rendered
 * white over the dark band; a missing logo falls back to the client name.
 */
function Mark({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !logo) {
    return (
      <div className="flex-shrink-0 flex items-center h-11">
        <span className="text-foreground/25 text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase whitespace-nowrap">
          {name}
        </span>
      </div>
    );
  }

  const h = logoHeight(logo);
  const d = logoDimsFor(logo);

  return (
    <div className="flex-shrink-0 flex items-center justify-center h-12">
      <Image
        src={logo}
        alt={name}
        width={d[0]}
        height={d[1]}
        style={{ height: `${h}px` }}
        className="w-auto max-w-[140px] sm:max-w-[170px] object-contain opacity-60 hover:opacity-90 transition-opacity duration-300 brightness-0 invert"
        onError={() => setFailed(true)}
      />
    </div>
  );
}

export default function ClientMarquee() {
  return (
    <div className="relative py-7 border-y border-foreground/8 overflow-hidden">
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-surface to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-surface to-transparent z-10 pointer-events-none" />
      <div className="flex items-center gap-12 sm:gap-16 animate-marquee whitespace-nowrap">
        {[...clientLogos, ...clientLogos].map((c, i) => (
          <Mark key={i} name={c.name} logo={c.logo} />
        ))}
      </div>
    </div>
  );
}
