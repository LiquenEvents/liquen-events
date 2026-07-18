import type { Metadata } from "next";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";
import GaleriaClient from "./GaleriaClient";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import { blurFor } from "@/lib/blur";
import { aspectFor } from "@/lib/image-meta";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";
import { PHOTOS } from "./photos-data";
import { interleaveByCollection } from "./interleave";

// Resolved server-side (from blur-map.json / image-dims.json) so those
// site-wide JSON maps never reach the gallery's client bundle — GaleriaClient
// only receives the handful of fields each photo actually needs. Each photo
// object ships exactly { src, label, aspectRatio, blurDataURL? } and the client
// consumes all four (src/label → alt + filtering, aspectRatio → masonry,
// blurDataURL → placeholder), so there are no dead fields left to trim.
//
// Every photo carries its aspectRatio (the masonry layout needs it up front),
// but blur placeholders are shipped ONLY for the photos that paint first. The
// client mounts with `shown = PAGE` (24) tiles, so the blur set is sized to
// cover that first-paint screenful with a small margin — the dominant weight in
// this array is the blur data-URIs (~1–2KB each), so shipping them for tiles the
// first paint never shows was pure RSC flight-data waste. Everything past this
// window (loaded later by infinite scroll) falls back to the gallery's near-
// black background as it decodes, exactly like the long tail already did.
const BLUR_PRELOAD = 30;
const withRatio = PHOTOS.map((p) => ({ ...p, aspectRatio: aspectFor(p.src) }));
const firstPaintSrc = new Set(
  interleaveByCollection(withRatio)
    .slice(0, BLUR_PRELOAD)
    .map((p) => p.src),
);
const galleryPhotos = withRatio.map((p) =>
  firstPaintSrc.has(p.src) ? { ...p, blurDataURL: blurFor(p.src).blurDataURL } : p,
);

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.galeriaTitle,
    description: t.meta.galeriaDescription,
    path: "/galeria",
    image: "/imagens/DaniGui_Preview20.jpg",
    keywords: ["galeria de eventos", "fotografias de casamentos Alentejo"],
    ogLocale: t.meta.ogLocale,
  });
}

export default async function GaleriaPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.galeria, path: "/galeria" }]}
      />

      {/* ── Immersive hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero image runs to the
          very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[68svh] lg:min-h-[80svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/DaniGui_Preview20.jpg"
            alt={t.common.imageAlt.galeriaHeader}
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/DaniGui_Preview20.jpg")}
          />
        </Parallax>
        {/* Image-first (SpaceX-style): only the bottom darkens enough to keep the
            white caption legible — no heavy full-panel veil. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.galeria.headerLabel}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-[0.16em] text-[18px] sm:text-[21px] leading-snug">
                {t.galeria.headerTitle}
              </h1>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Gallery (dark, immersive) ── */}
      {/* Full-bleed (SpaceX-style): sem wrapper max-w/px — a masonry corre de
          borda a borda, só com o gap-0.5 interno entre fotos. O chrome dos
          filtros traz o seu próprio padding lateral (ver GaleriaClient). */}
      <section className="py-12 lg:py-16 bg-[#0b0b0b]">
        <GaleriaClient photos={galleryPhotos} dict={t.galeria} />
      </section>

      {/* ── Instagram CTA ── */}
      <section className="relative overflow-hidden border-t border-white/8">
        <Image
          src="/imagens/DaniGui_Adois_61.jpg"
          alt={t.common.imageAlt.galeriaInstagram}
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
              "linear-gradient(to right, rgba(8,8,8,0.85), rgba(8,8,8,0.35), transparent), linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2))",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 py-20 lg:py-28">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.48em] uppercase mb-8 flex items-center gap-3">
              <span className="w-5 h-px bg-gold flex-shrink-0" />
              {t.galeria.instaEyebrow}
            </p>
            <h2
              className="text-white text-4xl lg:text-5xl font-bold mb-5"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              {t.galeria.instaTitle}
            </h2>
            <p className="text-white/70 text-sm leading-relaxed mb-10 max-w-md">
              {t.galeria.instaText}
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "galeria" }}
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
              <a
                href="https://www.instagram.com/liquen.events"
                target="_blank"
                rel="noopener noreferrer"
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                @liquen.events <span aria-hidden>→</span>
              </a>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
