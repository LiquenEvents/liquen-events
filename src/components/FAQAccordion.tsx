"use client";

import { useId, useState } from "react";

interface FAQ {
  q: string;
  a: string;
}

interface Props {
  faqs: FAQ[];
}

export default function FAQAccordion({ faqs }: Props) {
  const uid = useId();
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div className="flex flex-col">
      {faqs.map((f, i) => {
        const isOpen = open === i;
        const panelId = `${uid}-panel-${i}`;
        return (
          <div key={f.q} className="border-t border-foreground/8 last:border-b">
            <button
              onClick={() => setOpen(isOpen ? null : i)}
              className="w-full flex items-start justify-between gap-6 py-6 text-left group"
              aria-expanded={isOpen}
              aria-controls={panelId}
            >
              <h3
                className="text-foreground/80 text-base leading-snug group-hover:text-foreground transition-colors duration-200"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {f.q}
              </h3>
              <span
                className={`flex-shrink-0 w-5 h-5 rounded-full border border-foreground/15 flex items-center justify-center text-foreground/38 group-hover:border-moss/40 group-hover:text-moss transition-all duration-300 mt-0.5 ${
                  isOpen ? "rotate-45 border-moss/50 text-moss" : ""
                }`}
                style={{
                  transition:
                    "transform 0.35s cubic-bezier(0.16,1,0.3,1), border-color 0.3s, color 0.3s",
                }}
                aria-hidden
              >
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                  <path
                    d="M5 1v8M1 5h8"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="round"
                  />
                </svg>
              </span>
            </button>

            <div
              id={panelId}
              role="region"
              style={{
                display: "grid",
                gridTemplateRows: isOpen ? "1fr" : "0fr",
                transition: "grid-template-rows 0.38s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <div className="overflow-hidden">
                <p className="text-foreground/60 text-sm leading-[1.9] pb-6 max-w-2xl">{f.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
