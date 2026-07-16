import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import KineticHeading from "@/components/KineticHeading";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import Magnetic from "@/components/motion/Magnetic";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";

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
    image: "/imagens/M&F0497.jpg",
    keywords: ["decoração de eventos Alentejo", "sobre Líquen Events"],
    ogLocale: t.meta.ogLocale,
  });
}

const gallery = [
  {
    src: "/imagens/J&A-68.jpg",
    cls: "col-span-2 row-span-2",
    alt: "Cerimónia de casamento ao ar livre numa herdade do Alentejo",
  },
  {
    src: "/imagens/matilde-e-tomas0654-1.jpg",
    cls: "col-span-2",
    alt: "Festa de casamento sob luzes suspensas ao anoitecer",
  },
  {
    src: "/imagens/DaniGui_Adois_61.jpg",
    cls: "col-span-1",
    alt: "Noivos abraçados durante a celebração do casamento",
  },
  {
    src: "/imagens/stephanie-mizio-350.jpg",
    cls: "col-span-1",
    alt: "Mesa posta de casamento com flores e velas",
  },
  {
    src: "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
    cls: "col-span-2",
    alt: "Casamento ao entardecer ao ar livre no Alentejo",
  },
  {
    src: "/imagens/ines-goncalo-252.jpg",
    cls: "col-span-2",
    alt: "Decoração floral de cerimónia de casamento no Alentejo",
  },
];

const eyebrowLight =
  "text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center gap-3";
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
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/JOAO_E_PEDRO_1Y1A3204.jpg"
            alt={t.common.imageAlt.sobreCelebration}
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
            {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3204.jpg")}
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL
          src="/imagens/JOAO_E_PEDRO_1Y1A3204.jpg"
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-black/45" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/20 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-16 lg:pb-28 pt-40">
          <AnimateIn>
            <p className={`${eyebrowLight} mb-8`}>
              <span className="w-8 h-px bg-gold flex-shrink-0" />
              {t.sobre.heroEyebrow}
            </p>
          </AnimateIn>
          <KineticHeading
            className="text-white font-bold leading-[0.88] tracking-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "var(--hero-display)" }}
            lines={[[{ text: t.sobre.heroTitlePre }, { text: t.sobre.heroTitleMoss, moss: true }]]}
          />
        </div>

        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 pointer-events-none">
          <span className="text-white/60 text-[8px] tracking-[0.45em] uppercase">
            {t.sobre.scroll}
          </span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ── MANIFESTO — short statement + image ── */}
      <section className="py-20 lg:py-32 bg-surface">
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
            <div className="relative aspect-[4/5] overflow-hidden rounded-2xl">
              <Image
                src="/imagens/DaniGui_Preview12.jpg"
                alt={t.common.imageAlt.sobrePortrait}
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover"
                {...blurFor("/imagens/DaniGui_Preview12.jpg")}
              />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── EDITORIAL PHOTO GRID ── */}
      <section className="bg-surface">
        <Reveal
          as="div"
          variant="mask"
          stagger
          className="grid grid-cols-2 lg:grid-cols-4 gap-1.5 p-1.5 auto-rows-[150px] sm:auto-rows-[210px] lg:auto-rows-[260px]"
        >
          {gallery.map((g, i) => (
            <div key={i} className={`relative overflow-hidden group ${g.cls}`}>
              <Image
                src={g.src}
                alt={t.sobre.galleryAlt[i] ?? g.alt}
                fill
                sizes="(max-width: 768px) 50vw, 50vw"
                className="object-cover transition-transform duration-[1.2s] ease-out group-hover:scale-105"
                {...blurFor(g.src)}
              />
              <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
            </div>
          ))}
        </Reveal>
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
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]/50" />
        <div className="relative z-10 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 w-full py-20 lg:py-28">
            <p
              className="text-cream font-bold leading-[1.12] max-w-4xl"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 4.5vw, 64px)" }}
            >
              <TitleReveal text={t.sobre.statementLead} as="span" step={50} />{" "}
              <TitleReveal
                text={t.sobre.statementRest}
                as="span"
                className="text-cream/40"
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
          <div className="relative flex items-center justify-center px-6 py-14 lg:py-0 min-h-[440px] lg:min-h-[560px]">
            <div className="relative w-full max-w-[340px] aspect-[3/4] overflow-hidden rounded-2xl shadow-2xl shadow-black/25 ring-1 ring-foreground/5">
              <Image
                src="/imagens/catarina-gaspar.jpg"
                alt={t.common.imageAlt.sobreFounder}
                fill
                sizes="(max-width: 1024px) 80vw, 340px"
                className="object-cover"
                {...blurFor("/imagens/catarina-gaspar.jpg")}
              />
            </div>
          </div>
          <div className="flex flex-col justify-center px-6 lg:px-16 py-16 lg:py-28">
            <AnimateIn>
              <p className={`${eyebrowDark} mb-10`}>
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {t.sobre.founderEyebrow}
              </p>
              <span
                className="block text-moss/25 text-6xl font-bold leading-none mb-6"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                &ldquo;
              </span>
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
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.sobre.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
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
            <p className="text-white/60 text-base leading-relaxed max-w-md mb-12">
              {t.sobre.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <Magnetic strength={0.4}>
              <Link
                href={localizeHref("/contacto", locale)}
                className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-white font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
              >
                {t.common.entrarContacto} →
              </Link>
            </Magnetic>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
