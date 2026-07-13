import type { Metadata } from "next";
import Image from "next/image";
import GaleriaClient from "./GaleriaClient";
import AnimateIn from "@/components/AnimateIn";
import ShaderImageLazy from "@/components/motion/ShaderImageLazy";
import Parallax from "@/components/Parallax";
import { blurFor } from "@/lib/blur";
import { aspectFor } from "@/lib/image-meta";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import { PHOTOS, DECOR_SRCS } from "./photos-data";

// Resolved server-side (from blur-map.json / image-dims.json) so those
// site-wide JSON maps never reach the gallery's client bundle — GaleriaClient
// only receives the handful of fields each photo actually needs.
const galleryPhotos = PHOTOS.map((p) => ({
  ...p,
  blurDataURL: blurFor(p.src).blurDataURL,
  aspectRatio: aspectFor(p.src),
}));

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
      <section className="relative min-h-[68svh] lg:min-h-[80svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/DaniGui_Preview20.jpg"
            alt="Galeria de eventos Líquen Events"
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/DaniGui_Preview20.jpg")}
          />
        </Parallax>
        {/* WebGL: ondulação líquida a seguir o cursor sobre a foto do herói
            (por cima do <Image>, que continua a ser LCP + fallback). */}
        <ShaderImageLazy
          src="/imagens/DaniGui_Preview20.jpg"
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-black/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-[#0b0b0b]/15 to-transparent" />
        {/* Extra readability gradient only behind the bottom-left text block */}
        <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20 pt-40">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase mb-7 flex items-center gap-3">
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {t.galeria.headerLabel}
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <h1
              className="text-white font-bold leading-[0.88] tracking-tight"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "var(--hero-section)" }}
            >
              {t.galeria.headerTitle}
            </h1>
          </AnimateIn>
          <AnimateIn delay={150}>
            <p className="text-white/55 text-[15px] sm:text-base max-w-xl leading-[1.75] mt-8 border-t border-white/12 pt-7">
              {t.galeria.headerDesc}
            </p>
          </AnimateIn>
        </div>
      </section>

      {/* ── Gallery (dark, immersive) ── */}
      <section className="py-12 lg:py-16 bg-[#0b0b0b]">
        <div className="max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
          <GaleriaClient photos={galleryPhotos} decorSrcs={DECOR_SRCS} />
        </div>
      </section>

      {/* ── Instagram CTA ── */}
      <section className="relative overflow-hidden border-t border-white/8">
        <Image
          src="/imagens/DaniGui_Adois_61.jpg"
          alt="Eventos Líquen Events no Instagram"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
        />
        <div className="absolute inset-0 bg-black/70" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0b0b0b] via-transparent to-[#0b0b0b]/60" />
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
            <p className="text-white/55 text-sm leading-relaxed mb-10 max-w-md">
              {t.galeria.instaText}
            </p>
            <a
              href="https://www.instagram.com/liquen.events"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-3 px-8 py-4 btn-shine bg-moss text-cream font-medium text-sm tracking-widest uppercase hover:bg-moss-dark hover:gap-5 transition-all duration-300"
            >
              @liquen.events →
            </a>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
