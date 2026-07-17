import type { Metadata } from "next";
import { Fragment } from "react";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Magnetic from "@/components/motion/Magnetic";
import Parallax from "@/components/Parallax";
import KineticHeading from "@/components/KineticHeading";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import { getDictionary, normalizeLocale, localizeHref, type Locale } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";
import Eyebrow from "@/components/Eyebrow";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.servicosTitle,
    description: t.meta.servicosDescription,
    path: "/servicos",
    image: "/imagens/EW1_1330.jpg",
    keywords: [
      "decoração de casamentos Alentejo",
      "coordenação de casamentos Alentejo",
      "eventos corporativos Lisboa",
      "decoração de eventos Alentejo",
    ],
    ogLocale: t.meta.ogLocale,
  });
}

const eyebrowLight =
  "text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center gap-3";

/* ── Mosaico editorial para categorias ── */
type ServiceCard = {
  title: string;
  slug: string;
  desc: string;
  image: string;
};

type Category = {
  id: string;
  num: string;
  label: string;
  subtitle: string;
  desc: string;
  layout: "mosaic-right" | "mosaic-left" | "duo";
  band: string;
  services: ServiceCard[];
};

// Locale-independent metadata (ids, images, slugs, layout). Display text comes
// from the dictionary (t.servicos.categories) and is merged in at render time.
const categoryMeta = [
  {
    id: "celebracoes",
    num: "01",
    layout: "mosaic-left" as const,
    band: "/imagens/teresinhaeze-909.jpg",
    services: [
      { slug: "casamentos", image: "/imagens/stephanie-mizio-760.jpg" },
      { slug: "batizados-e-comunhoes", image: "/imagens/DaniGui_JantarFesta_26.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg" },
      { slug: "jantares-de-gala", image: "/imagens/J&P-IMGL4767.jpg" },
    ],
  },
  {
    id: "empresas",
    num: "02",
    layout: "mosaic-right" as const,
    band: "/imagens/EW1_1333.jpg",
    services: [
      { slug: "conferencias-e-congressos", image: "/imagens/EW1_1332.jpg" },
      { slug: "teambuilding", image: "/imagens/EW1_1398.jpg" },
      { slug: "lancamentos-de-produto", image: "/imagens/EW1_1428.jpg" },
      { slug: "jantares-de-empresa", image: "/imagens/EW1_1404.jpg" },
    ],
  },
];

// Full-bleed editorial photo grid (mirrors the Sobre page rhythm).
const editorial = [
  {
    src: "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
    cls: "col-span-2 row-span-2",
    alt: "Casamento ao ar livre organizado pela Líquen Events no Alentejo",
  },
  {
    src: "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
    cls: "col-span-2",
    alt: "Jantar de celebração com decoração elegante à luz de velas",
  },
  {
    src: "/imagens/DJI_20250913190635_0120_D.jpg",
    cls: "col-span-1",
    alt: "Vista aérea de um evento numa herdade do Alentejo",
  },
  {
    src: "/imagens/20_10_2025_0407.jpg",
    cls: "col-span-1",
    alt: "Receção de evento ao final da tarde no Alentejo",
  },
  {
    src: "/imagens/stephanie-mizio-555.jpg",
    cls: "col-span-2",
    alt: "Receção de casamento ao ar livre ao pôr do sol no Alentejo",
  },
  {
    src: "/imagens/DaniGui_Adois_61.jpg",
    cls: "col-span-2",
    alt: "Retrato dos noivos durante um casamento no Alentejo",
  },
];

/* ── Full-screen service band — one image, one service (SpaceX-style) ── */
function ServiceBand({
  service,
  index,
  catNum,
  cta,
  locale,
}: {
  service: ServiceCard;
  index: number;
  catNum: string;
  cta: string;
  locale: Locale;
}) {
  return (
    // Shorter on phones (≈46svh) so 8 stacked service bands don't become an
    // endless scroll; full cinematic height from lg up.
    <section className="relative overflow-hidden flex items-end min-h-[46svh] lg:min-h-[clamp(480px,60vh,680px)]">
      <Parallax speed={0.12} className="absolute inset-0">
        <Image
          src={service.image}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor(service.image)}
        />
      </Parallax>
      <div className="absolute inset-0 bg-black/55" />
      <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/20 to-[#080808]/40" />
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-16 lg:pb-24">
        <AnimateIn>
          <p className="text-white/50 font-mono text-[11px] tracking-[0.4em] mb-5">
            {catNum}.{String(index + 1).padStart(2, "0")}
          </p>
          <h3
            className="text-white font-bold leading-[0.95] tracking-tight max-w-3xl"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 6.5vw, 96px)" }}
          >
            {service.title}
          </h3>
          <div className="mt-7 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
            <p className="text-white/85 text-[15px] leading-[1.7] max-w-md">{service.desc}</p>
            <Link
              href={localizeHref(`/servicos/${service.slug}`, locale)}
              className={`${OUTLINE_LIGHT_BUTTON_CLASS} flex-shrink-0`}
            >
              {cta}
              <span aria-hidden>→</span>
            </Link>
          </div>
        </AnimateIn>
      </div>
    </section>
  );
}

export default async function ServicosPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const ts = t.servicos;
  const categories: Category[] = categoryMeta.map((m, ci) => {
    const ct = ts.categories[ci];
    return {
      id: m.id,
      num: m.num,
      layout: m.layout,
      band: m.band,
      label: ct.label,
      subtitle: ct.subtitle,
      desc: ct.desc,
      services: m.services.map((s, si) => ({
        slug: s.slug,
        image: s.image,
        title: ct.services[si].title,
        desc: ct.services[si].desc,
      })),
    };
  });
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.servicos, path: "/servicos" }]}
      />
      <ServiceJsonLd
        locale={locale}
        name={t.jsonld.servicosServiceName}
        description={t.jsonld.servicosServiceDescription}
        path="/servicos"
      />

      {/* ── HERO — full-bleed immersive ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/EW1_1330.jpg"
            alt={t.common.imageAlt.servicosEndOfDay}
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/EW1_1330.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src="/imagens/EW1_1330.jpg" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/40 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20 pt-40">
          <AnimateIn>
            <p className={`${eyebrowLight} mb-8`}>
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {ts.heroEyebrow}
            </p>
          </AnimateIn>
          <KineticHeading
            className="text-white font-bold leading-[0.9] tracking-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "var(--hero-section)" }}
            lines={[
              [{ text: ts.heroTitle[0] }],
              [{ text: ts.heroTitle[1] }, { text: ts.heroTitle[2], moss: true }],
            ]}
          />
          <AnimateIn delay={150}>
            <div className="mt-10">
              <Link
                href={localizeHref("/orcamento", locale)}
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                {t.common.pedirOrcamento}
                <span aria-hidden>→</span>
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Assinatura / filosofia — painel cinemático, minimal ──
          O bloco mais denso de texto passou a uma afirmação única sobre imagem
          full-bleed: título + as três competências reduzidas a rótulos (sem
          descrições). Menos leitura, mais presença. */}
      <section
        className="relative overflow-hidden"
        style={{ minHeight: "clamp(560px, 90vh, 900px)" }}
      >
        <Parallax speed={0.12} className="absolute inset-0">
          <Image
            src="/imagens/20_10_2025_0358.jpg"
            alt={t.common.imageAlt.servicosEvening}
            fill
            sizes="100vw"
            className="object-cover object-center"
            {...blurFor("/imagens/20_10_2025_0358.jpg")}
          />
        </Parallax>
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/20 to-[#080808]/70" />
        <div className="relative z-10 flex items-center" style={{ minHeight: "inherit" }}>
          <div className="max-w-5xl mx-auto w-full px-6 lg:px-16 py-24 lg:py-32 text-center">
            <AnimateIn>
              <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase inline-flex items-center justify-center gap-4 mb-9">
                <span className="w-8 h-px bg-gold" />
                {ts.philoEyebrow}
                <span className="w-8 h-px bg-gold" />
              </p>
              <h2
                className="text-white font-bold leading-[1.06] tracking-tight mx-auto max-w-4xl"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 5vw, 68px)" }}
              >
                {ts.philoTitle}
              </h2>
            </AnimateIn>
            <div className="mt-16 lg:mt-20 grid grid-cols-1 sm:grid-cols-3 gap-y-12 gap-x-8 max-w-3xl mx-auto">
              {ts.philoPillars.map((p, i) => (
                <AnimateIn key={p.title} delay={i * 90}>
                  <div className="flex flex-col items-center gap-4">
                    <span className="text-gold-text/90 font-mono text-[11px] tracking-[0.4em]">
                      0{i + 1}
                    </span>
                    <span aria-hidden className="w-8 h-px bg-white/25" />
                    <h3
                      className="text-cream font-bold text-lg lg:text-2xl tracking-wide"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {p.title}
                    </h3>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── Service categories ── */}
      {categories.map((cat, ci) => (
        <Fragment key={cat.id}>
          <div>
            {/* Category intro — full-screen cinematic panel (SpaceX-style):
              one image, one message. The light editorial header was dropped so
              the page reads as a sequence of immersive full-bleed panels. */}
            <section
              id={cat.id}
              className="relative overflow-hidden scroll-mt-[60px] flex items-end"
              style={{ minHeight: "clamp(560px, 92vh, 960px)" }}
            >
              <Parallax speed={0.12} className="absolute inset-0">
                <Image
                  src={cat.band}
                  alt=""
                  fill
                  sizes="100vw"
                  className="object-cover object-center"
                  {...blurFor(cat.band)}
                />
              </Parallax>
              <div className="absolute inset-0 bg-black/60" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/25 to-[#080808]/50" />
              <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-16 lg:pb-24">
                <AnimateIn>
                  <p className="text-white/50 font-mono text-[11px] tracking-[0.4em] mb-5">
                    {cat.num}
                  </p>
                  <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase mb-4 flex items-center gap-3">
                    <span className="w-8 h-px bg-gold flex-shrink-0" />
                    {cat.subtitle}
                  </p>
                  <h2
                    className="text-white font-bold leading-[0.92] tracking-tight"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(42px, 8vw, 120px)",
                    }}
                  >
                    {cat.label}
                  </h2>
                  <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-10">
                    <p className="text-white/85 text-[15px] leading-[1.7] max-w-sm">{cat.desc}</p>
                    <Link
                      href={localizeHref(
                        `/servicos/${cat.id === "empresas" ? "eventos-corporativos" : cat.services[0].slug}`,
                        locale,
                      )}
                      className={`${OUTLINE_LIGHT_BUTTON_CLASS} flex-shrink-0`}
                    >
                      {ts.verDetalhes}
                      <span aria-hidden>→</span>
                    </Link>
                  </div>
                </AnimateIn>
              </div>
            </section>

            {/* Service bands — one full-screen panel per service */}
            {cat.services.map((s, i) => (
              <ServiceBand
                key={`${cat.id}-${i}`}
                service={s}
                index={i}
                catNum={cat.num}
                cta={ts.verMais}
                locale={locale}
              />
            ))}
          </div>

          {/* Light interlude between the two categories — one calm, airy beat so
              the run of dark full-bleed panels doesn't flatten into a tunnel
              (and it quietly carries a proof line). */}
          {ci === 0 && (
            <section className="bg-surface py-24 lg:py-36 border-y border-foreground/8">
              <div className="max-w-4xl mx-auto px-6 lg:px-16 text-center">
                <AnimateIn>
                  <Eyebrow center className="mb-8">
                    {ts.interludeEyebrow}
                  </Eyebrow>
                  <p
                    className="text-foreground font-bold leading-[1.12] mx-auto max-w-3xl"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(28px, 4.2vw, 54px)",
                    }}
                  >
                    {ts.interludeTitle}
                  </p>
                </AnimateIn>
              </div>
            </section>
          )}
        </Fragment>
      ))}

      {/* ── Editorial photo grid (full-bleed) ── */}
      <section className="bg-surface border-t border-foreground/8">
        <Reveal
          as="div"
          variant="mask"
          stagger
          className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1.5 auto-rows-[150px] sm:auto-rows-[220px] lg:auto-rows-[270px]"
        >
          {editorial.map((g, i) => {
            // Match the real rendered width so wide feature tiles aren't served a
            // 25vw candidate and upscaled: grid is 2-col below lg, 4-col at lg+,
            // so a col-span-2 tile is 100vw (mobile) / 50vw (desktop).
            const wide = g.cls.includes("col-span-2");
            return (
              <div key={i} className={`relative overflow-hidden group ${g.cls}`}>
                <Image
                  src={g.src}
                  alt={t.servicos.galleryAlt[i] ?? g.alt}
                  fill
                  sizes={
                    wide ? "(max-width: 1024px) 100vw, 50vw" : "(max-width: 1024px) 50vw, 25vw"
                  }
                  className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                  {...blurFor(g.src)}
                />
                <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
              </div>
            );
          })}
        </Reveal>
      </section>

      {/* ── Cinematic statement (where we work) — full-screen, matches panels ── */}
      <section
        className="relative overflow-hidden border-t border-foreground/8"
        style={{ minHeight: "clamp(560px, 90vh, 900px)" }}
      >
        <Image
          src="/imagens/J&A-68.jpg"
          alt={t.common.imageAlt.servicosCeremony}
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/J&A-68.jpg")}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]/50" />
        <div className="relative z-10 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 w-full py-20 lg:py-28">
            <AnimateIn>
              <p className={`${eyebrowLight} mb-7`}>
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {ts.seoEyebrow}
              </p>
              <h2
                className="text-cream font-bold leading-[1.04] mb-7 max-w-3xl"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 5vw, 76px)" }}
              >
                {ts.seoTitle}
              </h2>
              <p className="text-cream/75 text-base lg:text-lg leading-[1.85] max-w-xl">
                {ts.seoText}
              </p>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── CTA — full-screen closing panel ── */}
      <section
        className="relative overflow-hidden border-t border-foreground/8 flex items-center py-28 lg:py-40"
        style={{ minHeight: "clamp(560px, 90vh, 900px)" }}
      >
        <Image
          src="/imagens/M&F0497.jpg"
          alt={t.common.imageAlt.servicosEvening}
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/M&F0497.jpg")}
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {ts.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
            <h2
              className="text-white font-bold leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 8vw, 110px)" }}
            >
              {ts.ctaTitleLine1}
              <br />
              <span className="text-moss">{ts.ctaTitleMoss}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/75 text-base leading-relaxed max-w-md mb-12">{ts.ctaText}</p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <Magnetic strength={0.4}>
                <Link
                  href={localizeHref("/orcamento", locale)}
                  className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-white hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-[11px] tracking-[0.28em] uppercase shadow-xl shadow-black/30"
                >
                  {t.common.pedirOrcamento} →
                </Link>
              </Magnetic>
              <Link href={localizeHref("/galeria", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {ts.ctaGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
