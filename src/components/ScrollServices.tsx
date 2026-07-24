"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";

export type CinematicBeat = {
  image: string;
  blurDataURL?: string;
  eyebrow?: string;
  title: string;
  desc?: string;
};

/**
 * Scroll cinematic for the Serviços page. A single pinned full-viewport stage
 * plays through the studio's REAL event photography as the visitor scrolls:
 * neighbouring frames cross-fade and the active frame drifts with a slow
 * Ken-Burns scale, while each beat's copy fades in over it. No video, no
 * external assets — every image is already self-hosted (CSP-safe).
 *
 * The tall wrapper (N × 100svh) provides the scroll distance; the inner stage is
 * `sticky` so it stays put while `scroll` position maps to a floating beat index
 * (`progress`). Under `prefers-reduced-motion` it degrades to a plain stacked
 * sequence of panels — no pinning, no motion.
 */
export default function ScrollServices({ beats }: { beats: CinematicBeat[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0); // 0 … N-1 (float)
  const [reduced, setReduced] = useState(true); // assume reduced until mounted (SSR-safe)

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener?.("change", apply);
    return () => mq.removeEventListener?.("change", apply);
  }, []);

  useEffect(() => {
    if (reduced) return;
    const el = wrapRef.current;
    if (!el) return;
    let raf = 0;
    const compute = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      const total = el.offsetHeight - window.innerHeight; // scrollable span
      const scrolled = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const p = total > 0 ? (scrolled / total) * (beats.length - 1) : 0;
      setProgress(p);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [reduced, beats.length]);

  // ── Reduced motion / no-JS-yet fallback: a calm stacked sequence ──
  if (reduced) {
    return (
      <div>
        {beats.map((b, i) => (
          <section key={i} className="relative flex min-h-[70svh] items-end overflow-hidden">
            <Image
              src={b.image}
              alt={b.title}
              fill
              sizes="100vw"
              quality={75}
              priority={i === 0}
              className="object-cover object-center"
              placeholder={b.blurDataURL ? "blur" : "empty"}
              blurDataURL={b.blurDataURL}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/25 to-transparent" />
            <div className="relative z-10 mx-auto w-full max-w-7xl px-6 pb-12 lg:px-16 lg:pb-16">
              <BeatCopy beat={b} />
            </div>
          </section>
        ))}
      </div>
    );
  }

  const active = Math.round(progress);

  return (
    <div
      ref={wrapRef}
      className="relative"
      style={{ height: `${beats.length * 100}svh` }}
      aria-label="Percurso de serviços"
    >
      <div className="sticky top-0 h-[100svh] overflow-hidden bg-[#080808]">
        {/* Stacked frames — cross-fade by distance to the active beat. */}
        {beats.map((b, i) => {
          const dist = Math.abs(progress - i);
          const opacity = Math.max(0, 1 - dist);
          if (opacity <= 0.001) return null;
          const scale = 1.05 + (progress - i) * 0.04; // gentle drift through the beat
          return (
            <div
              key={i}
              className="absolute inset-0"
              style={{ opacity }}
              aria-hidden={i !== active}
            >
              <div
                className="absolute inset-0 will-change-transform"
                style={{ transform: `scale(${scale})` }}
              >
                <Image
                  src={b.image}
                  alt={b.title}
                  fill
                  sizes="100vw"
                  quality={75}
                  priority={i === 0}
                  className="object-cover object-center"
                  placeholder={b.blurDataURL ? "blur" : "empty"}
                  blurDataURL={b.blurDataURL}
                />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/25 to-transparent" />
            </div>
          );
        })}

        {/* Copy — each beat pinned bottom-left, fading with proximity. */}
        <div className="absolute inset-0 z-10 flex items-end">
          <div className="relative mx-auto w-full max-w-7xl px-6 pb-16 lg:px-16 lg:pb-24">
            {beats.map((b, i) => {
              const dist = Math.abs(progress - i);
              if (dist >= 1) return null;
              const opacity = Math.max(0, 1 - dist * 1.6);
              return (
                <div
                  key={i}
                  className="absolute bottom-0 left-6 right-6 lg:left-16 lg:right-16"
                  style={{
                    opacity,
                    transform: `translateY(${dist * 14}px)`,
                  }}
                  aria-hidden={i !== active}
                >
                  <BeatCopy beat={b} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Progress rail — a quiet index of where you are in the flight. */}
        <div className="absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-1.5 lg:flex">
          {beats.map((_, i) => (
            <span
              key={i}
              className="h-5 w-px rounded-full"
              style={{
                backgroundColor: i === active ? "#d6ab3a" : "rgba(255,255,255,0.22)",
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BeatCopy({ beat }: { beat: CinematicBeat }) {
  return (
    <div className="max-w-xl">
      {beat.eyebrow && (
        <p className="mb-3 flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] text-white/70">
          <span className="h-px w-6 flex-shrink-0 bg-gold" />
          {beat.eyebrow}
        </p>
      )}
      <h2
        className="text-veil-shadow font-bold uppercase leading-[1.02] tracking-display text-white"
        style={{ fontSize: "clamp(26px, 4.4vw, 58px)" }}
      >
        {beat.title}
      </h2>
      {beat.desc && (
        <p className="mt-4 max-w-md text-[13px] leading-[1.7] text-white/75">{beat.desc}</p>
      )}
    </div>
  );
}
