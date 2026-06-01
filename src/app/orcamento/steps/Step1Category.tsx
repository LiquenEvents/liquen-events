"use client";

import Image from "next/image";
import type { QuoteFormData } from "../types";
import type { Action } from "../OrcamentoWizard";
import { CATEGORIES } from "../data";

interface Props {
  form: QuoteFormData;
  dispatch: React.Dispatch<Action>;
}

const CATEGORY_IMAGES: Record<string, string> = {
  empresas: "/imagens/EW1_1398.jpg",
  particulares: "/imagens/DaniGui_JantarFesta_24.jpg",
};

const NUMS = ["01", "02", "03"];

export default function Step1Category({ form, dispatch }: Props) {
  return (
    <div className="flex flex-col gap-2">
      {CATEGORIES.map((cat, i) => {
        const active = form.category === cat.id;
        return (
          <button
            key={cat.id}
            type="button"
            onClick={() => dispatch({ type: "SET", field: "category", value: cat.id })}
            className={`relative group block overflow-hidden text-left transition-all duration-400 rounded-sm ${
              active ? "ring-1 ring-moss ring-offset-1 ring-offset-surface" : ""
            }`}
            style={{ aspectRatio: "21/9" }}
          >
            <Image
              src={CATEGORY_IMAGES[cat.id]}
              alt={cat.label}
              fill
              sizes="(max-width: 1024px) 100vw, 55vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
            />
            <div
              className={`absolute inset-0 transition-colors duration-400 ${
                active ? "bg-black/40" : "bg-black/65 group-hover:bg-black/52"
              }`}
            />

            {/* Sequential number */}
            <span className="absolute top-5 left-6 text-white/22 text-[10px] font-mono tracking-[0.4em]">
              {NUMS[i]}
            </span>

            {/* Bottom content */}
            <div className="absolute bottom-0 left-0 right-0 px-6 pb-6 flex items-end justify-between">
              <div>
                <p className="text-white/38 text-[9px] tracking-[0.5em] uppercase mb-2">
                  {cat.subtitle}
                </p>
                <p
                  className="text-white text-2xl font-bold leading-none"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {cat.label}
                </p>
              </div>

              {active ? (
                <div className="w-7 h-7 bg-moss rounded-full flex items-center justify-center flex-shrink-0 ml-4 shadow-lg">
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path
                      d="M2.5 6.5l3 3 5-5"
                      stroke="white"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </div>
              ) : (
                <div className="w-7 h-7 border border-white/22 rounded-full flex-shrink-0 ml-4 group-hover:border-white/50 transition-colors" />
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
