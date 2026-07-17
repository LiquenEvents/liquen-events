"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * Editorial photo strip — a large, continuously gliding film-strip of curated
 * event photos under a display heading, closing with a CTA to the gallery.
 *
 * Deliberately NOT WebGL (the 3D carousel was retired on request): the strip
 * is a pure-CSS marquee (see .animate-marquee — 50s linear, pauses on hover,
 * stands still under prefers-reduced-motion). The markup is still fully
 * server-rendered (SSR + no-JS visitors get the animated strip immediately);
 * a tiny client effect only adds an IntersectionObserver that toggles the
 * existing `.marquee-paused` class so the 24-frame transform loop stops
 * compositing work while the band is scrolled off-screen. First paint is
 * unchanged (default = running), so nothing about the look or LCP shifts.
 */
export type WallImage = { src: string; blurDataURL?: string };

export default function PhotoWall({
  images,
  href,
  label,
  eyebrow,
  title,
}: {
  images: WallImage[];
  href: string;
  label: string;
  eyebrow: string;
  title: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), {
      rootMargin: "200px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="photowall-heading"
      className="relative bg-[#10140f] border-y border-white/8 overflow-hidden"
    >
      {/* Soft depth glow — gives the dark band presence. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background: "radial-gradient(120% 85% at 50% 40%, rgba(99,122,95,0.13), transparent 62%)",
        }}
      />

      {/* ── Editorial header ── */}
      <div className="relative z-20 max-w-7xl mx-auto px-6 lg:px-16 pt-16 sm:pt-20 lg:pt-28 text-center">
        <p className="text-cream/45 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center justify-center gap-3">
          <span className="w-6 h-px bg-gold/50" />
          {eyebrow}
          <span className="w-6 h-px bg-gold/50" />
        </p>
        <h2
          id="photowall-heading"
          className="text-cream font-bold leading-[0.95] tracking-tight"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 5vw, 68px)" }}
        >
          {title}
        </h2>
      </div>

      {/* ── Film strip — big photos gliding edge to edge (duplicated list for a
          seamless -50% loop; pauses on hover) ── */}
      <div className="relative mt-10 sm:mt-12 lg:mt-16">
        <div className="absolute inset-y-0 left-0 w-16 sm:w-28 bg-gradient-to-r from-[#10140f] to-transparent z-20 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-16 sm:w-28 bg-gradient-to-l from-[#10140f] to-transparent z-20 pointer-events-none" />
        <div className={`flex gap-2.5 animate-marquee w-max${offscreen ? " marquee-paused" : ""}`}>
          {[...images, ...images].map((img, i) => (
            <div
              key={i}
              className="relative h-[280px] sm:h-[390px] lg:h-[480px] w-[420px] sm:w-[585px] lg:w-[720px] flex-shrink-0 overflow-hidden rounded-lg"
            >
              <Image
                src={img.src}
                alt=""
                fill
                sizes="(max-width: 640px) 420px, (max-width: 1024px) 585px, 720px"
                className="object-cover"
                placeholder={img.blurDataURL ? "blur" : undefined}
                blurDataURL={img.blurDataURL}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="relative z-20 flex justify-center pt-10 sm:pt-12 pb-16 sm:pb-20 lg:pb-24">
        <Link
          href={href}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-white/6 border border-white/18 rounded-full text-cream/90 hover:text-cream hover:bg-white/12 hover:border-white/35 text-[11px] tracking-[0.3em] uppercase transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/70"
        >
          {label}
          <span
            className="text-cream/50 group-hover:translate-x-0.5 transition-transform duration-300"
            aria-hidden
          >
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
