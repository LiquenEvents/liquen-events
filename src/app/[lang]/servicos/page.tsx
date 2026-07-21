import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import HeroWebGL from "@/components/motion/HeroWebGL";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref, type Locale } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";

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
    band: "/imagens/DaniGui_Preview20.jpg",
    services: [
      { slug: "casamentos", image: "/imagens/stephanie-mizio-760.jpg" },
      { slug: "aluguer-de-viaturas-classicas", image: "/imagens/viaturas-classicas.jpg" },
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
      { slug: "eventos-corporativos", image: "/imagens/EW1_1405.jpg" },
      { slug: "conferencias-e-congressos", image: "/imagens/EW1_1332.jpg" },
      { slug: "teambuilding", image: "/imagens/EW1_1330.jpg" },
      { slug: "lancamentos-de-produto", image: "/imagens/EW1_1428.jpg" },
      { slug: "jantares-de-empresa", image: "/imagens/EW1_1404.jpg" },
    ],
  },
];

/* ── Full-screen service band — one image, one service (SpaceX-style) ── */
function ServiceBand({
  service,
  cta,
  locale,
}: {
  service: ServiceCard;
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
          alt={service.title}
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
      {/* A big bold uppercase headline, a one-line description, and the ghost
          outline button. The mono chapter index was removed on request. */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-12 lg:pb-16">
        <AnimateIn>
          <div className="max-w-2xl">
            <h3
              className="text-veil-shadow text-white font-bold uppercase tracking-display leading-[0.95]"
              style={{ fontSize: "clamp(28px, 4.5vw, 56px)" }}
            >
              {service.title}
            </h3>
            <p className="mt-4 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
              {service.desc}
            </p>
            <Link
              href={localizeHref(`/servicos/${service.slug}`, locale)}
              // Specific accessible name so the link's purpose is clear out of
              // context (screen-reader link list) and the anchor text carries the
              // service keyword for SEO — the visible label stays minimal.
              aria-label={`${cta} — ${service.title}`}
              className={`mt-7 inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
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
        {/* Two hero veils merged into one layer (former upper div first, as
            multiple backgrounds paint first-listed on top). Same pixels. */}
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
                {ts.heroEyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                {ts.heroTitle.join(" ")}
              </h1>
              <p className="mt-3 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                {ts.heroLead}
              </p>
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "services-hero" }}
                className={`mt-7 inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
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
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(8,8,8,0.8), rgba(8,8,8,0.4), rgba(8,8,8,0.65)), linear-gradient(rgba(0,0,0,0.55), rgba(0,0,0,0.55))",
          }}
        />
        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-6 flex items-center gap-3">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {ts.philoEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[1.05] max-w-3xl"
              style={{ fontSize: "clamp(28px, 4vw, 52px)" }}
            >
              {ts.philoTitle}
            </h2>
          </AnimateIn>
          {/* Processo em três passos: títulos em caixa alta com tracking-display
              e filetes hairline (border-white/15) a separar cada passo — sem
              cantos arredondados, sem floreados. Os números foram removidos a
              pedido. Vertical no telemóvel, três colunas a partir de md. */}
          <div className="mt-14 grid grid-cols-1 md:grid-cols-3 border-t border-white/15">
            {ts.philoPillars.map((p, i) => (
              <AnimateIn key={p.title} delay={i * 90}>
                <div
                  className={`flex flex-col py-10 md:py-14 md:px-10 ${
                    i === 0
                      ? "md:pl-0"
                      : "border-t border-white/15 md:border-t-0 md:border-l md:border-white/15"
                  }`}
                >
                  <h3 className="text-white font-bold uppercase tracking-display text-lg lg:text-xl mb-4">
                    {p.title}
                  </h3>
                  <p className="text-white/75 text-[15px] leading-[1.75] max-w-xs">{p.text}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
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
                alt={cat.label}
                fill
                sizes="100vw"
                className="object-cover object-center"
                {...blurFor(cat.band)}
              />
            </Parallax>
            <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
            {/* Big bold uppercase headline + ghost outline button. Slightly
                larger than a service band to signal it opens a category. The
                numbered marker and subtitle eyebrow were removed on request. */}
            <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-12 lg:pb-16">
              <AnimateIn>
                <div className="max-w-2xl">
                  <h2
                    className="text-veil-shadow text-white font-bold uppercase tracking-display leading-[0.95]"
                    style={{ fontSize: "clamp(32px, 5.5vw, 64px)" }}
                  >
                    {cat.label}
                  </h2>
                  <p className="mt-4 text-white/70 text-[12.5px] leading-[1.6] max-w-xs">
                    {cat.desc}
                  </p>
                  <Link
                    href={localizeHref(
                      `/servicos/${cat.id === "empresas" ? "eventos-corporativos" : cat.services[0].slug}`,
                      locale,
                    )}
                    // Category-specific accessible name (visible label stays
                    // minimal) so the link's target is clear out of context.
                    aria-label={`${ts.verDetalhes} — ${cat.label}`}
                    className={`mt-7 inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
                  >
                    {ts.verDetalhes} <span aria-hidden>→</span>
                  </Link>
                </div>
              </AnimateIn>
            </div>
          </section>

          {/* Service bands — one full-screen panel per service */}
          {cat.services.map((s, i) => (
            <ServiceBand key={`${cat.id}-${i}`} service={s} cta={ts.verMais} locale={locale} />
          ))}
        </div>
      ))}

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
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgb(8,8,8), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.42), rgba(0,0,0,0.42))",
          }}
        />
        <div className="text-veil-shadow relative z-10 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 w-full py-20 lg:py-28">
            <AnimateIn>
              <p className={`${eyebrowLight} mb-7`}>
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {ts.seoEyebrow}
              </p>
              <h2
                className="text-cream font-bold uppercase tracking-display leading-[1.04] mb-7 max-w-3xl"
                style={{ fontSize: "clamp(32px, 5vw, 76px)" }}
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
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(8,8,8,0.9), rgba(8,8,8,0.35), rgba(8,8,8,0.55)), linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5))",
          }}
        />

        <div className="text-veil-shadow relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {ts.ctaEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.9] mb-6"
              style={{ fontSize: "clamp(44px, 8vw, 110px)" }}
            >
              {ts.ctaTitleLine1}
              <br />
              <span className="text-moss-light">{ts.ctaTitleMoss}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/75 text-base leading-relaxed max-w-md mb-12">{ts.ctaText}</p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "services-cta" }}
                className={`inline-flex items-center gap-3 ${OUTLINE_LIGHT_BUTTON_CLASS}`}
              >
                {t.common.pedirOrcamento} →
              </TrackedLink>
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
