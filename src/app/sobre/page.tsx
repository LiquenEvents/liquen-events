import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";

export const metadata: Metadata = pageMetadata({
  title: "Sobre Nós — Empresa de Eventos",
  description:
    "Conheça a Líquen Events, empresa de organização de eventos. Mais de 100 eventos no Alentejo, Lisboa e em todo o Portugal — casamentos, eventos corporativos e celebrações.",
  path: "/sobre",
  image: "/imagens/M&F0497.jpg",
  keywords: ["organização de eventos Alentejo", "sobre Líquen Events"],
});

const gallery = [
  { src: "/imagens/Natalia e Jonathan-167.jpg", cls: "col-span-2 row-span-2" },
  { src: "/imagens/EW1_1342.jpg", cls: "col-span-2" },
  { src: "/imagens/DaniGui_Adois_61.jpg", cls: "col-span-1" },
  { src: "/imagens/20_10_2025_0375.jpg", cls: "col-span-1" },
  { src: "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg", cls: "col-span-2" },
  { src: "/imagens/ines-goncalo-252.jpg", cls: "col-span-2" },
];

const eyebrowLight =
  "text-white/35 text-[10px] tracking-[0.52em] uppercase flex items-center gap-3";
const eyebrowDark =
  "text-foreground/68 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

export default function SobrePage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Sobre", path: "/sobre" }]} />

      {/* ── HERO ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Image
          src="/imagens/JOAO_E_PEDRO_1Y1A3204.jpg"
          alt="Líquen Events — celebração"
          fill
          preload
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3204.jpg")}
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/20 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-16 lg:pb-28 pt-40">
          <AnimateIn>
            <p className={`${eyebrowLight} mb-8`}>
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              Quem somos
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <h1
              className="text-white font-bold leading-[0.88] tracking-tight"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(54px, 10vw, 150px)" }}
            >
              Sobre a <span className="text-moss">Líquen.</span>
            </h1>
          </AnimateIn>
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 pointer-events-none">
          <span className="text-white/30 text-[8px] tracking-[0.45em] uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ── MANIFESTO — short statement + image ── */}
      <section className="py-20 lg:py-32 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-20 items-center">
          <AnimateIn from="left">
            <p className={`${eyebrowDark} mb-8`}>
              <span className="w-5 h-px bg-gold/50 flex-shrink-0" />A nossa essência
            </p>
            <h2
              className="text-foreground font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 5vw, 68px)" }}
            >
              Organizamos eventos.
              <br />
              <span className="text-moss">Eternizamos memórias.</span>
            </h2>
            <p className="text-foreground/78 text-base lg:text-lg leading-[1.8] mt-8 max-w-md">
              Desde 2018 que transformamos visões em experiências — em todo o Portugal.
            </p>
          </AnimateIn>
          <AnimateIn from="right" delay={120}>
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
              <Image
                src="/imagens/DaniGui_Preview12.jpg"
                alt="Evento Líquen Events"
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
                {...blurFor("/imagens/DaniGui_Preview12.jpg")}
              />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── EDITORIAL PHOTO GRID ── */}
      <section className="bg-surface">
        <AnimateIn from="fade">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1.5 auto-rows-[150px] sm:auto-rows-[210px] lg:auto-rows-[260px]">
            {gallery.map((g, i) => (
              <div key={i} className={`relative overflow-hidden group ${g.cls}`}>
                <Image
                  src={g.src}
                  alt="Evento Líquen Events"
                  fill
                  sizes="(max-width: 768px) 50vw, 50vw"
                  className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                  {...blurFor(g.src)}
                />
                <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── CINEMATIC STATEMENT ── */}
      <section
        className="relative overflow-hidden border-t border-foreground/8"
        style={{ minHeight: "clamp(360px, 65vh, 760px)" }}
      >
        <Image
          src="/imagens/M&F0497.jpg"
          alt="Líquen Events — celebração"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/M&F0497.jpg")}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]/50" />
        <div className="relative z-10 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 w-full py-20 lg:py-28">
            <AnimateIn>
              <p
                className="text-cream font-bold leading-[1.12] max-w-4xl"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4.5vw, 64px)" }}
              >
                Não organizamos apenas eventos.
                <span className="text-cream/40">
                  {" "}
                  Desenhamos experiências que ficam para sempre.
                </span>
              </p>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── FOUNDER ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="relative min-h-[360px] lg:min-h-[560px] overflow-hidden">
            <Image
              src="/imagens/DaniGui_JantarFesta_27.jpg"
              alt="Líquen Events"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              {...blurFor("/imagens/DaniGui_JantarFesta_27.jpg")}
            />
            <div className="absolute inset-0 bg-black/20" />
          </div>
          <div className="flex flex-col justify-center px-6 lg:px-16 py-16 lg:py-28">
            <AnimateIn>
              <p className={`${eyebrowDark} mb-10`}>
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                As pessoas
              </p>
              <span
                className="block text-moss/25 text-6xl font-bold leading-none mb-6"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                &ldquo;
              </span>
              <p
                className="text-foreground/78 leading-[1.5]"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 3vw, 38px)" }}
              >
                Cada evento é uma oportunidade de criar algo extraordinário. É o que nos move.
              </p>
              <div className="mt-10 flex items-center gap-4">
                <span className="w-8 h-px bg-gold/50" />
                <div>
                  <p className="text-foreground text-sm font-semibold">Catarina Gaspar</p>
                  <p className="text-foreground/60 text-xs mt-0.5">Fundadora &amp; CEO</p>
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Image
          src="/imagens/DaniGui_Adois_61.jpg"
          alt="Evento Líquen Events"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/35 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              Vamos criar juntos
              <span className="w-8 h-px bg-gold" />
            </p>
            <h2
              className="text-white font-bold leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 7vw, 96px)" }}
            >
              Vamos trabalhar
              <br />
              <span className="text-moss">juntos?</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/45 text-base leading-relaxed max-w-md mb-12">
              Da primeira conversa ao último brinde, tratamos de cada detalhe do seu evento.
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <Link
              href="/contacto"
              className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
            >
              Entrar em Contacto →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
