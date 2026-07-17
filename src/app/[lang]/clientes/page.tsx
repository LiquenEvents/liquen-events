import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Magnetic from "@/components/motion/Magnetic";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import CountUp from "@/components/CountUp";
import HeroWebGL from "@/components/motion/HeroWebGL";
import ClientLogoGrid from "@/components/ClientLogoGrid";
import ClientMarquee from "@/components/ClientMarquee";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { clientLogos } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS, PRIMARY_BUTTON_DARK_CLASS } from "@/lib/ui-classes";
import RotatingPhotoGrid from "@/components/RotatingPhotoGrid";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.clientesTitle,
    description: t.meta.clientesDescription,
    path: "/clientes",
    image: "/imagens/EW1_1393.jpg",
    keywords: ["clientes Líquen Events", "empresas de eventos Alentejo"],
    ogLocale: t.meta.ogLocale,
  });
}

const eyebrow =
  "text-foreground/68 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

// The mosaic draws a fresh 7 from this pool on every entry to the page (see
// RotatingPhotoGrid). Landscape event frames — corporate, weddings, galas.
const MOSAIC_POOL = [
  "/imagens/EW1_1408.jpg",
  "/imagens/DaniGui_Preview20.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/stephanie-mizio-558.jpg",
  "/imagens/M&F0512.jpg",
  "/imagens/428694133-339551105742981-427109035692944303-n.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/J&P-IMGL4769.jpg",
  "/imagens/EW1_1404.jpg",
  "/imagens/teresinhaeze-909.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/stephanie-mizio-555.jpg",
];

// The mosaic is a 2-col grid below `md` and a 12-col grid from `md` (768px) up,
// inside the max-w-7xl (1280px) container with lg:px-16 padding. So each cell's
// real rendered width is: on mobile 100vw when it spans both columns, else 50vw;
// from md a fraction of the ~1152px content width matching its column span. The
// old single value declared 100vw on mobile for EVERY cell — but four of them
// only fill one of the two mobile columns (50vw), so they were fetched at ~2×.
// Per-span sizes below; the fixed px is the capped column width past 1280px.
const MOSAIC_5 = "(max-width: 767px) 100vw, (max-width: 1279px) 42vw, 448px"; // md:col-span-5, wide on mobile
const MOSAIC_7 = "(max-width: 767px) 100vw, (max-width: 1279px) 58vw, 624px"; // md:col-span-7, wide on mobile
const MOSAIC_4 = "(max-width: 767px) 50vw, (max-width: 1279px) 33vw, 360px"; // md:col-span-4, one mobile column
const MOSAIC_3 = "(max-width: 767px) 50vw, (max-width: 1279px) 25vw, 272px"; // md:col-span-3, one mobile column
const MOSAIC_CELLS = [
  { cls: "col-span-2 md:col-span-5 md:row-span-2", sizes: MOSAIC_5 },
  { cls: "md:col-span-4 md:row-span-1", sizes: MOSAIC_4 },
  { cls: "md:col-span-3 md:row-span-1", sizes: MOSAIC_3 },
  { cls: "md:col-span-4 md:row-span-1", sizes: MOSAIC_4 },
  { cls: "md:col-span-3 md:row-span-1", sizes: MOSAIC_3 },
  { cls: "col-span-2 md:col-span-7 md:row-span-1", sizes: MOSAIC_7 },
  { cls: "col-span-2 md:col-span-5 md:row-span-1", sizes: MOSAIC_5 },
];

export default async function ClientesPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const testimonials = t.clientes.testimonials;
  const introImg = "/imagens/EW1_1404.jpg";
  const wordsImg = "/imagens/stephanie-mizio-555.jpg";
  const mosaicPool = MOSAIC_POOL.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }));
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.clientes, path: "/clientes" }]}
      />

      {/* ── HERO ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/EW1_1393.jpg"
            alt={t.common.imageAlt.clientesCorporate}
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/EW1_1393.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src="/imagens/EW1_1393.jpg" className="absolute inset-0 h-full w-full" />
        {/* Two hero veils merged into one layer (former upper div listed first,
            since multiple backgrounds paint first-listed on top). Same pixels,
            one paint/composite pass. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to right, rgba(0,0,0,0.3), transparent), linear-gradient(to top, rgba(8,8,8,0.92), rgba(8,8,8,0.25), transparent)",
          }}
        />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.clientes.heroEyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-[0.16em] text-[18px] sm:text-[21px] leading-snug">
                {`${t.clientes.heroTitleLine1} ${t.clientes.heroTitleMoss}`}
              </h1>
              <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                {t.clientes.heroLead}
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <ClientMarquee />

      {/* ── LEAD STATEMENT ── */}
      <section className="relative py-28 lg:py-36 overflow-hidden border-b border-foreground/8">
        <Image
          src={introImg}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor(introImg)}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgb(8,8,8), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42))",
          }}
        />
        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid lg:grid-cols-[1fr_auto] gap-16 lg:gap-24 items-end">
            <AnimateIn>
              <p
                className="text-white/90 leading-[1.72]"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(22px, 2.8vw, 36px)",
                  textShadow: "0 1px 24px rgba(8,8,8,0.6)",
                }}
              >
                {t.clientes.leadPre}
                <span className="text-moss-light">{t.clientes.leadMoss}</span>
                {t.clientes.leadPost}
              </p>
            </AnimateIn>
            <AnimateIn delay={100} className="hidden lg:block">
              <div className="flex flex-col items-end gap-1.5 text-right min-w-[120px]">
                <span
                  aria-hidden="true"
                  className="text-cream/55 text-[9px] tracking-[0.45em] uppercase block"
                >
                  {t.clientes.desde}
                </span>
                <span
                  aria-hidden="true"
                  className="text-cream/45 font-bold leading-none"
                  style={{ fontFamily: "var(--font-playfair)", fontSize: "72px" }}
                >
                  {/* The founding year climbs to 2018 on scroll-in. Counting from
                      2000 keeps every intermediate frame a plausible year (only the
                      last two digits move) — a quiet heritage flourish. Decorative
                      (aria-hidden) and SSR/reduced-motion safe: shows 2018 at rest. */}
                  <CountUp from={2000} to={Number(SITE.founded)} duration={1400} />
                </span>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── CLIENT LOGOS ── */}
      <section className="py-24 lg:py-32 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
            <AnimateIn>
              <p className={`${eyebrow} mb-4`}>
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {t.clientes.logosEyebrow}
              </p>
              <h2
                className="text-foreground font-bold leading-[1.05]"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 3.4vw, 44px)" }}
              >
                {t.clientes.logosTitle}
              </h2>
            </AnimateIn>
            <AnimateIn delay={80} className="hidden lg:block">
              <span
                aria-hidden="true"
                className="text-foreground/45 text-[9px] tracking-[0.4em] uppercase"
              >
                {clientLogos.length} {t.clientes.clientesCount}
              </span>
            </AnimateIn>
          </div>
          <AnimateIn delay={120}>
            <ClientLogoGrid clients={clientLogos} />
          </AnimateIn>
        </div>
      </section>

      {/* ── TESTIMONIALS GRID ── */}
      <section className="relative py-24 lg:py-28 overflow-hidden border-b border-foreground/8">
        <Image
          src={wordsImg}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor(wordsImg)}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgb(8,8,8), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42))",
          }}
        />
        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-14">
            <h2
              className="text-white font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 3.4vw, 44px)" }}
            >
              {t.clientes.gridTitle}
            </h2>
          </AnimateIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-white/10">
            {testimonials.map((item, i) => (
              <AnimateIn key={item.name} delay={i * 55} className="h-full">
                <figure className="h-full flex flex-col p-8 lg:p-10 bg-[#0c0e0b]/55 backdrop-blur-sm hover:bg-[#0c0e0b]/70 transition-colors duration-500">
                  <span
                    className="text-moss-light/25 text-5xl leading-none mb-5 select-none"
                    style={{ fontFamily: "var(--font-playfair)" }}
                    aria-hidden
                  >
                    &ldquo;
                  </span>
                  <blockquote
                    className="text-cream/85 leading-[1.72] flex-1"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(16px, 1.7vw, 19px)",
                    }}
                  >
                    {item.text}
                  </blockquote>
                  <figcaption className="mt-8 pt-6 border-t border-white/12 flex items-center gap-4">
                    <div className="w-6 h-px bg-gold flex-shrink-0" />
                    <div>
                      <p className="text-white text-sm font-semibold">{item.name}</p>
                      <p className="text-moss-light text-[10px] mt-0.5 tracking-[0.18em] uppercase">
                        {item.event}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHOTO MOSAIC ── */}
      <section className="py-20 lg:py-28 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-10">
            <p className={eyebrow}>
              <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
              {t.clientes.mosaicEyebrow}
            </p>
          </AnimateIn>
          <RotatingPhotoGrid
            cells={MOSAIC_CELLS}
            pool={mosaicPool}
            alt={t.common.imageAlt.clientesCorporate}
            className="grid grid-cols-2 md:grid-cols-12 gap-2 auto-rows-[150px] md:auto-rows-auto md:grid-rows-[210px_210px_230px]"
            imgClassName="transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
          />
        </div>
      </section>

      {/* ── CTA with background photo ── */}
      <section className="relative py-36 lg:py-52 overflow-hidden">
        <Image
          src="/imagens/DJI_20250913190635_0120_D.jpg"
          alt={t.common.imageAlt.clientesAerial}
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/DJI_20250913190635_0120_D.jpg")}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(8,8,8,0.9), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.48))",
          }}
        />

        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.clientes.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
          </AnimateIn>
          <h2
            className="text-white font-bold leading-[0.88] tracking-tight mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(50px, 9vw, 128px)" }}
          >
            {/* Closing headline resolves word-by-word (the hero/logo-wall
                signature) — matching the home & sobre CTAs so the site's big
                finish reads the same everywhere. Reduced motion: words appear. */}
            <TitleReveal text={t.clientes.ctaTitleLine1} as="span" className="block" />
            <TitleReveal text={t.clientes.ctaTitleLine2} as="span" className="block" delay={220} />
          </h2>
          <AnimateIn delay={110}>
            <p className="text-white/70 text-base leading-relaxed max-w-sm mb-14">
              {t.clientes.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap items-center gap-4">
              <Magnetic strength={0.4}>
                <TrackedLink
                  href={localizeHref("/orcamento", locale)}
                  trackProps={{ source: "clientes" }}
                  className={PRIMARY_BUTTON_DARK_CLASS}
                >
                  {t.common.pedirOrcamento} →
                </TrackedLink>
              </Magnetic>
              <Link href={localizeHref("/contacto", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.falarConnosco}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
