"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { logoHeight, logoDimsFor } from "@/lib/logo";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";

interface Client {
  name: string;
  logo: string;
}

function ClientLogo({ client, index }: { client: Client; index: number }) {
  const [failed, setFailed] = useState(false);
  // Compact footprint: smaller target area + tighter height clamp than before,
  // so the whole wall reads tighter (paired with shorter cells + more columns).
  const h = logoHeight(client.logo, 3200, 30, 54);
  const d = logoDimsFor(client.logo);

  return (
    <div
      className="cl-cell relative overflow-hidden h-24 sm:h-28 bg-surface flex items-center justify-center px-4 sm:px-5 border-r border-b border-foreground/[0.07]"
      // Diagonal-ish wave: each logo's reveal is offset by its index, so the
      // block resolves in as one staggered sweep (top-left → bottom-right).
      style={{ ["--cl-delay" as string]: `${index * 42}ms` }}
    >
      <div className="cl-reveal relative z-10 flex items-center justify-center w-full">
        {!failed && client.logo ? (
          <span className="cl-logo">
            <Image
              src={client.logo}
              alt={client.name}
              width={d[0]}
              height={d[1]}
              // Match the responsive grid (2/3/4/5 cols within max-w-7xl, capped
              // at 68% of the cell) so next/image builds a viewport-aware srcset
              // instead of a 1x/2x one off the raw source width — same look, a
              // fraction of the bytes across ~20 logos on /clientes.
              sizes="(max-width: 639px) 34vw, (max-width: 1023px) 23vw, (max-width: 1279px) 17vw, 157px"
              style={{ height: `${h}px` }}
              className="cl-black object-contain w-auto max-w-[68%] brightness-0"
              onError={() => setFailed(true)}
            />
            {/* Moss recolor on hover: a moss-filled layer masked by the logo's
                own alpha, crossfaded over the black silhouette. aria-hidden — the
                real <Image> above carries the alt text. */}
            <span
              aria-hidden
              className="cl-moss"
              style={{
                WebkitMaskImage: `url(${client.logo})`,
                maskImage: `url(${client.logo})`,
              }}
            />
          </span>
        ) : (
          <span className="text-foreground text-[10px] sm:text-[11px] font-medium tracking-[0.15em] uppercase text-center leading-snug">
            {client.name}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Bordered grid (cell borders, not gap-px) so a partial final row ends in clean
 * whitespace instead of an empty grey cell — robust at every column count.
 *
 * Entrance animation: one IntersectionObserver on the grid (fire once, then
 * disconnect — no scroll listeners, no per-frame JS) adds `.cl-in`; the CSS in
 * globals.css does the staggered blur-to-sharp rise. `.cl-armed` is only added
 * once JS runs, so no-JS visitors — and reduced-motion users — see the logos in
 * their final, fully-legible state. All motion is gated in globals.css.
 */
export default function ClientLogoGrid({ clients }: { clients: Client[] }) {
  const gridRef = useRef<HTMLDivElement>(null);

  useIsomorphicLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    // Respect reduced-motion and no-IO environments: leave the grid unarmed,
    // i.e. permanently visible with no reveal.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    el.classList.add("cl-armed"); // hide (synchronously, before paint) to reveal
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("cl-in");
          observer.disconnect(); // fire once
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={gridRef}
      className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 border-t border-l border-foreground/[0.07]"
    >
      {clients.map((client, i) => (
        <ClientLogo key={client.name} client={client} index={i} />
      ))}
    </div>
  );
}
