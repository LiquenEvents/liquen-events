"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

// The WebGL carousel is client-only (ssr:false) and split into its own chunk, so
// the OGL runtime never ships in the initial payload. The flat ribbon below it
// is server-rendered — it's the LCP content, the reduced-motion experience and
// the no-WebGL fallback — and only fades out once the carousel's first frame is
// on screen.
const PhotoWallCanvas = dynamic(() => import("./PhotoWallCanvas"), { ssr: false });

export type WallImage = { src: string; blurDataURL?: string };

export default function PhotoWall({
  images,
  href,
  label,
  eyebrow,
  title,
  hint,
}: {
  images: WallImage[];
  href: string;
  label: string;
  eyebrow: string;
  title: string;
  hint: string;
}) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const [hideRibbon, setHideRibbon] = useState(false);
  const enhance = !reduced;

  // Once the WebGL carousel has crossfaded in, drop the ribbon from the DOM
  // (frees its <img> nodes). Wait out the fade first so there's no flash; never
  // fires under reduced motion (ready stays false → ribbon is the view).
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => setHideRibbon(true), 800);
    return () => clearTimeout(t);
  }, [ready]);

  return (
    <section
      aria-label={label}
      className="relative bg-[#10140f] border-y border-white/8 overflow-hidden"
    >
      {/* Soft depth glow behind the wall — gives the dark band presence. */}
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
          className="text-cream font-bold leading-[0.95] tracking-tight"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 5vw, 68px)" }}
        >
          {title}
        </h2>
      </div>

      {/* ── Carousel band ── */}
      <div className="relative mt-9 sm:mt-11 lg:mt-14 h-[300px] sm:h-[380px] lg:h-[440px]">
        {/* Flat ribbon — SSR / LCP / reduced-motion / no-WebGL fallback. Fades
            out once the WebGL carousel has painted its first frame, then unmounts. */}
        {!hideRibbon && (
          <div
            aria-hidden={ready}
            className="absolute inset-0 flex items-center transition-opacity duration-700"
            style={{ opacity: ready ? 0 : 1 }}
          >
            <div className="absolute inset-y-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-[#10140f] to-transparent z-20 pointer-events-none" />
            <div className="absolute inset-y-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-[#10140f] to-transparent z-20 pointer-events-none" />
            <div className="flex gap-2 animate-marquee w-max">
              {[...images, ...images].map((img, i) => (
                <div
                  key={i}
                  className="relative h-[180px] sm:h-[240px] lg:h-[300px] w-[270px] sm:w-[360px] lg:w-[450px] flex-shrink-0 overflow-hidden rounded-lg"
                >
                  <Image
                    src={img.src}
                    alt=""
                    fill
                    sizes="450px"
                    className="object-cover"
                    placeholder={img.blurDataURL ? "blur" : undefined}
                    blurDataURL={img.blurDataURL}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* WebGL curved carousel (fades in over the ribbon) */}
        {enhance && (
          <PhotoWallCanvas
            images={images.map((i) => i.src)}
            href={href}
            onReady={() => setReady(true)}
            className="absolute inset-0 z-10"
          />
        )}

        {/* Drag/swipe affordance — appears with the WebGL wall so people know
            it's interactive (that discovery is the "wow"). */}
        {enhance && (
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-3 z-20 flex justify-center pointer-events-none"
          >
            <span
              className="text-cream/40 text-[9px] tracking-[0.4em] uppercase flex items-center gap-2.5 transition-opacity duration-700"
              style={{ opacity: ready ? 1 : 0 }}
            >
              <span>←</span>
              {hint}
              <span>→</span>
            </span>
          </div>
        )}
      </div>

      {/* ── CTA ── */}
      <div className="relative z-20 flex justify-center pt-9 sm:pt-11 pb-16 sm:pb-20 lg:pb-24">
        <Link
          href={href}
          className="group inline-flex items-center gap-3 px-8 py-4 bg-white/6 border border-white/18 rounded-full text-cream/90 hover:text-cream hover:bg-white/12 hover:border-white/35 text-[11px] tracking-[0.3em] uppercase transition-all duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/70"
        >
          {label}
          <span className="text-cream/50 group-hover:translate-x-0.5 transition-transform duration-300">
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
