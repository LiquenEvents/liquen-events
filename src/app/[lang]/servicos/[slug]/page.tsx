import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import { BreadcrumbJsonLd, ServiceJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { SERVICES, getService, quoteTipoForSlug } from "@/lib/services-data";
import { getDictionary, localizeHref, normalizeLocale } from "@/lib/i18n";
import { PRIMARY_BUTTON_CLASS, OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

// Column spans (on the lg 6-col gallery grid) that give the portfolio an
// asymmetric editorial rhythm instead of a uniform contact-sheet strip: a wide
// feature, then two balanced pairs, then mirror. Each row sums to 6. On mobile
// the grid falls back to an even 2-col layout (these lg: spans don't apply).
const GALLERY_SPANS = [
  "lg:col-span-4",
  "lg:col-span-2",
  "lg:col-span-3",
  "lg:col-span-3",
  "lg:col-span-2",
  "lg:col-span-4",
];

// Highlight brand/location keywords without dangerouslySetInnerHTML: split the
// text on the keywords and render the matches as <strong>. Safe by construction
// (no HTML is ever injected), even if the source copy changes.
const EMPHASIS = /(Líquen Events|Alentejo|Lisboa|Portugal)/g;
function emphasize(text: string) {
  return text.split(EMPHASIS).map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="text-foreground/75 font-medium">
        {part}
      </strong>
    ) : (
      part
    ),
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}): Promise<Metadata> {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const svc = getService(slug, locale);
  if (!svc) return { title: locale === "en" ? "Service not found" : "Serviço não encontrado" };
  return pageMetadata({
    locale,
    title: svc.metaTitle,
    description: svc.metaDescription,
    path: `/servicos/${svc.slug}`,
    image: svc.ogImage ?? svc.hero,
    keywords: svc.keywords,
    ogLocale: getDictionary(locale).meta.ogLocale,
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ lang: string; slug: string }>;
}) {
  const { lang, slug } = await params;
  const locale = normalizeLocale(lang);
  const t = getDictionary(locale);
  const svc = getService(slug, locale);
  if (!svc) notFound();

  const related = svc.related.map((r) => getService(r, locale)).filter(Boolean) as NonNullable<
    ReturnType<typeof getService>
  >[];

  // Closing CTA backdrop — a frame from this service's own gallery (falls back
  // to the hero) so the final call-to-action stays on-topic and cinematic.
  const ctaImg = svc.gallery.at(-1) ?? svc.hero;

  // Deep-link the quote CTAs with the matching event type so a visitor arriving
  // from this service page lands with it pre-selected (see OrcamentoForm).
  const quoteTipo = quoteTipoForSlug(svc.slug);
  const orcamentoHref =
    localizeHref("/orcamento", locale) + (quoteTipo ? `?tipo=${quoteTipo}` : "");

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[
          { name: t.nav.servicos, path: "/servicos" },
          { name: svc.title, path: `/servicos/${svc.slug}` },
        ]}
      />
      <ServiceJsonLd
        locale={locale}
        name={svc.title}
        description={svc.metaDescription}
        path={`/servicos/${svc.slug}`}
      />
      {svc.faqs.length > 0 && <FaqJsonLd faqs={svc.faqs} />}

      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[70svh] flex items-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src={svc.hero}
            {...blurFor(svc.hero)}
            alt=""
            fill
            preload
            sizes="100vw"
            className="object-cover hero-settle"
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src={svc.hero} className="absolute inset-0 h-full w-full" />
        {/* Image-first (SpaceX-style): only the bottom darkens enough to keep the
            white caption legible — no heavy full-panel veil. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-14 lg:pb-20">
          <nav
            aria-label={t.nav.breadcrumb}
            className="text-[11px] tracking-[0.2em] uppercase text-cream/60 mb-8"
          >
            <Link
              href={localizeHref("/servicos", locale)}
              className="inline-flex items-center gap-2 hover:text-cream transition-colors"
            >
              <span aria-hidden>←</span> {t.nav.servicos}
            </Link>
          </nav>
          {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
              photograph owns the first screen. Still the page's single <h1>. */}
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {svc.eyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                {svc.title}
              </h1>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Intro + includes ── */}
      <section className="py-20 lg:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-16">
          <AnimateIn>
            <div className="flex flex-col gap-6 text-foreground/72 text-[16px] leading-[1.8]">
              {svc.intro.map((p, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? "text-[19px] lg:text-[22px] leading-[1.6] text-foreground/85"
                      : undefined
                  }
                >
                  {emphasize(p)}
                </p>
              ))}
              <TrackedLink
                href={orcamentoHref}
                trackProps={{ source: "service-detail-intro", servico: slug }}
                className={`${PRIMARY_BUTTON_CLASS} mt-6`}
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
            </div>
          </AnimateIn>
          <AnimateIn delay={120}>
            {/* SpaceX-style hairline SPEC LIST (not a boxed card): each includes-
                item is a ruled row divided by a 1px foreground hairline. Phrases
                stay sentence case — uppercasing the long PT descriptions reads
                shouty — but sit against the eyebrow's uppercase spec label. */}
            <div>
              <p className="text-foreground/60 text-[10px] tracking-[0.4em] uppercase mb-2 flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" />
                {t.servicoDetalhe.includesTitle}
              </p>
              <ul className="flex flex-col">
                {svc.includes.map((item) => (
                  <li
                    key={item}
                    className="flex items-start gap-4 border-t border-foreground/12 py-3.5 text-foreground/75 text-sm leading-[1.6]"
                  >
                    {/* Squared 1px gold dash — the site's marker vocabulary
                        (same as the eyebrow dashes), centred on the first line.
                        min-w-0 lets long PT phrases wrap instead of clipping. */}
                    <span className="w-3 h-px bg-gold mt-[0.7em] flex-shrink-0" />
                    <span className="min-w-0">{item}</span>
                  </li>
                ))}
                {/* Closing hairline — bookends the ruled list (matches the FAQ). */}
                <li aria-hidden className="border-t border-foreground/12" />
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Aluguer de viaturas — cover band (weddings only) ── */}
      {svc.slug === "casamentos" && (
        <section
          className="relative overflow-hidden border-t border-foreground/8 flex items-end"
          style={{ minHeight: "clamp(360px, 60vh, 640px)" }}
        >
          <Image
            src="/imagens/viaturas-classicas.jpg"
            {...blurFor("/imagens/viaturas-classicas.jpg")}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          {/* This band's photo is brighter than the other service bands, so the
              caption needs a touch more darkening: a stronger mid-stop on the
              gradient + the veil text-shadow keep the small paragraph legible. */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/92 via-[#080808]/45 to-[#080808]/10" />
          {/* The <section> is `flex items-end`, so this caption sits at the
              bottom of the band's min-height (a bare `h-full` here wouldn't
              resolve against the section's min-height and the caption floated
              to the top, leaving the band looking empty). */}
          <div className="text-veil-shadow relative z-10 w-full">
            <div className="max-w-7xl mx-auto w-full px-6 lg:px-16 pb-12 lg:pb-16">
              <AnimateIn>
                <div className="max-w-md">
                  <p className="text-white/75 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                    <span className="w-6 h-px bg-gold flex-shrink-0" />
                    {t.servicoDetalhe.viaturasEyebrow}
                  </p>
                  <h2 className="text-white font-semibold uppercase tracking-display text-[15px] sm:text-[17px] leading-snug">
                    {t.servicoDetalhe.viaturasTitle}
                  </h2>
                  <p className="mt-3 text-white/85 text-[12.5px] leading-[1.6] max-w-sm">
                    {t.servicoDetalhe.viaturasText}
                  </p>
                </div>
              </AnimateIn>
            </div>
          </div>
        </section>
      )}

      {/* ── Gallery — editorial portfolio ── */}
      <section className="py-20 lg:py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 mb-10 lg:mb-14">
          <AnimateIn>
            <p className="text-foreground/60 text-[10px] tracking-[0.5em] uppercase flex items-center gap-3">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {t.servicoDetalhe.galleryEyebrow}
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <h2
              className="text-foreground font-bold leading-[1.05] tracking-tight mt-5"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 3.8vw, 52px)" }}
            >
              {t.servicoDetalhe.galleryTitle}
            </h2>
          </AnimateIn>
        </div>
        {/* Full-bleed mosaic (no horizontal padding): the photos run edge to
            edge, separated only by a 1px hairline of the surface showing
            through — keeps tile boundaries legible where similar photos meet. */}
        <Reveal
          as="div"
          variant="mask"
          stagger={0.08}
          className="grid grid-cols-2 lg:grid-cols-6 gap-px auto-rows-[160px] sm:auto-rows-[220px] lg:auto-rows-[300px]"
        >
          {svc.gallery.map((src, i) => {
            // Match the real column span (grid is 6-col at lg) so the wide
            // feature tiles aren't served a 33vw candidate and upscaled.
            const span = GALLERY_SPANS[i % GALLERY_SPANS.length];
            const dvw = span.includes("col-span-4")
              ? "67vw"
              : span.includes("col-span-3")
                ? "50vw"
                : "33vw";
            return (
              <div key={i} className={`relative overflow-hidden group ${span}`}>
                <Image
                  src={src}
                  {...blurFor(src)}
                  // Distinct alt per photo (base phrase + service + index) so
                  // screen-reader users can tell the portfolio images apart
                  // instead of hearing one identical string repeated.
                  alt={`${t.servicoDetalhe.galleryAlt} — ${svc.title} ${i + 1}`}
                  fill
                  sizes={`(max-width: 1024px) 50vw, ${dvw}`}
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </div>
            );
          })}
        </Reveal>
      </section>

      {/* ── FAQ (image-backed, SpaceX-style: light text over a photo + veil) ── */}
      {svc.faqs.length > 0 && (
        <section className="relative py-20 lg:py-28 border-t border-white/10 overflow-hidden">
          <Image
            src={svc.hero}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
            {...blurFor(svc.hero)}
          />
          {/* Strong, near-flat veil — this section is text-heavy, so the service's
              own photo reads as a dark atmospheric texture while every question
              stays legible. Matches the /contacto FAQ treatment. */}
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              backgroundImage:
                "linear-gradient(rgba(11,13,10,0.86), rgba(11,13,10,0.9)), linear-gradient(to right, rgba(11,13,10,0.4), transparent 60%)",
            }}
          />
          <div className="relative z-10 max-w-3xl mx-auto px-6 lg:px-16">
            <AnimateIn>
              <h2 className="text-veil-shadow text-white/70 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" /> {t.servicoDetalhe.faqTitle}
              </h2>
            </AnimateIn>
            <Reveal as="div" stagger={0.08} className="text-veil-shadow flex flex-col">
              {svc.faqs.map((f) => (
                <div key={f.q} className="border-t border-white/12 py-7">
                  <h3
                    className="text-white text-base mb-3"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {f.q}
                  </h3>
                  <p className="text-white/80 text-sm leading-[1.9]">{f.a}</p>
                </div>
              ))}
              <div className="border-t border-white/12" />
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Related ── */}
      {related.length > 0 && (
        <section className="py-20 lg:py-28 bg-surface border-t border-foreground/8">
          <div className="max-w-7xl mx-auto px-6 lg:px-16">
            <AnimateIn>
              <h2 className="text-foreground/60 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" /> {t.servicoDetalhe.relatedTitle}
              </h2>
            </AnimateIn>
            <Reveal as="div" stagger={0.1} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={localizeHref(`/servicos/${r.slug}`, locale)}
                  className="group relative overflow-hidden aspect-[16/9] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
                >
                  <Image
                    src={r.hero}
                    {...blurFor(r.hero)}
                    alt=""
                    fill
                    sizes="(max-width: 639px) 100vw, (max-width: 1280px) 50vw, 576px"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    <p className="text-white/60 text-[10px] tracking-[0.35em] uppercase mb-1.5">
                      {r.eyebrow}
                    </p>
                    {/* Uppercase caption treatment (matches the hero / band
                        titles) — reads cleaner than serif at card size. */}
                    <h3 className="text-white font-semibold uppercase tracking-display text-[14px] sm:text-[15px] leading-snug">
                      {r.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </Reveal>
          </div>
        </section>
      )}

      {/* ── CTA — full-bleed cinematic closer ── */}
      <section
        className="relative flex items-center overflow-hidden border-t border-foreground/8 py-28 lg:py-40"
        style={{ minHeight: "clamp(460px, 68vh, 760px)" }}
      >
        <Image
          src={ctaImg}
          alt=""
          fill
          sizes="100vw"
          className="object-cover object-bottom"
          {...blurFor(ctaImg)}
        />
        {/* Wash + gradient merged (gradient listed first = on top). Same look. */}
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "linear-gradient(to top, rgba(8,8,8,0.9), transparent, rgba(8,8,8,0.5)), linear-gradient(rgba(0,0,0,0.48), rgba(0,0,0,0.48))",
          }}
        />
        <div className="text-veil-shadow relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <h2
              className="text-white font-bold leading-[0.95] mb-12 max-w-2xl"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 5.5vw, 76px)" }}
            >
              {t.servicoDetalhe.ctaTitle}
            </h2>
          </AnimateIn>
          <TrackedLink
            href={orcamentoHref}
            trackProps={{ source: "service-detail-cta", servico: slug }}
            className={OUTLINE_LIGHT_BUTTON_CLASS}
          >
            {t.common.pedirOrcamento} <span aria-hidden>→</span>
          </TrackedLink>
        </div>
      </section>
    </>
  );
}
