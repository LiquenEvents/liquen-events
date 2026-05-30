"use client";

import Image from "next/image";
import { useState } from "react";
import { clientLogos } from "@/data";

/**
 * Scrolling band of client logos on the homepage. Each logo is rendered white
 * over the dark band; if a logo file is missing it falls back to the client
 * name as text, so the band never breaks while logos are being added.
 */
function Mark({ name, logo }: { name: string; logo: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span className="text-foreground/20 text-[10px] sm:text-xs font-medium tracking-[0.3em] uppercase flex-shrink-0">
        {name}
      </span>
    );
  }

  return (
    <Image
      src={logo}
      alt={name}
      width={150}
      height={48}
      className="h-7 sm:h-9 w-auto object-contain opacity-40 hover:opacity-75 transition-opacity duration-300 brightness-0 invert flex-shrink-0"
      onError={() => setFailed(true)}
    />
  );
}

export default function ClientMarquee() {
  return (
    <div className="relative py-6 border-y border-foreground/8 overflow-hidden">
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
