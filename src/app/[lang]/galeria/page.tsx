import type { Metadata } from "next";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import Link from "next/link";
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
import TILE_COLORS from "./tile-colors.json";

// Resolved server-side (from blur-map.json / image-dims.json / tile-colors.json)
// so those JSON maps never reach the gallery's client bundle — GaleriaClient
// only receives the handful of fields each photo actually needs.

// Semente da arrumação, decidida NO SERVIDOR.
//
// A galeria arruma-se de maneira diferente a cada build em vez de a cada
// visita, e é de propósito: /galeria é uma página estática (generateStaticParams
// no layout), por isso uma semente por pedido obrigaria a renderização
// dinâmica — trocar o HTML já pronto no CDN por um render por visitante, o
// oposto de "depressa".
//
// A alternativa que lá estava — sortear no cliente e re-baralhar depois da
// hidratação — custava, medido, a troca das 12 fotos do primeiro ecrã a
// t=1178 ms e 398,9 KB descarregados e deitados fora (57,8% dos bytes de
// imagem da aterragem), incluindo a foto pré-carregada do mosaico 2x2. Agora o
// HTML, as cores e os placeholders saem já na ordem final.
const ORDER_SEED = ":" + Math.floor(Math.random() * 0x7fffffff).toString(36);

/**
 * NENHUM MOSAICO É UM RECTÂNGULO LISO. Duas camadas, cada uma pelo seu preço.
 *
 * (1) COR, para as 427. A cor média de cada foto (tile-colors.json, gerado no
 *     build por scripts/pregen-gallery.mjs) entra como fundo do mosaico. São
 *     ~7 caracteres por foto.
 * (2) BLUR, só para a primeira janela. O blur é bonito mas pesado: medido,
 *     mandar os 427 na carga da página custa +21,4 KB comprimidos (55,1 KB
 *     contra 33,7 KB) e atrasa a PRIMEIRA fotografia de 3,4 s para 4,2 s num
 *     telemóvel a 1,6 Mbit/s (3 corridas cada). Por isso vai só para as fotos
 *     que se vêem já.
 *
 * Estavam 30 blurs e mais nada — e as 30 eram escolhidas na ordem POR DEFEITO
 * enquanto o cliente re-baralhava para outra, por isso 0 das 12 primeiras fotos
 * que o visitante via tinham placeholder e 405 das 427 não tinham nada. Num
 * scroll rápido com a cache fria isso media 90,4% da área de mosaicos no ecrã
 * em rectângulo liso. Agora a janela é calculada na MESMA ordem que o visitante
 * vai ver (ORDER_SEED), e o resto tem cor.
 */
const BLUR_WINDOW = 48;
const withRatio = PHOTOS.map((p) => ({
  ...p,
  aspectRatio: aspectFor(p.src),
  color: (TILE_COLORS as Record<string, string>)[p.src],
}));
const blurSrc = new Set(
  interleaveByCollection(withRatio, ORDER_SEED)
    .slice(0, BLUR_WINDOW)
    .map((p) => p.src),
);
const galleryPhotos = withRatio.map((p) =>
  blurSrc.has(p.src) ? { ...p, blurDataURL: blurFor(p.src).blurDataURL } : p,
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
      {/*
        DESLIGA O RESTAURO DE SCROLL DO BROWSER — E TEM DE SER AQUI, no HTML.
        Esta uma linha é a diferença entre o restauro da galeria funcionar e
        fazer o contrário do que promete; o resto vive em GaleriaClient (ver a
        nota longa junto a POS_PREFIX).

        O browser tenta restaurar a posição LOGO A SEGUIR à primeira disposição
        da página — medido, o primeiro frame afectado é t=11 ms —, muito antes
        de o pacote da galeria sequer ter descarregado. Nessa altura o
        documento só tem as INITIAL_PAGE=12 fotos do HTML, portanto uma posição
        de 51 800 px é cortada para o fim de um documento de 8 646 px. Pôr o
        `manual` dentro do componente chegava tarde: com o CPU estrangulado 4x
        a hidratação mediu-se a t≈2 086 ms, e no meio ficava um restauro do
        browser que arrastava a página até ao fundo (225 865 px, as 427 fotos
        montadas) por alimentar o sentinela do scroll infinito a cada passagem.

        Não é `<Script>` do next/script de propósito: qualquer estratégia dele
        (mesmo `beforeInteractive`) corre depois desta janela.
      */}
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if('scrollRestoration' in history)history.scrollRestoration='manual'}catch(e){}`,
        }}
      />
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.galeria, path: "/galeria" }]}
      />

      {/* ── Immersive hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero image runs to the
          very top behind the transparent navbar (no white strip / hairline). */}
      <section className="relative -mt-24 min-h-[100svh] lg:min-h-[80svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <HeroImage
            src="/imagens/DaniGui_Preview20.jpg"
            alt={t.common.imageAlt.galeriaHeader}
            fill
            priority
            sizes="100vw"
            quality={75}
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/DaniGui_Preview20.jpg")}
          />
        </Parallax>
        {/* Image-first: a gentle bottom scrim keeps the caption legible without
            leaving a heavy opaque band — so the cover flows straight into the
            (dark) gallery photos below, with no black line between them. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/75 via-transparent to-transparent" />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.galeria.headerLabel}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
                {t.galeria.headerTitle}
              </h1>
              <p className="mt-3 text-white/75 text-[12.5px] leading-[1.6] max-w-sm">
                {t.galeria.headerDesc}
              </p>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Gallery (dark, immersive) ── */}
      {/* Full-bleed (SpaceX-style): sem wrapper max-w/px — a masonry corre de
          borda a borda, só com o gap-0.5 interno entre fotos. O chrome dos
          filtros traz o seu próprio padding lateral (ver GaleriaClient). */}
      <section className="pb-12 lg:pb-16 bg-[#0b0b0b]">
        <GaleriaClient photos={galleryPhotos} dict={t.galeria} orderSeed={ORDER_SEED} />
      </section>

      {/* ── Instagram CTA ── */}
      <section className="relative overflow-hidden">
        <SafeImage
          src="/imagens/DaniGui_Adois_61.jpg"
          alt={t.common.imageAlt.galeriaInstagram}
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
              "linear-gradient(to right, rgba(8,8,8,0.85), rgba(8,8,8,0.35), transparent), linear-gradient(rgba(0,0,0,0.2), rgba(0,0,0,0.2))",
          }}
        />
        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 py-20 lg:py-28">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.48em] uppercase mb-8 flex items-center gap-3">
              <span className="w-5 h-px bg-gold flex-shrink-0" />
              {t.galeria.instaEyebrow}
            </p>
            <h2 className="text-white text-4xl lg:text-5xl font-bold uppercase tracking-display mb-5">
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
              {/* Interlink to the services hub — moves a visitor browsing the
                  portfolio toward the offering, and gives crawlers a keyworded
                  path from /galeria into /servicos. */}
              <Link href={localizeHref("/servicos", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.verServicos} <span aria-hidden>→</span>
              </Link>
              <a
                href="https://www.instagram.com/liquen.events"
                target="_blank"
                rel="noopener noreferrer"
                className={OUTLINE_LIGHT_BUTTON_CLASS}
              >
                @liquen.events <span aria-hidden>→</span>
                <span className="sr-only"> ({t.common.newWindow})</span>
              </a>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
