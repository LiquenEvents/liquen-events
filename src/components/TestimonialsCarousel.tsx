"use client";

import { useState, useEffect, useCallback } from "react";
import AnimateIn from "./AnimateIn";
import { testimonials } from "@/data";

function Stars({ count = 5 }: { count?: number }) {
  return (
    <div className="flex items-center gap-0.5" aria-label={`${count} estrelas`}>
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i} className="w-3.5 h-3.5 text-gold" viewBox="0 0 20 20" fill="currentColor">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

export default function TestimonialsCarousel() {
  const [active, setActive] = useState(0);
  const [visible, setVisible] = useState(true);

  const transitionTo = useCallback((next: (current: number) => number) => {
    setVisible(false);
    setTimeout(() => {
      setActive(next);
      setVisible(true);
    }, 380);
  }, []);

  const goTo = useCallback((i: number) => transitionTo(() => i), [transitionTo]);

  useEffect(() => {
    const id = setInterval(() => {
      transitionTo((current) => (current + 1) % testimonials.length);
    }, 6500);
    return () => clearInterval(id);
  }, [transitionTo]);

  const t = testimonials[active];

  return (
    <section className="relative py-20 lg:py-36 bg-surface border-t border-foreground/6 overflow-hidden">
      {/* Large decorative quotation mark */}
      <div aria-hidden className="absolute -top-4 -left-4 pointer-events-none select-none">
        <span
          className="font-bold text-foreground/[0.025] leading-none"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(240px, 36vw, 480px)" }}
        >
          &ldquo;
        </span>
      </div>

      <div className="max-w-7xl mx-auto px-6 lg:px-16 relative z-10">
        <AnimateIn>
          <div className="flex items-center gap-4 mb-12 lg:mb-20">
            <span className="block w-8 h-px bg-gold/50 flex-shrink-0" />
            <p className="text-foreground/68 text-[10px] tracking-[0.48em] uppercase">
              O que dizem os clientes
            </p>
          </div>
        </AnimateIn>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-20 items-end">
          {/* Quote */}
          <AnimateIn delay={80}>
            <div
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "none" : "translateY(12px)",
                transition: "opacity 0.38s ease, transform 0.38s ease",
              }}
            >
              <Stars />
              <p
                className="text-foreground font-bold leading-[1.28] mt-7 mb-9"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(20px, 2.8vw, 36px)",
                }}
              >
                &ldquo;{t.quote}&rdquo;
              </p>
              <div className="flex items-center gap-5">
                <div className="w-8 h-px bg-gold/50" />
                <div>
                  <p className="text-foreground text-sm font-semibold">{t.name}</p>
                  <p className="text-foreground/55 text-[10px] tracking-[0.2em] uppercase mt-0.5">
                    {t.role}
                  </p>
                </div>
              </div>
            </div>
          </AnimateIn>

          {/* Navigation + progress */}
          <AnimateIn delay={140}>
            <div className="flex flex-col items-start lg:items-end gap-6">
              {/* Counter */}
              <div
                className="flex items-center gap-2 tabular-nums"
                style={{
                  opacity: visible ? 1 : 0,
                  transition: "opacity 0.38s ease",
                }}
              >
                <span
                  className="text-foreground/72 font-bold"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(28px, 3vw, 40px)",
                  }}
                >
                  {String(active + 1).padStart(2, "0")}
                </span>
                <span className="text-foreground/20 text-sm">/</span>
                <span className="text-foreground/20 text-sm tabular-nums">
                  {String(testimonials.length).padStart(2, "0")}
                </span>
              </div>

              {/* Dot navigation */}
              <div className="flex gap-1.5">
                {testimonials.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goTo(i)}
                    aria-label={`Testemunho ${i + 1}`}
                    aria-current={i === active ? "true" : undefined}
                    className="group py-3 px-1.5 flex-shrink-0"
                  >
                    <span
                      className={`block h-0.5 transition-all duration-400 ${
                        i === active
                          ? "w-8 bg-moss"
                          : "w-4 bg-foreground/18 group-hover:bg-foreground/35"
                      }`}
                    />
                  </button>
                ))}
              </div>

              {/* Prev / Next buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={() => goTo((active - 1 + testimonials.length) % testimonials.length)}
                  aria-label="Testemunho anterior"
                  className="w-10 h-10 border border-foreground/12 flex items-center justify-center text-foreground/38 hover:border-moss/50 hover:text-moss transition-all duration-300 rounded-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M15 19l-7-7 7-7"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => goTo((active + 1) % testimonials.length)}
                  aria-label="Próximo testemunho"
                  className="w-10 h-10 border border-foreground/12 flex items-center justify-center text-foreground/38 hover:border-moss/50 hover:text-moss transition-all duration-300 rounded-sm"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </button>
              </div>
            </div>
          </AnimateIn>
        </div>
      </div>
    </section>
  );
}
