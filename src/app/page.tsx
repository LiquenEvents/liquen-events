import Link from "next/link";
import Image from "next/image";
import AnimateIn from "@/components/AnimateIn";
import { blurFor } from "@/lib/blur";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import ClientMarquee from "@/components/ClientMarquee";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

const serviceLinks = [
  { image: "/imagens/EW1_1408.jpg", href: "/servicos#empresas" },
  { image: "/imagens/DaniGui_Preview20.jpg", href: "/servicos#celebracoes" },
  { image: "/imagens/DaniGui_JantarFesta_27.jpg", href: "/servicos#celebracoes" },
];

const ribbon = [
  "/imagens/Natalia e Jonathan-167.jpg",
  "/imagens/EW1_0697.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
  "/imagens/DaniGui_Adois_61.jpg",
  "/imagens/20_10_2025_0220.jpg",
  "/imagens/ines-goncalo-252.jpg",
  "/imagens/M&F0497.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg",
  "/imagens/428694133-339551105742981-427109035692944303-n.jpg",
  "/imagens/stephanie-mizio-715.jpg",
  "/imagens/image6.jpeg",
  "/imagens/mom-0961.jpg",
];

export default async function Home() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const services = serviceLinks.map((s, i) => ({ ...s, ...t.home.services[i] }));
  return (
    <>
      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed
          behind the transparent fixed navbar. */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Image
          src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
          alt="Líquen Events — evento aéreo no Alentejo"
          fill
          preload
          sizes="100vw"
          className="object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/75 via-[#080808]/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-20 lg:pb-28 pt-40">
          <p className="text-white/45 text-[10px] sm:text-xs tracking-[0.45em] uppercase mb-8 lg:mb-12 anim-0 flex items-center gap-3">
            <span className="inline-block w-8 h-px bg-gold flex-shrink-0" />
            {t.home.eyebrow}
          </p>
          <h1
            className="text-white font-bold leading-[0.86] tracking-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(56px, 10vw, 150px)" }}
          >
            {t.home.heroLines.map(({ words, moss }, lineIndex) => {
              const delay = [180, 360, 520][lineIndex] ?? 520;
              return (
                <span key={words.join("")} className="flex flex-wrap" style={{ gap: "0.26em" }}>
                  {words.map((word, i) => (
                    <span
                      key={word + i}
                      className={`inline-block word-rise${moss ? " text-moss" : ""}`}
                      style={{ "--word-delay": `${delay + i * 110}ms` } as React.CSSProperties}
                    >
                      {word}
                    </span>
                  ))}
                </span>
              );
            })}
          </h1>
          <div className="mt-10 lg:mt-14 flex flex-wrap items-center gap-x-6 gap-y-4 anim-2">
            <Link
              href="/orcamento"
              className="inline-flex items-center gap-2 px-8 py-4 btn-shine bg-moss text-cream text-xs font-medium rounded-sm hover:bg-moss-dark hover:gap-3 transition-all duration-300 tracking-widest uppercase shadow-lg shadow-moss/20"
            >
              {t.common.pedirOrcamento} →
            </Link>
            <Link
              href="/galeria"
              className="link-line text-xs text-white/55 hover:text-white/85 transition-colors tracking-[0.2em] uppercase"
            >
              {t.common.verGaleria}
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 right-6 lg:right-16 z-10 flex flex-col items-center gap-3 anim-3">
          <span className="text-white/25 text-[9px] tracking-[0.5em] uppercase [writing-mode:vertical-rl]">
            {t.home.scroll}
          </span>
          <div className="h-10 w-px overflow-hidden">
            <div className="w-full h-full bg-gradient-to-b from-white/50 to-transparent animate-scroll-line" />
          </div>
        </div>
      </section>

      {/* ── Clients marquee ── */}
      <ClientMarquee />

      {/* ── Services — minimal image tiles ── */}
      <section className="py-16 lg:py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-8 lg:mb-12">
              <p className="text-foreground/72 text-xs tracking-[0.3em] uppercase flex items-center gap-3">
                <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
                {t.home.servicesEyebrow}
              </p>
              <Link
                href="/servicos"
                className="group text-xs text-foreground/72 hover:text-moss transition-colors flex items-center gap-1.5"
              >
                {t.common.verServicos}
                <span className="group-hover:translate-x-0.5 transition-transform inline-block">
                  →
                </span>
              </Link>
            </div>
          </AnimateIn>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {services.map((s, i) => (
              <AnimateIn key={s.title} delay={i * 60}>
                <Link
                  href={s.href}
                  className="group relative block rounded-xl overflow-hidden"
                  style={{ aspectRatio: "3/4" }}
                >
                  <Image
                    src={s.image}
                    alt={s.title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    {...blurFor(s.image)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent group-hover:from-black/70 transition-all duration-500" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-6">
                    <p className="text-moss/70 text-[8px] sm:text-[9px] tracking-[0.35em] uppercase mb-1">
                      {s.tag}
                    </p>
                    <h3
                      className="text-cream text-base sm:text-lg lg:text-2xl font-bold group-hover:text-moss transition-colors duration-200"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {s.title}
                    </h3>
                  </div>
                </Link>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery ribbon ── */}
      <section className="relative bg-surface border-y border-foreground/8 overflow-hidden py-2 sm:py-3">
        <Link href="/galeria" className="group block">
          <div className="absolute inset-y-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-surface to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-surface to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <span className="px-5 py-2.5 bg-surface/70 backdrop-blur-sm border border-cream/10 rounded-full text-cream/80 text-[10px] sm:text-[11px] tracking-[0.3em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              {t.common.verGaleria} →
            </span>
          </div>
          <div className="flex gap-2 animate-marquee w-max">
            {[...ribbon, ...ribbon].map((src, i) => (
              <div
                key={i}
                className="relative h-[120px] sm:h-[180px] lg:h-[240px] w-[180px] sm:w-[270px] lg:w-[360px] flex-shrink-0 overflow-hidden rounded-lg"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="360px"
                  className="object-cover group-hover:brightness-75 transition-all duration-500"
                  {...blurFor(src)}
                />
              </div>
            ))}
          </div>
        </Link>
      </section>

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── SEO content — organização de eventos no Alentejo, Lisboa e Portugal ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Image */}
          <AnimateIn
            from="left"
            className="relative min-h-[300px] lg:min-h-[640px] overflow-hidden"
          >
            <Image
              src="/imagens/DaniGui_Adois_61.jpg"
              alt="Organização de eventos no Alentejo — Líquen Events"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
            />
            <div className="absolute inset-0 bg-black/20" />
          </AnimateIn>

          {/* Text — trimmed */}
          <div className="flex flex-col justify-center px-6 lg:px-16 py-16 lg:py-28">
            <AnimateIn>
              <p className="text-foreground/72 text-xs tracking-[0.3em] uppercase mb-6 flex items-center gap-3">
                <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
                {t.home.areasEyebrow}
              </p>
              <h2
                className="text-foreground font-bold leading-[1.05] mb-8"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 4vw, 56px)" }}
              >
                {t.home.areasTitleLine1}
                <br />
                {t.home.areasTitleLine2}
              </h2>
              <p className="text-foreground/78 text-base lg:text-lg leading-[1.8] max-w-lg">
                {t.home.areasText}
              </p>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div className="mt-10 flex flex-wrap gap-2.5">
                {t.home.areasTags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs tracking-wide text-foreground/60 border border-foreground/12 rounded-full px-4 py-2"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Image
          src="/imagens/JOAO_E_PEDRO_1Y1A3450.jpg"
          alt="Evento Líquen Events"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3450.jpg")}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/35 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.home.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
            <h2
              className="text-white font-bold leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 8vw, 116px)" }}
            >
              {t.home.ctaTitleLine1}
              <br />
              <span className="text-moss">{t.home.ctaTitleLine2}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/45 text-base leading-relaxed max-w-md mb-12">
              {t.home.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/orcamento"
                className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
              >
                {t.common.pedirOrcamento} →
              </Link>
              <Link
                href="/galeria"
                className="inline-flex items-center gap-3 px-9 py-4 border border-white/25 text-white/70 font-medium hover:border-white/50 hover:text-white transition-all duration-300 text-sm tracking-[0.18em] uppercase"
              >
                {t.common.verGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
