import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Magnetic from "@/components/motion/Magnetic";
import Parallax from "@/components/Parallax";
import KineticHeading from "@/components/KineticHeading";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import { BreadcrumbJsonLd, ServiceJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { SERVICES, getService } from "@/lib/services-data";
import { getDictionary, localizeHref, normalizeLocale } from "@/lib/i18n";

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
    image: svc.hero,
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
      <section className="relative min-h-[70vh] flex items-end overflow-hidden">
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
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-20">
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
          <p className="text-cream/80 text-[10px] tracking-[0.5em] uppercase mb-6 flex items-center gap-3">
            <span className="w-8 h-px bg-gold flex-shrink-0" />
            {svc.eyebrow}
          </p>
          <KineticHeading
            className="text-cream font-bold leading-[0.95] max-w-4xl"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "var(--hero-detail)" }}
            lines={[[{ text: svc.title }]]}
          />
        </div>
      </section>

      {/* ── Intro + includes ── */}
      <section className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-16">
          <AnimateIn>
            <div className="flex flex-col gap-6 text-foreground/68 text-[16px] leading-[1.9]">
              {svc.intro.map((p, i) => (
                <p
                  key={i}
                  className={
                    i === 0
                      ? "text-[19px] lg:text-[23px] leading-[1.6] text-foreground/85"
                      : undefined
                  }
                >
                  {emphasize(p)}
                </p>
              ))}
              <Link
                href={localizeHref("/orcamento", locale)}
                className="inline-flex items-center gap-3 mt-6 px-8 py-4 btn-shine bg-moss text-white text-[11px] tracking-[0.24em] uppercase hover:bg-moss-dark hover:gap-5 transition-all duration-300 shadow-lg shadow-moss/15"
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </Link>
            </div>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="border border-foreground/10 p-8 bg-surface-raised/40">
              <p className="text-foreground/68 text-[10px] tracking-[0.4em] uppercase mb-6 flex items-center gap-3">
                <span className="w-5 h-px bg-gold/60 flex-shrink-0" />
                {t.servicoDetalhe.includesTitle}
              </p>
              <ul className="flex flex-col gap-4">
                {svc.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-foreground/72 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-moss mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Aluguer de viaturas — cover band (weddings only) ── */}
      {svc.slug === "casamentos" && (
        <section
          className="relative overflow-hidden border-t border-foreground/8"
          style={{ minHeight: "clamp(420px, 66vh, 760px)" }}
        >
          <Image
            src="/imagens/viaturas-classicas.jpg"
            {...blurFor("/imagens/viaturas-classicas.jpg")}
            alt=""
            fill
            sizes="100vw"
            className="object-cover object-center"
          />
          <div className="absolute inset-0 bg-black/50" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]/40" />
          <div className="relative z-10 h-full flex items-end">
            <div className="max-w-7xl mx-auto w-full px-6 lg:px-16 py-16 lg:py-24">
              <AnimateIn>
                <p className="text-cream/80 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center gap-3">
                  <span className="w-6 h-px bg-gold flex-shrink-0" />
                  {t.servicoDetalhe.viaturasEyebrow}
                </p>
                <h2
                  className="text-cream font-bold leading-[0.98] mb-6 max-w-2xl"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(30px, 4.5vw, 60px)",
                  }}
                >
                  {t.servicoDetalhe.viaturasTitle}
                </h2>
                <p className="text-cream/75 text-base lg:text-lg leading-[1.8] max-w-xl">
                  {t.servicoDetalhe.viaturasText}
                </p>
              </AnimateIn>
            </div>
          </div>
        </section>
      )}

      {/* ── Gallery — editorial portfolio ── */}
      <section className="py-20 lg:py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 mb-10 lg:mb-14">
          <AnimateIn>
            <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase flex items-center gap-3">
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
        <div className="px-1.5">
          <Reveal
            as="div"
            variant="mask"
            stagger={0.08}
            className="grid grid-cols-2 lg:grid-cols-6 gap-1.5 auto-rows-[160px] sm:auto-rows-[220px] lg:auto-rows-[300px]"
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
                    alt={t.servicoDetalhe.galleryAlt}
                    fill
                    sizes={`(max-width: 1024px) 50vw, ${dvw}`}
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
                </div>
              );
            })}
          </Reveal>
        </div>
      </section>

      {/* ── FAQ ── */}
      {svc.faqs.length > 0 && (
        <section className="py-24 bg-surface border-t border-foreground/8">
          <div className="max-w-3xl mx-auto px-6 lg:px-16">
            <AnimateIn>
              <h2 className="text-foreground/68 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
                <span className="w-5 h-px bg-gold/50" /> {t.servicoDetalhe.faqTitle}
              </h2>
            </AnimateIn>
            <Reveal as="div" stagger={0.08} className="flex flex-col">
              {svc.faqs.map((f) => (
                <div key={f.q} className="border-t border-foreground/8 py-7">
                  <h3
                    className="text-foreground/80 text-base mb-3"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {f.q}
                  </h3>
                  <p className="text-foreground/78 text-sm leading-[1.9]">{f.a}</p>
                </div>
              ))}
              <div className="border-t border-foreground/8" />
            </Reveal>
          </div>
        </section>
      )}

      {/* ── Related ── */}
      {related.length > 0 && (
        <section className="py-24 bg-surface border-t border-foreground/8">
          <div className="max-w-7xl mx-auto px-6 lg:px-16">
            <AnimateIn>
              <h2 className="text-foreground/68 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
                <span className="w-5 h-px bg-gold/50" /> {t.servicoDetalhe.relatedTitle}
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
                    sizes="50vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    <p className="text-moss/70 text-[9px] tracking-[0.35em] uppercase mb-1.5">
                      {r.eyebrow}
                    </p>
                    <h3
                      className="text-cream text-xl font-bold group-hover:text-moss transition-colors"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
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
        <div className="absolute inset-0 bg-black/66" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]/50" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <h2
              className="text-white font-bold leading-[0.95] mb-12 max-w-2xl"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 5.5vw, 76px)" }}
            >
              {t.servicoDetalhe.ctaTitle}
            </h2>
          </AnimateIn>
          <Magnetic strength={0.4}>
            <Link
              href={localizeHref("/orcamento", locale)}
              className="inline-flex items-center gap-3 px-8 py-4 btn-shine bg-moss text-white font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase shadow-lg shadow-moss/15"
            >
              {t.common.pedirOrcamento} <span aria-hidden>→</span>
            </Link>
          </Magnetic>
        </div>
      </section>
    </>
  );
}
