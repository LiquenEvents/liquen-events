import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Magnetic from "@/components/motion/Magnetic";
import Parallax from "@/components/Parallax";
import KineticHeading from "@/components/KineticHeading";
import RatingBadge from "@/components/RatingBadge";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import ClientLogoGrid from "@/components/ClientLogoGrid";
import ClientMarquee from "@/components/ClientMarquee";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { clientLogos } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS, PRIMARY_BUTTON_DARK_CLASS } from "@/lib/ui-classes";

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

const mosaicItems = [
  {
    src: "/imagens/EW1_1408.jpg",
    alt: "Receção de evento corporativo num pátio em Évora",
    label: "Corporativo",
    cls: "col-span-5 row-span-2",
  },
  {
    src: "/imagens/DaniGui_Preview20.jpg",
    alt: "Casamento com decoração floral numa herdade do Alentejo",
    label: "Casamento",
    cls: "col-span-4 row-span-1",
  },
  {
    src: "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
    alt: "Jantar de gala à luz de velas num evento no Alentejo",
    label: "Gala",
    cls: "col-span-3 row-span-1",
  },
  {
    src: "/imagens/stephanie-mizio-558.jpg",
    alt: "Casamento ao ar livre com mesa posta e arranjos florais no Alentejo",
    label: "Casamento",
    cls: "col-span-4 row-span-1",
  },
  {
    src: "/imagens/M&F0512.jpg",
    alt: "Jantar de gala com mesa posta e velas",
    label: "Jantar",
    cls: "col-span-3 row-span-1",
  },
  {
    src: "/imagens/428694133-339551105742981-427109035692944303-n.jpg",
    alt: "Gala corporativa num salão decorado à noite",
    label: "Gala",
    cls: "col-span-7 row-span-1",
  },
  {
    src: "/imagens/hd-edited.jpg",
    alt: "Evento institucional com palco e plateia",
    label: "Institucional",
    cls: "col-span-5 row-span-1",
  },
];

export default async function ClientesPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const testimonials = t.clientes.testimonials;
  const introImg = "/imagens/EW1_1404.jpg";
  const wordsImg = "/imagens/stephanie-mizio-555.jpg";
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.clientes, path: "/clientes" }]}
      />

      {/* ── HERO ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
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
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-20 lg:pb-28 pt-40">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center gap-3 mb-10">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {t.clientes.heroEyebrow}
            </p>
          </AnimateIn>
          <KineticHeading
            className="text-white font-bold leading-[0.88] tracking-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "var(--hero-display)" }}
            lines={[
              [{ text: t.clientes.heroTitleLine1 }],
              [{ text: t.clientes.heroTitleMoss, moss: true }],
            ]}
          />
          <AnimateIn delay={180}>
            <div className="mt-10 border-l-2 border-moss/50 pl-6 max-w-md">
              <p className="text-white/60 text-base leading-[1.8]">{t.clientes.heroLead}</p>
            </div>
          </AnimateIn>
          <AnimateIn delay={260}>
            <div className="mt-8">
              <RatingBadge
                label={t.common.reviewsLabel}
                ptFormat={locale === "pt"}
                starClassName="text-gold"
                textClassName="text-white/75"
              />
            </div>
          </AnimateIn>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 pointer-events-none">
          <span className="text-white/60 text-[8px] tracking-[0.45em] uppercase">
            {t.clientes.scroll}
          </span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" />
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
        <div className="absolute inset-0 bg-black/72" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/85 via-[#080808]/35 to-[#080808]/55" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
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
                  {SITE.founded}
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
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 3.8vw, 50px)" }}
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

      {/* ── FEATURED TESTIMONIAL (editorial split) ── */}
      <section className="bg-surface border-b border-foreground/8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_45%] min-h-[600px]">
            {/* Quote side */}
            <AnimateIn className="flex flex-col justify-center px-6 lg:px-16 py-20 lg:py-28">
              <p className={`${eyebrow} mb-12`}>
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {t.clientes.featuredEyebrow}
              </p>
              <span
                className="text-moss/15 leading-[0.75] select-none block -mb-2"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(80px, 12vw, 160px)" }}
                aria-hidden
              >
                &ldquo;
              </span>
              <blockquote
                className="text-foreground/75 leading-[1.65] mt-4"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.2vw, 27px)" }}
              >
                {t.clientes.featuredQuote}
              </blockquote>
              <div className="mt-10 pt-7 border-t border-foreground/10 flex items-center gap-5">
                <div className="w-8 h-px bg-gold flex-shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-semibold tracking-wide">
                    {t.clientes.featuredName}
                  </p>
                  <p className="text-moss text-[10px] mt-1 tracking-[0.2em] uppercase">
                    {t.clientes.featuredRole}
                  </p>
                </div>
              </div>
            </AnimateIn>

            {/* Photo side */}
            <div className="relative min-h-[380px] lg:min-h-0">
              <Image
                src="/imagens/428708341-339551125742979-6565889301500133407-n.jpg"
                alt={t.common.imageAlt.clientesDinner}
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover object-center"
                {...blurFor("/imagens/428708341-339551125742979-6565889301500133407-n.jpg")}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/15 to-transparent lg:block hidden" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/30 to-transparent lg:hidden" />
            </div>
          </div>
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
        <div className="absolute inset-0 bg-black/72" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080808]/70 via-transparent to-[#080808]/70" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-14">
            <h2
              className="text-white font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 3.2vw, 42px)" }}
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
          <Reveal
            as="div"
            variant="mask"
            stagger
            className="grid grid-cols-12 gap-2 grid-rows-[210px_210px_230px]"
          >
            {mosaicItems.map((item, i) => (
              <div key={i} className={`${item.cls} relative overflow-hidden group`}>
                <Image
                  src={item.src}
                  alt={t.clientes.galleryAlt[i] ?? item.alt}
                  fill
                  sizes="(max-width: 768px) 100vw, 40vw"
                  className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                  {...blurFor(item.src)}
                />
                <div className="absolute inset-0 bg-black/25 group-hover:bg-black/5 transition-colors duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                <span className="absolute bottom-4 left-4 text-white/0 group-hover:text-white/65 group-focus-within:text-white/65 transition-all duration-500 text-[9px] tracking-[0.42em] uppercase font-medium">
                  {t.clientes.mosaicLabels[i] ?? item.label}
                </span>
              </div>
            ))}
          </Reveal>
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
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/85 via-transparent to-[#080808]/45" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.clientes.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
            <h2
              className="text-white font-bold leading-[0.88] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(50px, 9vw, 128px)" }}
            >
              {t.clientes.ctaTitleLine1}
              <br />
              {t.clientes.ctaTitleLine2}
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/60 text-base leading-relaxed max-w-sm mb-14">
              {t.clientes.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap items-center gap-4">
              <Magnetic strength={0.4}>
                <Link
                  href={localizeHref("/orcamento", locale)}
                  className={PRIMARY_BUTTON_DARK_CLASS}
                >
                  {t.common.pedirOrcamento} →
                </Link>
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
