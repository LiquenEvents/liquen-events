"use client";

import { useState } from "react";
import type { Dict } from "@/lib/i18n";

// `faqs` is passed in from the server page (which already resolves it for the
// FaqJsonLd) rather than pulled from context — the contacto namespace no longer
// needs to ride the site-wide LocaleProvider slice.
//
// `light` switches the palette for use over a dark photo/veil (the SpaceX-style
// FAQ section) instead of the default dark-on-cream.
export default function FAQ({
  faqs,
  light = false,
}: {
  faqs: Dict["contacto"]["faqs"];
  light?: boolean;
}) {
  const [open, setOpen] = useState<number | null>(null);

  const rowBorder = light ? "border-white/12" : "border-foreground/8";
  const qOpen = light ? "text-white" : "text-foreground";
  const qClosed = light
    ? "text-white/75 group-hover:text-white/90"
    : "text-foreground/72 group-hover:text-foreground/80";
  // Caixa quadrada (idioma SpaceX — sem rounded): em vez do antigo círculo com
  // "+" a rodar 45°, o glifo alterna +/− (rodar um quadrado leria como losango).
  const iconOpen = light ? "border-moss-light text-moss-light" : "border-moss text-moss";
  const iconClosed = light
    ? "border-white/25 text-white/70"
    : "border-foreground/15 text-foreground/72";
  const answer = light ? "text-white/70" : "text-foreground/70";

  return (
    <div>
      {faqs.map((faq, i) => {
        const isOpen = open === i;
        return (
          <div key={i} className={`border-t ${rowBorder}`}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              aria-expanded={isOpen}
              aria-controls={`faq-panel-${i}`}
              id={`faq-q-${i}`}
              className="w-full flex items-start justify-between gap-8 py-8 text-left group"
            >
              <span
                className={`text-sm lg:text-base leading-snug transition-colors duration-200 ${
                  isOpen ? qOpen : qClosed
                }`}
              >
                {faq.q}
              </span>
              <span
                aria-hidden
                className={`flex-shrink-0 w-5 h-5 border flex items-center justify-center text-xs transition-all duration-300 ${
                  isOpen ? iconOpen : iconClosed
                }`}
              >
                {isOpen ? "−" : "+"}
              </span>
            </button>
            {/* grid-rows 0fr→1fr animates height without a fixed max-height,
                so long answers never clip on narrow screens. `inert` keeps the
                collapsed answer out of the focus order & screen-reader flow. */}
            <div
              id={`faq-panel-${i}`}
              role="region"
              aria-labelledby={`faq-q-${i}`}
              inert={!isOpen}
              className={`grid transition-all duration-400 ease-in-out ${
                isOpen ? "grid-rows-[1fr] opacity-100 pb-8" : "grid-rows-[0fr] opacity-0"
              }`}
            >
              <div className="overflow-hidden">
                <p className={`${answer} text-sm leading-[1.9] max-w-2xl`}>{faq.a}</p>
              </div>
            </div>
          </div>
        );
      })}
      <div className={`border-t ${rowBorder}`} />
    </div>
  );
}
