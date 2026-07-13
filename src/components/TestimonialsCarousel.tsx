"use client";

import { useState, useEffect, useCallback } from "react";
import AnimateIn from "./AnimateIn";
import RatingBadge from "./RatingBadge";
import { useTranslations } from "./LocaleProvider";

export default function TestimonialsCarousel() {
  const { locale, t: dict } = useTranslations();
  const testimonials = dict.testimonials;
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);
  // Pause autoplay while the user is interacting (hover/focus) or the tab is
  // hidden: saves needless re-renders off-screen and satisfies WCAG 2.2.2 — a
  // >5s auto-advancing carousel must be pausable.
  const [interacting, setInteracting] = useState(false);
  const [docHidden, setDocHidden] = useState(false);

  const transitionTo = useCallback((next: (current: number) => number) => {
    setVisible(false);
    setTimeout(() => {
      setActive(next);
      setVisible(true);
    }, 380);
  }, []);

  const goTo = useCallback((i: number) => transitionTo(() => i), [transitionTo]);

  useEffect(() => {
    const onVisibility = () => setDocHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const paused = interacting || docHidden;

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => {
      // Functional update so autoplay advances from the *current* slide
      // instead of a stale closure value (which would freeze on slide 1).
      transitionTo((current) => (current + 1) % testimonials.length);
    }, 6000);
    return () => clearInterval(id);
  }, [paused, transitionTo, testimonials.length]);

  const t = testimonials[active];

  return (
    <section
      className="relative py-20 lg:py-32 bg-surface border-t border-foreground/6 overflow-hidden"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocus={() => setInteracting(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInteracting(false);
      }}
    >
      {/* Decorative background quotation mark */}
      <div aria-hidden className="absolute -top-8 -left-6 pointer-events-none select-none">
        <span
          className="font-bold text-foreground/[0.03] leading-none"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(200px,30vw,380px)" }}
        >
          &ldquo;
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-16 relative z-10">
        <AnimateIn>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 mb-10 lg:mb-16">
            <div className="flex items-center gap-4">
              <span className="block w-8 h-px bg-gold/50 flex-shrink-0" />
              <p className="text-foreground/68 text-[10px] tracking-[0.48em] uppercase">
                {dict.common.clientsSay}
              </p>
            </div>
            <RatingBadge label={dict.common.reviewsLabel} ptFormat={locale === "pt"} />
          </div>
        </AnimateIn>

        <AnimateIn delay={80}>
          <div className="max-w-3xl">
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "none" : "translateY(10px)",
                transition: "opacity 0.38s ease, transform 0.38s ease",
              }}
            >
              <p
                className="text-foreground text-xl sm:text-2xl lg:text-[2.2rem] font-bold leading-[1.35] mb-8 lg:mb-12"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-5">
                <div className="w-8 h-px bg-gold/50" />
                <div>
                  <p className="text-foreground text-sm font-medium">{t.name}</p>
                  <p className="text-foreground/60 text-xs tracking-wide mt-0.5">{t.role}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Dots */}
          <div className="flex gap-0.5 mt-9 lg:mt-14 -ml-2">
            {testimonials.map((_, i) => (
              <button
                key={i}
                onClick={() => goTo(i)}
                aria-label={`${dict.common.testemunhoLabel} ${i + 1}`}
                aria-current={i === active ? "true" : undefined}
                className="group py-4 px-2 flex-shrink-0"
              >
                <span
                  className={`block h-px transition-all duration-400 ${
                    i === active
                      ? "w-8 bg-moss"
                      : "w-4 bg-foreground/20 group-hover:bg-foreground/40"
                  }`}
                />
              </button>
            ))}
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}
