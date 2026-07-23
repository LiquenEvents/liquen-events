import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
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
    title: t.meta.sobreTitle,
    description: t.meta.sobreDescription,
    path: "/sobre",
    // Landscape (2560×1707) — the page's own hero. The previous OG image was a
    // portrait crop, which social platforms render as a broken sliver.
    image: "/imagens/hd-edited.jpg",
    keywords: ["decoração de eventos Alentejo", "sobre Líquen Events"],
    ogLocale: t.meta.ogLocale,
  });
}

const eyebrowDark =
  "text-foreground/68 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

export default async function SobrePage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.sobre, path: "/sobre" }]}
      />

      {/* ── HERO ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/hd-edited.jpg"
            alt={t.common.imageAlt.sobreCelebration}
            fill
            preload
            sizes="100vw"
            quality={75}
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/hd-edited.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src="/imagens/hd-edited.jpg" className="absolute inset-0 h-full w-full" />
        {/* SpaceX scrim: single bottom-anchored gradient so the photograph reads
            full at the top; no heavy flat veil. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. No CTA
            on this hero, so the understated link is omitted. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.sobre.heroEyebrow}
              </p>
              {/* SpaceX display tracking (.tracking-display, -0.02em) replaces the
                  airy caption tracking so the caps pull together on the h1. */}
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                {`${t.sobre.heroTitlePre}${t.sobre.heroTitleMoss}`}
              </h1>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── MANIFESTO — short statement + image ── */}
      {/* overflow-x-clip contains the ~4px the from-left/right reveal transforms
          and grid rounding push past the viewport edge on mobile. */}
      <section className="py-20 lg:py-28 bg-surface overflow-x-clip">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-12 lg:gap-20 items-center">
          <AnimateIn from="left">
            <p className={`${eyebrowDark} mb-8`}>
              <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
              {t.sobre.manifestoEyebrow}
            </p>
            <h2
              className="text-foreground font-bold uppercase tracking-display leading-[1.05]"
              style={{ fontSize: "clamp(32px, 5vw, 68px)" }}
            >
              {t.sobre.manifestoTitleLine1}
              <br />
              <span className="text-moss">{t.sobre.manifestoTitleLine2}</span>
            </h2>
            <p className="text-foreground/78 text-base lg:text-lg leading-[1.8] mt-8 max-w-md">
              {t.sobre.manifestoText}
            </p>
          </AnimateIn>
          <AnimateIn from="right" delay={120}>
            {/* From lg the photo breaks out of the content frame and bleeds to
                the right viewport edge (SpaceX full-bleed): the negative margin
                cancels the container's centering slack + its 4rem padding. The
                section's overflow-x-clip swallows the ~half-scrollbar of 100vw
                overshoot, so nothing scrolls sideways. */}
            <div className="relative aspect-[4/5] overflow-hidden lg:-mr-[calc((100vw_-_min(100vw,80rem))/2_+_4rem)]">
              <Image
                src="/imagens/DaniGui_Preview12.jpg"
                alt={t.common.imageAlt.sobrePortrait}
                fill
                sizes="(max-width: 1024px) 100vw, 55vw"
                quality={75}
                className="object-cover"
                {...blurFor("/imagens/DaniGui_Preview12.jpg")}
              />
              {/* SpaceX chapter treatment on the full-bleed photo: a bottom-left
                  scrim + corner caption (single gold dash + uppercase eyebrow),
                  the same idiom as the home service chapters. */}
              <div
                aria-hidden
                className="absolute inset-0 bg-gradient-to-t from-[#080808]/85 via-[#080808]/20 to-[#080808]/5"
              />
              <div className="absolute inset-x-0 bottom-0 p-6 lg:p-8">
                <p className="text-white/75 text-[10px] tracking-[0.4em] uppercase flex items-center gap-3">
                  <span className="w-8 h-px bg-gold flex-shrink-0" />
                  {t.sobre.manifestoImageCaption}
                </p>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── CINEMATIC STATEMENT ── */}
      <section
        className="relative overflow-hidden border-t border-foreground/8"
        style={{ minHeight: "clamp(360px, 65vh, 760px)" }}
      >
        <Parallax speed={0.1} className="absolute inset-0">
          <Image
            src="/imagens/M&F0497.jpg"
            alt={t.common.imageAlt.sobreGolden}
            fill
            sizes="100vw"
            quality={75}
            className="object-cover object-center scale-110"
            {...blurFor("/imagens/M&F0497.jpg")}
          />
        </Parallax>
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
            <p
              className="text-cream font-bold uppercase tracking-display leading-[1.12] max-w-4xl"
              style={{ fontSize: "clamp(26px, 4.5vw, 64px)" }}
            >
              <TitleReveal text={t.sobre.statementLead} as="span" step={50} />{" "}
              <TitleReveal
                text={t.sobre.statementRest}
                as="span"
                className="text-cream/70"
                step={50}
                delay={t.sobre.statementLead.split(/\s+/).length * 50 + 80}
              />
            </p>
          </div>
        </div>
      </section>

      {/* ── FOUNDER — minimal, in the site's signature idiom ── */}
      {/* Pared back to the site's own "signature" rhythm and typeface (Inter):
          gold-dash eyebrow + big uppercase display headline + a hairline +
          attribution. Just the portrait, the founder's words and her name — no
          bio paragraph, no extra lines. */}
      <section className="bg-surface border-t border-foreground/8 overflow-x-clip">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 py-24 lg:py-36">
          <div className="grid grid-cols-1 lg:grid-cols-[0.8fr_1.2fr] gap-14 lg:gap-24 items-center">
            {/* Portrait — flat and borderless, uncovered with the mask-wipe. */}
            <Reveal
              as="div"
              variant="mask"
              className="relative mx-auto w-full max-w-xs lg:max-w-none"
            >
              <div className="relative aspect-[3/4] overflow-hidden">
                <Image
                  src="/imagens/catarina-gaspar.jpg"
                  alt={t.common.imageAlt.sobreFounder}
                  fill
                  sizes="(max-width: 1024px) 80vw, 34vw"
                  quality={75}
                  className="object-cover object-[50%_18%]"
                  {...blurFor("/imagens/catarina-gaspar.jpg")}
                />
              </div>
            </Reveal>

            {/* Text — eyebrow, the founder's words, and her name. Nothing more. */}
            <div className="flex flex-col justify-center">
              <AnimateIn>
                <p className={`${eyebrowDark} mb-8`}>
                  <span className="w-8 h-px bg-gold flex-shrink-0" />
                  {t.sobre.founderEyebrow}
                </p>
                <p
                  className="text-foreground font-bold uppercase tracking-display leading-[1.05]"
                  style={{ fontSize: "clamp(28px, 4vw, 52px)" }}
                >
                  {t.sobre.founderQuote}
                </p>
                <div className="mt-12 pt-6 border-t border-foreground/10">
                  <p className="text-foreground text-sm tracking-[0.15em] uppercase">
                    {t.sobre.founderName}
                  </p>
                  <p className="text-foreground/50 text-[11px] tracking-[0.3em] uppercase mt-1.5">
                    {t.sobre.founderRole}
                  </p>
                </div>
              </AnimateIn>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Image
          src="/imagens/DaniGui_Adois_61.jpg"
          alt={t.common.imageAlt.sobreOutdoor}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
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
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.sobre.ctaEyebrow}
            </p>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.9] mb-6"
              style={{ fontSize: "clamp(40px, 7vw, 96px)" }}
            >
              {t.sobre.ctaTitleLine1}
              <br />
              <span className="text-moss">{t.sobre.ctaTitleMoss}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/70 text-base leading-relaxed max-w-md mb-12">
              {t.sobre.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap items-center justify-center gap-4">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "sobre" }}
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                {t.common.pedirOrcamento} →
              </TrackedLink>
              <Link href={localizeHref("/contacto", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.entrarContacto}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
