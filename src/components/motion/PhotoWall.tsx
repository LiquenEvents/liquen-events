"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";

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
  // Gates loading of the heavy frames: false until the band is approaching, so
  // the ~12 large photos don't download in parallel with the hero on first load
  // (the band sits ~4 screens down). Flips true once near and stays true.
  const [near, setNear] = useState(false);

  // How many frames the strip shows at once (duplicated for the seamless loop).
  const VISIBLE = Math.min(12, images.length);
  // First paint is deterministic (matches the server HTML — no hydration
  // mismatch): the pool's leading slice. After mount we shuffle the FULL pool
  // and re-sample, so each visit shows a fresh cut of landscape photos.
  const [frames, setFrames] = useState<WallImage[]>(() => images.slice(0, VISIBLE));

  useEffect(() => {
    // Fisher–Yates over a copy; Math.random only runs client-side (post-hydration).
    const pool = images.slice();
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    // Intentional post-hydration setState: the shuffle MUST run only on the
    // client (Math.random can't touch the SSR render without a hydration
    // mismatch), so a one-shot re-sample after mount is exactly right here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setFrames(pool.slice(0, VISIBLE));
  }, [images, VISIBLE]);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setOffscreen(!entry.isIntersecting), {
      rootMargin: "200px",
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // One-shot "approaching" observer with a wide margin: start loading the frames
  // ~1.4 screens before they're visible so they're crisp by the time the user
  // arrives, WITHOUT competing with the hero on first paint. No IO (old browser)
  // → load immediately (current behaviour). eslint: deliberate one-shot setState.
  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setNear(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setNear(true);
          io.disconnect();
        }
      },
      { rootMargin: "1400px" },
    );
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
        {/* animationDuration overrides the shared .animate-marquee (30s) with a
            brisker glide for the big photo strip — the class still supplies the
            keyframes, hover/off-screen pause, and reduced-motion `none`. */}
        <div
          className={`flex gap-2.5 animate-marquee w-max${offscreen ? " marquee-paused" : ""}`}
          style={{ animationDuration: "22s" }}
        >
          {[...frames, ...frames].map((img, i) => (
            <div
              key={i}
              className="relative h-[280px] sm:h-[390px] lg:h-[480px] w-[420px] sm:w-[585px] lg:w-[720px] flex-shrink-0 overflow-hidden"
            >
              <Image
                src={img.src}
                alt=""
                fill
                sizes="(max-width: 640px) 420px, (max-width: 1024px) 585px, 720px"
                className="object-cover"
                // Eager ONCE THE BAND IS NEAR, lazy before: the marquee brings
                // frames into view by a CSS translateX animation, which native
                // lazy-loading (scroll-based) doesn't react to — so eager keeps
                // the ribbon crisp instead of a blurred smear. But eager on first
                // paint made these ~12 large frames (4 screens down) compete with
                // the hero LCP; gating on `near` defers them off the critical path
                // while still loading them well before the user scrolls here.
                loading={near ? "eager" : "lazy"}
                placeholder={img.blurDataURL ? "blur" : undefined}
                blurDataURL={img.blurDataURL}
              />
            </div>
          ))}
        </div>
      </div>

      {/* ── CTA ── */}
      <div className="relative z-20 flex justify-center pt-10 sm:pt-12 pb-16 sm:pb-20 lg:pb-24">
        {/* Unified ghost button (see ui-classes.ts): squared hairline that
            fills white on hover. The arrow inherits the label colour so it
            inverts to near-black along with the text. */}
        <Link href={href} className={`group ${OUTLINE_LIGHT_BUTTON_CLASS}`}>
          {label}
          <span
            className="group-hover:translate-x-0.5 transition-transform duration-300 ease-expo"
            aria-hidden
          >
            →
          </span>
        </Link>
      </div>
    </section>
  );
}
