import Link from "next/link";
import Image from "next/image";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import RatingBadge from "@/components/RatingBadge";
import { blurFor } from "@/lib/blur";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import ClientMarquee from "@/components/ClientMarquee";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Magnetic from "@/components/motion/Magnetic";
import Reveal from "@/components/motion/Reveal";
import TiltCard from "@/components/motion/TiltCard";
import PhotoWall from "@/components/motion/PhotoWall";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";

// Each tile links to a distinct destination that matches its label
// (Corporativos / Casamentos / Privados) — the first two deep-link to their
// dedicated service pages, the third to the celebrations category.
const serviceLinks = [
  { image: "/imagens/EW1_1408.jpg", href: "/servicos/eventos-corporativos" },
  { image: "/imagens/DaniGui_Preview20.jpg", href: "/servicos/casamentos" },
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

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const services = serviceLinks.map((s, i) => ({ ...s, ...t.home.services[i] }));
  return (
    <>
      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed
          behind the transparent fixed navbar. */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
            {...blurFor("/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg")}
            alt="Líquen Events — evento aéreo no Alentejo"
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
          />
        </Parallax>
        {/* WebGL layer over the static hero image (fades in when ready; absent
            under reduced motion / no-WebGL). */}
        <HeroWebGL
          src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-black/15" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/75 via-[#080808]/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-20 lg:pb-28 pt-40">
          <p className="text-white/70 text-[10px] sm:text-xs tracking-[0.45em] uppercase mb-8 lg:mb-12 anim-0 flex items-center gap-3">
            <span className="inline-block w-8 h-px bg-gold flex-shrink-0" />
            {t.home.eyebrow}
          </p>
          <h1
            className="text-white font-bold leading-[0.86] tracking-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "var(--hero-display)" }}
          >
            {/* Readable sentence for SEO / screen readers — the animated words
                below are laid out with flex gaps (no spaces) and aria-hidden. */}
            <span className="sr-only">
              {t.home.heroLines.map((l) => l.words.join(" ")).join(" ")}
            </span>
            {t.home.heroLines.map(({ words, moss }, lineIndex) => {
              const delay = [180, 360, 520][lineIndex] ?? 520;
              return (
                <span
                  key={words.join("")}
                  aria-hidden
                  className="flex flex-wrap"
                  style={{ gap: "0.26em" }}
                >
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
            <Magnetic strength={0.4}>
              <Link
                href={localizeHref("/orcamento", locale)}
                className="inline-flex items-center gap-2 px-8 py-4 btn-shine bg-moss text-cream text-xs font-medium rounded-sm hover:bg-moss-dark hover:gap-3 transition-all duration-300 tracking-widest uppercase shadow-lg shadow-moss/20"
              >
                {t.common.pedirOrcamento} →
              </Link>
            </Magnetic>
            <Link
              href={localizeHref("/galeria", locale)}
              className="link-line text-xs text-white/55 hover:text-white/85 transition-colors tracking-[0.2em] uppercase"
            >
              {t.common.verGaleria}
            </Link>
          </div>
          {/* Real Google rating, above the fold — the strongest trust cue. */}
          <div className="mt-8 anim-3">
            <RatingBadge
              label={t.common.reviewsLabel}
              ptFormat={locale === "pt"}
              starClassName="text-gold"
              textClassName="text-white/75"
            />
          </div>
        </div>

        <div className="absolute bottom-8 right-6 lg:right-16 z-10 flex flex-col items-center gap-3 anim-3">
          <span className="text-white/60 text-[9px] tracking-[0.5em] uppercase [writing-mode:vertical-rl]">
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
              {/* Cabeçalho de secção (h2): dá à grelha de serviços um heading
                  de nível 2, para os títulos dos cartões (h3) deixarem de
                  saltar de h1 → h3. Estilo idêntico ao antigo <p> (o reset do
                  Tailwind zera tamanho/margem dos headings). */}
              <h2 className="text-foreground/72 text-xs tracking-[0.3em] uppercase flex items-center gap-3 font-normal">
                <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
                {t.home.servicesEyebrow}
              </h2>
              <Link
                href={localizeHref("/servicos", locale)}
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
              <Reveal key={s.title} variant="mask" delay={i * 0.08} className="rounded-xl">
                <TiltCard className="rounded-xl">
                  <Link
                    href={localizeHref(s.href, locale)}
                    className="group relative block rounded-xl overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
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
                    {/* Cursor-tracked specular sheen (reads --mx/--my from TiltCard). */}
                    <span
                      aria-hidden
                      data-sheen
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.5), transparent 62%)",
                        mixBlendMode: "soft-light",
                      }}
                    />
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
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery photo wall — 3D curved carousel (flat ribbon fallback) ── */}
      <PhotoWall
        images={ribbon.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }))}
        href={localizeHref("/galeria", locale)}
        label={t.common.verGaleria}
      />

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── Reach — events anywhere (no place-name on the visible page) ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Image */}
          <AnimateIn
            from="left"
            className="relative min-h-[300px] lg:min-h-[640px] overflow-hidden"
          >
            <Image
              src="/imagens/DJI_20250913190640_0121_D.jpg"
              alt="Evento organizado pela Líquen Events — vista aérea"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              {...blurFor("/imagens/DJI_20250913190640_0121_D.jpg")}
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
        <Parallax speed={0.1} className="absolute inset-0">
          <Image
            src="/imagens/JOAO_E_PEDRO_1Y1A3450.jpg"
            alt="Evento Líquen Events"
            fill
            sizes="100vw"
            className="object-cover object-center scale-110"
            {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3450.jpg")}
          />
        </Parallax>
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.home.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
          </AnimateIn>
          <h2
            className="text-white font-bold leading-[0.9] tracking-tight mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 8vw, 116px)" }}
          >
            <TitleReveal text={t.home.ctaTitleLine1} as="span" className="block" />
            <TitleReveal
              text={t.home.ctaTitleLine2}
              as="span"
              className="block text-moss"
              delay={220}
            />
          </h2>
          <AnimateIn delay={110}>
            <p className="text-white/60 text-base leading-relaxed max-w-md mb-12">
              {t.home.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href={localizeHref("/orcamento", locale)}
                className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
              >
                {t.common.pedirOrcamento} →
              </Link>
              <Link
                href={localizeHref("/galeria", locale)}
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
