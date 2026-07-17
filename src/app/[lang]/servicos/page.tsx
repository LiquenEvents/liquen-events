import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Magnetic from "@/components/motion/Magnetic";
import Parallax from "@/components/Parallax";
import HeroWebGL from "@/components/motion/HeroWebGL";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import { getDictionary, normalizeLocale, localizeHref, type Locale } from "@/lib/i18n";
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

// Full-bleed editorial photo grid (mirrors the Sobre page rhythm). Draws a
// fresh 6 from this pool on every entry to the page (see RotatingPhotoGrid) —
// all landscape frames so any lands cleanly in a wide or narrow cell.
const EDITORIAL_POOL = [
  "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/20_10_2025_0407.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/DaniGui_Adois_61.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/J&P-IMGL4769.jpg",
  "/imagens/EW1_1408.jpg",
  "/imagens/teresinhaeze-909.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
  "/imagens/matilde-e-tomas0654-1.jpg",
  "/imagens/stephanie-mizio-760.jpg",
];

const ED_WIDE = "(max-width: 1024px) 100vw, 50vw";
const ED_NARROW = "(max-width: 1024px) 50vw, 25vw";
const EDITORIAL_CELLS = [
  { cls: "col-span-2 row-span-2", sizes: ED_WIDE },
  { cls: "col-span-2", sizes: ED_WIDE },
  { cls: "col-span-1", sizes: ED_NARROW },
  { cls: "col-span-1", sizes: ED_NARROW },
  { cls: "col-span-2", sizes: ED_WIDE },
  { cls: "col-span-2", sizes: ED_WIDE },
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
      {/* Image-first (SpaceX-style): the photo reads fully at the top, and only
          the bottom — where the number/title/description sit — darkens enough to
          keep the white text legible. No heavy full-panel veil. */}
      <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
      {/* Full-SpaceX: a small, discreet caption tucked in the corner so the
          photograph carries the panel. Tiny mono index, compact uppercase
          service name, a one-line description, and an understated link. */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-12 lg:pb-16">
        <AnimateIn>
          <div className="max-w-sm">
            <p className="text-white/55 font-mono text-[10px] tracking-[0.4em] mb-3">
              {catNum}.{String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="text-white font-semibold uppercase tracking-[0.16em] text-[15px] sm:text-[17px] leading-snug">
              {service.title}
            </h3>
            <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
              {service.desc}
            </p>
            <Link
              href={localizeHref(`/servicos/${service.slug}`, locale)}
              className="mt-5 inline-flex items-center gap-1.5 text-white/85 text-[10px] tracking-[0.28em] uppercase border-b border-white/30 pb-1 transition-colors hover:border-white hover:text-white"
            >
              {cta} <span aria-hidden>→</span>
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
  const editorialPool = EDITORIAL_POOL.map((src) => ({
    src,
    blurDataURL: blurFor(src).blurDataURL,
  }));
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
      {/* -mt-24 cancels the global <main> pt-24 so the hero image runs to the
          very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/92 via-[#080808]/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {ts.heroEyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-[0.16em] text-[18px] sm:text-[21px] leading-snug">
                {ts.heroTitle.join(" ")}
              </h1>
              <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                {ts.heroLead}
              </p>
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "services-hero" }}
                className="mt-5 inline-flex items-center gap-1.5 text-white/85 text-[10px] tracking-[0.28em] uppercase border-b border-white/30 pb-1 transition-colors hover:border-white hover:text-white"
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Como trabalhamos — a nossa assinatura ──
          A light editorial break after the cinematic hero that finally renders
          the studio's signature approach (decoration + coordination + production)
          — copy that already existed in the dictionary but was never on screen.
          Gives the page words and a differentiator before the service panels. */}
      <section className="relative overflow-hidden border-t border-white/10 py-20 lg:py-28">
        <Image
          src="/imagens/hd-edited.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/hd-edited.jpg")}
        />
        {/* Moderate veil: this is a text section over a mood image, so it needs
            more cover than the photo panels while still letting the scene read. */}
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/80 via-[#080808]/40 to-[#080808]/65" />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-6 flex items-center gap-3">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {ts.philoEyebrow}
            </p>
            <h2
              className="text-white font-bold leading-[1.05] tracking-tight max-w-3xl"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 52px)" }}
            >
              {ts.philoTitle}
            </h2>
          </AnimateIn>
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-12 border-t border-white/15 pt-14">
            {ts.philoPillars.map((p, i) => (
              <AnimateIn key={p.title} delay={i * 90}>
                <div className="flex flex-col">
                  <span className="font-mono text-[11px] tracking-[0.4em] text-moss-light mb-5">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <h3
                    className="text-white font-bold text-xl lg:text-2xl mb-4"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {p.title}
                  </h3>
                  <p className="text-white/75 text-[15px] leading-[1.75] max-w-xs">{p.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
          <AnimateIn delay={120}>
            <p className="mt-14 pt-8 border-t border-white/15 text-white/60 text-sm tracking-wide">
              {ts.interludeTitle}
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── Service categories ── */}
      {categories.map((cat) => (
        <div key={cat.id}>
          {/* Category intro — full-screen cinematic panel (SpaceX-style):
              one image, one message. The light editorial header was dropped so
              the page reads as a sequence of immersive full-bleed panels. */}
          <section
            id={cat.id}
            className="relative overflow-hidden scroll-mt-[60px] flex items-end"
            style={{ minHeight: "clamp(500px, 80vh, 820px)" }}
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
            <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
            {/* Full-SpaceX: a small category caption tucked in the corner; the
                photograph carries the panel. Slightly larger than a service band
                to signal it opens a category. */}
            <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-12 lg:pb-16">
              <AnimateIn>
                <div className="max-w-md">
                  <p className="text-white/55 font-mono text-[10px] tracking-[0.4em] mb-4">
                    {cat.num}
                  </p>
                  <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                    <span className="w-6 h-px bg-gold flex-shrink-0" />
                    {cat.subtitle}
                  </p>
                  <h2 className="text-white font-semibold uppercase tracking-[0.18em] text-[19px] sm:text-[22px] leading-snug">
                    {cat.label}
                  </h2>
                  <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                    {cat.desc}
                  </p>
                  <Link
                    href={localizeHref(
                      `/servicos/${cat.id === "empresas" ? "eventos-corporativos" : cat.services[0].slug}`,
                      locale,
                    )}
                    className="mt-5 inline-flex items-center gap-1.5 text-white/85 text-[10px] tracking-[0.28em] uppercase border-b border-white/30 pb-1 transition-colors hover:border-white hover:text-white"
                  >
                    {ts.verDetalhes} <span aria-hidden>→</span>
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
      ))}

      {/* ── Editorial photo grid (full-bleed) ── */}
      <section className="bg-surface border-t border-foreground/8">
        <RotatingPhotoGrid
          cells={EDITORIAL_CELLS}
          pool={editorialPool}
          alt={t.common.imageAlt.servicosEndOfDay}
          className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1.5 auto-rows-[150px] sm:auto-rows-[220px] lg:auto-rows-[270px]"
          imgClassName="transition-transform duration-[1.2s] ease-out group-hover:scale-105"
        />
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
        <div className="absolute inset-0 bg-black/42" />
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
      <TestimonialsCarousel testimonials={t.testimonials} />

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
        <div className="absolute inset-0 bg-black/48" />
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
                <TrackedLink
                  href={localizeHref("/orcamento", locale)}
                  trackProps={{ source: "services-cta" }}
                  className={PRIMARY_BUTTON_DARK_CLASS}
                >
                  {t.common.pedirOrcamento} →
                </TrackedLink>
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
