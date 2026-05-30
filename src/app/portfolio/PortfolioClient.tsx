"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import AnimateIn from "@/components/AnimateIn";
import { blurFor } from "@/lib/blur";
import { projects, type Project } from "./projects-data";

const categories = ["Todos", ...Array.from(new Set(projects.map((p) => p.category)))];

function Showcase({ p, index }: { p: Project; index: number }) {
  const [active, setActive] = useState(0);
  const reversed = index % 2 === 1;

  return (
    <div className="group py-10 lg:py-20 border-t border-foreground/8">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20 items-center">

        {/* ── Visual ── */}
        <div className={reversed ? "lg:order-2" : ""}>
          <div className="relative overflow-hidden rounded-xl" style={{ aspectRatio: "4/3" }}>
            <Image
              key={p.images[active]}
              src={p.images[active]}
              alt={`${p.title} — ${active + 1}`}
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover lb-photo-in"
              {...blurFor(p.images[active])}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/25 to-transparent pointer-events-none" />
            <span className="absolute top-4 left-4 text-[10px] tracking-[0.3em] uppercase text-cream/80 bg-black/30 backdrop-blur-sm px-3 py-1.5 rounded-full border border-cream/10">
              {p.category}
            </span>
          </div>
          {/* Thumbnails */}
          <div className="grid grid-cols-4 gap-2 mt-2">
            {p.images.map((img, i) => (
              <button
                key={img}
                type="button"
                onClick={() => setActive(i)}
                aria-label={`Ver imagem ${i + 1} de ${p.title}`}
                className={`relative overflow-hidden rounded-md transition-all duration-300 focus:outline-none ${
                  i === active ? "ring-2 ring-moss" : "opacity-45 hover:opacity-80"
                }`}
                style={{ aspectRatio: "1/1" }}
              >
                <Image src={img} alt="" fill sizes="120px" className="object-cover" />
              </button>
            ))}
          </div>
        </div>

        {/* ── Info ── */}
        <div className={reversed ? "lg:order-1" : ""}>
          <div className="flex items-center gap-4 mb-8">
            <span className="text-foreground/15 text-xs font-mono tabular-nums">
              {String(index + 1).padStart(2, "0")}
            </span>
            <span className="flex-1 h-px bg-foreground/8" />
            <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase">{p.category}</p>
          </div>

          <h3
            className="text-foreground text-2xl md:text-3xl lg:text-5xl font-bold mb-6 leading-[1.05] group-hover:text-moss transition-colors duration-300"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {p.title}
          </h3>

          <p className="text-foreground/40 text-sm leading-[1.9] mb-7 lg:mb-10 max-w-md">{p.desc}</p>

          {/* Meta */}
          <div className="flex gap-8 lg:gap-12 mb-8 lg:mb-10">
            <div>
              <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-1.5">Ano</p>
              <p className="text-foreground/65 text-sm tabular-nums">{p.year}</p>
            </div>
            <div>
              <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-1.5">Local</p>
              <p className="text-foreground/65 text-sm">{p.location}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-8 lg:mb-12">
            {p.tags.map((tag) => (
              <span
                key={tag}
                className="text-xs px-3 py-1.5 border border-foreground/10 text-foreground/35 rounded-full tracking-wide"
              >
                {tag}
              </span>
            ))}
          </div>

          <Link
            href={`/portfolio/${p.slug}`}
            className="inline-flex items-center gap-3 text-[11px] tracking-[0.3em] uppercase text-foreground/35 hover:text-moss transition-colors duration-300 group/cta"
          >
            <span className="w-8 h-px bg-foreground/20 group-hover/cta:w-12 group-hover/cta:bg-moss transition-all duration-300" />
            Ver projeto
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function PortfolioClient() {
  const [activeCat, setActiveCat] = useState("Todos");

  const filtered =
    activeCat === "Todos" ? projects : projects.filter((p) => p.category === activeCat);

  const countFor = (cat: string) =>
    cat === "Todos" ? projects.length : projects.filter((p) => p.category === cat).length;

  return (
    <>
      {/* Filter bar */}
      <div className="sticky top-16 z-40 bg-surface/92 backdrop-blur-md border-b border-foreground/8 py-5">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="flex gap-2 overflow-x-auto scroll-hide pb-1">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCat(cat)}
                className={`flex-shrink-0 flex items-center gap-2 px-5 py-2 text-[11px] font-medium tracking-[0.2em] uppercase transition-all duration-200 rounded-sm ${
                  activeCat === cat
                    ? "bg-moss text-cream"
                    : "border border-foreground/12 text-foreground/40 hover:text-foreground/70 hover:border-foreground/25"
                }`}
              >
                {cat}
                <span className={`text-[10px] tabular-nums ${activeCat === cat ? "text-cream/50" : "text-foreground/20"}`}>
                  {countFor(cat)}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Projects */}
      <section className="py-10 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          {filtered.map((p, i) => (
            <AnimateIn key={p.title} delay={(i % 2) * 60}>
              <Showcase p={p} index={i} />
            </AnimateIn>
          ))}
          <div className="border-t border-foreground/8" />
        </div>
      </section>
    </>
  );
}
