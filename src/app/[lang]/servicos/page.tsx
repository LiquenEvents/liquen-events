import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Magnetic from "@/components/motion/Magnetic";
import Parallax from "@/components/Parallax";
import KineticHeading from "@/components/KineticHeading";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import TiltCard from "@/components/motion/TiltCard";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import { getDictionary, normalizeLocale, localizeHref, type Locale } from "@/lib/i18n";

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
      "wedding planner Alentejo",
      "eventos corporativos Lisboa",
      "conferências e congressos",
      "organização de festas Alentejo",
    ],
    ogLocale: t.meta.ogLocale,
  });
}

const navMeta = [{ id: "empresas" }, { id: "celebracoes" }];

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
    id: "empresas",
    num: "01",
    layout: "mosaic-right" as const,
    band: "/imagens/EW1_1333.jpg",
    services: [
      // Conferências — sala ampla montada (banquete/plenário)
      { slug: "eventos-corporativos", image: "/imagens/EW1_1332.jpg" },
      // Teambuilding — receção no pátio ao final do dia
      { slug: "eventos-corporativos", image: "/imagens/EW1_1398.jpg" },
      // Lançamentos — cenografia e sala montada
      { slug: "eventos-corporativos", image: "/imagens/EW1_1428.jpg" },
      // Jantares de empresa — mesa posta premium
      { slug: "eventos-corporativos", image: "/imagens/EW1_1404.jpg" },
    ],
  },
  {
    id: "celebracoes",
    num: "02",
    layout: "mosaic-left" as const,
    band: "/imagens/teresinhaeze-909.jpg",
    services: [
      { slug: "casamentos", image: "/imagens/stephanie-mizio-760.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/DaniGui_JantarFesta_26.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg" },
      { slug: "jantares-de-gala", image: "/imagens/J&P-IMGL4767.jpg" },
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

/* ── Service card ── */
function ServiceCard({
  service,
  index,
  catNum,
  cta,
  locale,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  service: ServiceCard;
  index: number;
  catNum: string;
  cta: string;
  locale: Locale;
  sizes?: string;
}) {
  return (
    <TiltCard fill className="h-full w-full">
      <Link
        href={localizeHref(`/servicos/${service.slug}`, locale)}
        className="group relative block overflow-hidden bg-surface-raised h-full w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
      >
        <Image
          src={service.image}
          {...blurFor(service.image)}
          alt={service.title}
          fill
          sizes={sizes}
          className="object-cover transition-transform duration-700 group-hover:scale-105"
        />
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
        {/* Hover darkening */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-500" />

        {/* Index label top-right */}
        <div className="absolute top-4 right-4">
          <span className="text-cream/15 text-[9px] tracking-[0.3em] font-mono">
            {catNum}.{String(index + 1).padStart(2, "0")}
          </span>
        </div>

        {/* Persistent clickability affordance (desktop) */}
        <div className="hidden md:flex absolute bottom-6 right-6 lg:bottom-7 lg:right-7 w-10 h-10 rounded-full border border-cream/20 items-center justify-center text-cream/70 group-hover:bg-moss group-hover:border-moss group-hover:text-cream transition-all duration-500">
          <span className="text-sm leading-none transition-transform duration-500 group-hover:translate-x-0.5 group-hover:-translate-y-0.5">
            ↗
          </span>
        </div>

        {/* Bottom content */}
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-7">
          <p className="text-moss/60 text-[9px] tracking-[0.5em] font-mono uppercase mb-2">
            {String(index + 1).padStart(2, "0")}
          </p>
          <h3
            className="text-cream font-bold leading-tight mb-2"
            style={{
              fontFamily: "var(--font-playfair)",
              fontSize: "clamp(15px, 1.6vw, 22px)",
            }}
          >
            {service.title}
          </h3>
          {/* Mobile: always show desc; desktop: reveal on hover */}
          <p className="text-cream/40 text-xs leading-relaxed md:opacity-0 md:max-h-0 md:group-hover:opacity-100 md:group-hover:max-h-[80px] overflow-hidden transition-all duration-500 ease-out">
            {service.desc}
          </p>
          {/* Mobile: persistent CTA; desktop: reveal on hover */}
          <span className="md:hidden inline-flex items-center text-moss text-[10px] tracking-[0.3em] uppercase mt-2.5">
            {cta} →
          </span>
          <span className="hidden md:inline text-moss text-[10px] tracking-[0.35em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-400 delay-150">
            {cta} →
          </span>
        </div>
      </Link>
    </TiltCard>
  );
}

/* ── Mosaic grid — 4 services ── */
function MosaicGrid({ cat, cta, locale }: { cat: Category; cta: string; locale: Locale }) {
  const [s0, s1, s2, s3] = cat.services;
  const isRight = cat.layout === "mosaic-right";

  return (
    <div
      className="grid gap-1.5"
      style={{
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "clamp(240px,30vw,440px) clamp(240px,30vw,440px)",
      }}
    >
      {isRight ? (
        <>
          {/* Wide top-left */}
          <div className="col-span-2 row-span-1">
            <ServiceCard
              service={s0}
              index={0}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 65vw"
            />
          </div>
          {/* Tall right */}
          <div className="col-span-1 row-span-2">
            <ServiceCard
              service={s1}
              index={1}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 35vw"
            />
          </div>
          {/* Bottom left small */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s2}
              index={2}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
          {/* Bottom mid */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s3}
              index={3}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
        </>
      ) : (
        <>
          {/* Tall left */}
          <div className="col-span-1 row-span-2">
            <ServiceCard
              service={s0}
              index={0}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 35vw"
            />
          </div>
          {/* Wide top-right */}
          <div className="col-span-2 row-span-1">
            <ServiceCard
              service={s1}
              index={1}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 65vw"
            />
          </div>
          {/* Bottom mid */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s2}
              index={2}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
          {/* Bottom right */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s3}
              index={3}
              catNum={cat.num}
              cta={cta}
              locale={locale}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Mobile card list ── */
function MobileCardStack({ cat, cta, locale }: { cat: Category; cta: string; locale: Locale }) {
  return (
    <div className="grid grid-cols-2 gap-1.5" style={{ gridAutoRows: "clamp(210px, 50vw, 340px)" }}>
      {cat.services.map((s, i) => (
        <ServiceCard
          key={s.title}
          service={s}
          index={i}
          catNum={cat.num}
          cta={cta}
          locale={locale}
          sizes="50vw"
        />
      ))}
    </div>
  );
}

export default async function ServicosPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const ts = t.servicos;
  const navItems = navMeta.map((m, i) => ({ ...m, label: ts.nav[i] }));
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
        name="Organização de eventos, casamentos e eventos corporativos"
        description="Organização de casamentos, eventos corporativos, conferências e celebrações. Com base em Évora, no Alentejo, para todo o Portugal — da decoração à coordenação."
        path="/servicos"
      />

      {/* ── HERO — full-bleed immersive ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/EW1_1330.jpg"
            alt="Evento organizado pela Líquen Events ao final do dia"
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
            <div className="mt-9 flex flex-col sm:flex-row sm:items-end gap-7 sm:gap-12">
              <p className="text-white/60 text-[15px] leading-[1.8] max-w-sm">{ts.heroLead}</p>
              <Link
                href={localizeHref("/orcamento", locale)}
                className="inline-flex items-center gap-3 text-sm text-white/70 hover:text-white transition-colors duration-300 group flex-shrink-0"
              >
                <span className="w-8 h-px bg-white/30 flex-shrink-0 group-hover:w-14 transition-all duration-500" />
                {t.common.pedirOrcamento}
              </Link>
            </div>
          </AnimateIn>

          {/* Category quick-nav */}
          <AnimateIn delay={230}>
            <div className="mt-12 pt-6 border-t border-white/12 flex items-center gap-6 sm:gap-12">
              {navItems.map((cat, i) => (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="text-white/65 text-[10px] tracking-[0.42em] uppercase hover:text-moss-light transition-colors duration-300"
                >
                  <span className="text-moss-light/60 mr-2 font-mono">0{i + 1}</span>
                  {cat.label}
                </a>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Service categories ── */}
      {categories.map((cat) => (
        <div key={cat.id}>
          {/* Cinematic category band */}
          <section
            id={cat.id}
            className="relative overflow-hidden border-t border-foreground/8 scroll-mt-[60px]"
            style={{ minHeight: "clamp(440px, 76vh, 840px)" }}
          >
            <Image
              src={cat.band}
              alt={cat.label}
              fill
              sizes="100vw"
              className="object-cover object-center"
              {...blurFor(cat.band)}
            />
            <div className="absolute inset-0 bg-black/55" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/15 to-[#080808]/45" />

            <div className="relative z-10 h-full flex items-end">
              <div className="max-w-7xl mx-auto w-full px-6 lg:px-16 py-16 lg:py-24">
                <AnimateIn>
                  <span
                    className="block text-white/12 font-bold leading-none mb-6 select-none"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(64px, 9vw, 150px)",
                    }}
                    aria-hidden
                  >
                    {cat.num}
                  </span>
                  <p className={`${eyebrowLight} mb-5`}>
                    <span className="w-6 h-px bg-gold flex-shrink-0" />
                    {cat.subtitle}
                  </p>
                  <h2
                    className="text-white font-bold leading-[0.95] mb-6"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(44px, 6vw, 92px)",
                    }}
                  >
                    {cat.label}
                  </h2>
                  <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6">
                    <p className="text-white/60 text-base leading-[1.8] max-w-md">{cat.desc}</p>
                    <Link
                      href={localizeHref(`/servicos/${cat.services[0].slug}`, locale)}
                      className="group inline-flex items-center gap-3 text-xs text-white/65 hover:text-white transition-colors duration-300 tracking-[0.3em] uppercase flex-shrink-0"
                    >
                      <span>{ts.verDetalhes}</span>
                      <span className="w-7 h-px bg-white/30 group-hover:w-12 transition-all duration-500" />
                    </Link>
                  </div>
                </AnimateIn>
              </div>
            </div>
          </section>

          {/* Service mosaic — full-bleed, image-forward */}
          <section className="bg-surface">
            <AnimateIn from="fade">
              <div className="hidden lg:block p-1.5">
                <MosaicGrid cat={cat} cta={ts.verMais} locale={locale} />
              </div>
              <div className="lg:hidden p-1.5">
                <MobileCardStack cat={cat} cta={ts.verMais} locale={locale} />
              </div>
            </AnimateIn>
          </section>
        </div>
      ))}

      {/* ── Editorial photo grid (full-bleed) ── */}
      <section className="bg-surface border-t border-foreground/8">
        <Reveal
          as="div"
          variant="mask"
          stagger
          className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1.5 auto-rows-[150px] sm:auto-rows-[220px] lg:auto-rows-[270px]"
        >
          {editorial.map((g, i) => (
            <div key={i} className={`relative overflow-hidden group ${g.cls}`}>
              <Image
                src={g.src}
                alt={g.alt}
                fill
                sizes="(max-width: 768px) 50vw, 25vw"
                className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                {...blurFor(g.src)}
              />
              <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
            </div>
          ))}
        </Reveal>
      </section>

      {/* ── Cinematic statement (where we work) ── */}
      <section
        className="relative overflow-hidden border-t border-foreground/8"
        style={{ minHeight: "clamp(420px, 70vh, 800px)" }}
      >
        <Image
          src="/imagens/J&A-68.jpg"
          alt="Cerimónia ao ar livre organizada pela Líquen Events no Alentejo"
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
              <p className="text-cream/55 text-base lg:text-lg leading-[1.85] max-w-xl">
                {ts.seoText}
              </p>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Image
          src="/imagens/M&F0497.jpg"
          alt="Casamento celebrado ao anoitecer numa quinta no Alentejo"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/M&F0497.jpg")}
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
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
            <p className="text-white/60 text-base leading-relaxed max-w-md mb-12">{ts.ctaText}</p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <Magnetic strength={0.4}>
                <Link
                  href={localizeHref("/orcamento", locale)}
                  className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
                >
                  {t.common.pedirOrcamento} →
                </Link>
              </Magnetic>
              <Link
                href={localizeHref("/galeria", locale)}
                className="inline-flex items-center gap-3 px-9 py-4 border border-white/25 text-white/70 font-medium hover:border-white/50 hover:text-white transition-all duration-300 text-sm tracking-[0.18em] uppercase"
              >
                {ts.ctaGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
