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
import RotatingPhotoGrid from "@/components/RotatingPhotoGrid";
import StatsBand from "@/components/StatsBand";
import { clientLogos } from "@/data";

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

// The editorial wall draws a fresh 6 from this pool on every entry to the page
// (see RotatingPhotoGrid). All landscape event frames, so they read well in
// either a wide or a narrow cell.
const GRID_POOL = [
  "/imagens/J&A-68.jpg",
  "/imagens/matilde-e-tomas0654-1.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
  "/imagens/ines-goncalo-252.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/teresinhaeze-909.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/J&P-IMGL4769.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1408.jpg",
  "/imagens/20_10_2025_0407.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
];

// The grid is 2-col below `lg` and 4-col from `lg` (1024px) up, full-bleed (no
// max-width wrapper). So a col-span-2 cell is the full row on mobile (100vw) and
// half the row from lg (50vw); a col-span-1 cell is 50vw on mobile and 25vw from
// lg. The old values declared 50vw for wide cells on mobile (they render 100vw,
// so the browser under-fetched and upscaled) and switched at 768px instead of
// the real 1024px column breakpoint.
const WIDE_SIZES = "(max-width: 1024px) 100vw, 50vw";
const NARROW_SIZES = "(max-width: 1024px) 50vw, 25vw";
// Fixed cell layout (spans + the right `sizes` per cell); whichever photo lands
// in a cell, the shape stays the same.
const GRID_CELLS = [
  { cls: "col-span-2 row-span-2", sizes: WIDE_SIZES },
  { cls: "col-span-2", sizes: WIDE_SIZES },
  { cls: "col-span-1", sizes: NARROW_SIZES },
  { cls: "col-span-1", sizes: NARROW_SIZES },
  { cls: "col-span-2", sizes: WIDE_SIZES },
  { cls: "col-span-2", sizes: WIDE_SIZES },
];

const eyebrowDark =
  "text-foreground/68 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

export default async function SobrePage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  // Enrich the wall's pool with blur placeholders server-side (keeps blur-map
  // out of the client bundle); the client picks a random 6 per visit.
  const gridPool = GRID_POOL.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }));
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
              className="text-foreground font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 5vw, 68px)" }}
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

      {/* ── STATS BAND — banda de números à maneira das páginas de veículo da
          SpaceX (numerais finos gigantes com count-up + etiquetas maiúsculas).
          Só factos directamente sustentados pela cópia: +100 eventos ("Mais de
          100 casamentos e celebrações"), "desde 2018" (→ anos de atividade,
          2026−2018 = 8) e o total de logótipos de clientes (clientLogos.length).
          Os valores vivem no código; só as etiquetas estão no dicionário.
          (Deixámos cair um 4.º número de "distritos": afirmaria cobertura
          executada nos 18 distritos, mais forte do que a cópia "todo o Portugal"
          garante — três números verdadeiros valem mais do que quatro.) ── */}
      <StatsBand
        eyebrow={t.sobre.stats.eyebrow}
        stats={[
          { value: 100, suffix: "+", label: t.sobre.stats.eventosLabel },
          { value: 8, label: t.sobre.stats.anosLabel },
          { value: clientLogos.length, suffix: "+", label: t.sobre.stats.clientesLabel },
        ]}
      />

      {/* ── EDITORIAL PHOTO GRID ── */}
      <section className="bg-surface">
        <RotatingPhotoGrid
          cells={GRID_CELLS}
          pool={gridPool}
          alt={t.common.imageAlt.sobreCelebration}
          className="grid grid-cols-2 lg:grid-cols-4 gap-0 auto-rows-[150px] sm:auto-rows-[220px] lg:auto-rows-[270px]"
          imgClassName="transition-transform duration-[1.2s] ease-out group-hover:scale-105"
        />
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
              className="text-cream font-bold leading-[1.12] max-w-4xl"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4.5vw, 64px)" }}
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

      {/* ── FOUNDER ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="relative overflow-hidden min-h-[460px] lg:min-h-[620px]">
            {/* Founder portrait as a full-bleed chapter panel (fills its column,
                bleeding to the section edge) instead of a small centred frame —
                uncovered with the same cinematic mask-wipe used on the editorial
                grids, so it arrives instead of just being there. */}
            <Reveal as="div" variant="mask" className="absolute inset-0">
              <Image
                src="/imagens/catarina-gaspar.jpg"
                alt={t.common.imageAlt.sobreFounder}
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover object-center"
                {...blurFor("/imagens/catarina-gaspar.jpg")}
              />
            </Reveal>
            {/* Chapter scrim + bottom-left caption (gold dash + uppercase
                eyebrow), matching the manifesto and home service chapters. */}
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-[#080808]/80 via-[#080808]/15 to-transparent"
            />
            <div className="absolute inset-x-0 bottom-0 p-6 lg:p-10">
              <p className="text-white/75 text-[10px] tracking-[0.4em] uppercase flex items-center gap-3">
                <span className="w-8 h-px bg-gold flex-shrink-0" />
                {t.sobre.founderRole}
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-center px-6 lg:px-16 py-16 lg:py-28">
            <AnimateIn>
              <p className={`${eyebrowDark} mb-10`}>
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {t.sobre.founderEyebrow}
              </p>
              <p
                className="text-foreground/78 leading-[1.5]"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 3vw, 38px)" }}
              >
                {t.sobre.founderQuote}
              </p>
              <div className="mt-10 flex items-center gap-4">
                <span className="w-8 h-px bg-gold/50" />
                <div>
                  <p className="text-foreground text-sm font-semibold">{t.sobre.founderName}</p>
                  <p className="text-foreground/72 text-xs mt-0.5">{t.sobre.founderRole}</p>
                </div>
              </div>
            </AnimateIn>
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
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.sobre.ctaEyebrow}
            </p>
            <h2
              className="text-white font-bold leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 7vw, 96px)" }}
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
