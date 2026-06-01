import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import GaleriaClient from "./GaleriaClient";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { blurFor } from "@/lib/blur";

export const metadata: Metadata = pageMetadata({
  title: "Galeria de Eventos — Évora e Alentejo",
  description:
    "Galeria de fotografias dos eventos organizados pela Líquen Events em Évora, Alentejo e todo o Portugal — casamentos, eventos corporativos, conferências e celebrações.",
  path: "/galeria",
  image: "/imagens/DaniGui_Preview20.jpg",
  keywords: ["galeria de eventos", "fotografias de casamentos Alentejo", "eventos Évora"],
});

const heroPhotos = [
  "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
  "/imagens/DaniGui_Preview20.jpg",
  "/imagens/EW1_1408.jpg",
];

export default function GaleriaPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Galeria", path: "/galeria" }]} />

      {/* ── Hero — editorial mosaic ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden bg-[#080808]">
        {/* Background grid of 3 photos */}
        <div className="absolute inset-0 grid grid-cols-3 gap-px opacity-60">
          {heroPhotos.map((src, i) => (
            <div key={i} className="relative overflow-hidden">
              <Image
                src={src}
                alt=""
                fill
                priority={i === 0}
                sizes="33vw"
                className="object-cover object-center"
                {...blurFor(src)}
              />
            </div>
          ))}
        </div>

        {/* Overlays */}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-20 lg:pb-28 pt-40">
          <p className="text-white/40 text-[10px] tracking-[0.52em] uppercase mb-10 anim-0 flex items-center gap-3">
            <span className="w-8 h-px bg-gold flex-shrink-0" />
            Os nossos momentos
          </p>
          <h1
            className="text-white font-bold leading-[0.88] tracking-tight anim-1"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(58px, 10vw, 148px)" }}
          >
            Galeria<span className="text-moss">.</span>
          </h1>
          <div className="mt-8 border-t border-white/10 pt-7 anim-2">
            <p className="text-white/45 text-base leading-relaxed max-w-md">
              Casamentos, eventos corporativos e celebrações — cada fotografia conta uma história.
            </p>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 right-6 lg:right-16 z-10 flex flex-col items-center gap-3 anim-3">
          <span className="text-white/25 text-[9px] tracking-[0.5em] uppercase [writing-mode:vertical-rl]">
            Scroll
          </span>
          <div className="h-10 w-px overflow-hidden">
            <div className="w-full h-full bg-gradient-to-b from-white/50 to-transparent animate-scroll-line" />
          </div>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section className="py-14 lg:py-20 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <GaleriaClient />
        </div>
      </section>

      {/* ── Instagram CTA ── */}
      <section className="py-24 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 items-end">
            <div>
              <p className="text-foreground/68 text-[10px] tracking-[0.48em] uppercase mb-6 flex items-center gap-3">
                <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                Redes sociais
              </p>
              <h2
                className="text-foreground text-3xl lg:text-4xl font-bold mb-4 leading-tight"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                Siga-nos no Instagram
              </h2>
              <p className="text-foreground/55 text-sm leading-relaxed max-w-md">
                Partilhamos os bastidores dos nossos eventos, inspirações e os momentos mais
                especiais no Instagram.
              </p>
            </div>
            <a
              href="https://www.instagram.com/liquen.events"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium text-sm tracking-widest uppercase hover:bg-moss-dark hover:gap-5 transition-all duration-300 self-end"
            >
              @liquen.events →
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
