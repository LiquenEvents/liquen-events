"use client";

import { useState } from "react";
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
}: {
  images: WallImage[];
  href: string;
  label: string;
}) {
  const reduced = useReducedMotion();
  const [ready, setReady] = useState(false);
  const enhance = !reduced;

  return (
    <section
      aria-label={label}
      className="relative bg-[#10140f] border-y border-white/8 overflow-hidden h-[300px] sm:h-[380px] lg:h-[460px]"
    >
      {/* Flat ribbon — SSR / LCP / reduced-motion / no-WebGL fallback. Fades out
          once the WebGL carousel has painted its first frame. */}
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

      {/* WebGL curved carousel (fades in over the ribbon) */}
      {enhance && (
        <PhotoWallCanvas
          images={images.map((i) => i.src)}
          href={href}
          onReady={() => setReady(true)}
          className="absolute inset-0 z-10"
        />
      )}

      {/* Accessible, always-focusable entry to the gallery — keyboard / screen
          readers reach it here; pointer users can also just click the wall. */}
      <div className="absolute inset-x-0 bottom-5 sm:bottom-7 z-20 flex justify-center pointer-events-none">
        <Link
          href={href}
          className="pointer-events-auto px-5 py-2.5 bg-white/8 backdrop-blur-sm border border-white/15 rounded-full text-cream/85 hover:text-cream hover:bg-white/12 text-[10px] sm:text-[11px] tracking-[0.3em] uppercase transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/70"
        >
          {label} →
        </Link>
      </div>
    </section>
  );
}
