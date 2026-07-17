import Link from "next/link";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import { blurFor } from "@/lib/blur";
import ClientMarquee from "@/components/ClientMarquee";
import HeroWebGL from "@/components/motion/HeroWebGL";
import Reveal from "@/components/motion/Reveal";
import TiltCard from "@/components/motion/TiltCard";
import PhotoWall from "@/components/motion/PhotoWall";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { PRIMARY_BUTTON_DARK_CLASS, OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";

// Each tile links to a distinct destination that matches its label
// (Corporativos / Casamentos / Privados) — the first two deep-link to their
// dedicated service pages, the third to the celebrations category.
const serviceLinks = [
  { image: "/imagens/EW1_1408.jpg", href: "/servicos/eventos-corporativos" },
  { image: "/imagens/DaniGui_Preview20.jpg", href: "/servicos/casamentos" },
  { image: "/imagens/DaniGui_JantarFesta_27.jpg", href: "/servicos#celebracoes" },
];

// Curated set for the 3D photo wall + its flat-ribbon fallback. EVERY photo is
// landscape (~1.5:1) to match the carousel's frames — the old set was half
// portraits, which the 1.5:1 plane cropped into thin slices (looked cheap).
// Wedding-led with two aerials interleaved for scale/drama.
const ribbon = [
  "/imagens/DaniGui_Preview12.jpg",
  "/imagens/J&P-DJI_20250628174247_0187_D.jpg",
  "/imagens/ines-goncalo-282.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
  "/imagens/M&F0678.jpg",
  "/imagens/J&P-4B6A1405.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/DaniGui_Preview79.jpg",
  "/imagens/stephanie-mizio-834.jpg",
  "/imagens/J&P-IMGL4767.jpg",
  "/imagens/DaniGui_JantarFesta_48.jpg",
  "/imagens/ines-goncalo-421.jpg",
];

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const services = serviceLinks.map((s, i) => ({ ...s, ...t.home.services[i] }));
  return (
    <>
      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed
          behind the transparent fixed navbar. */}
      <section className="relative -mt-24 min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
            {...blurFor("/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg")}
            alt={t.common.imageAlt.homeHero}
            fill
            preload
            sizes="100vw"
            className="object-cover object-center hero-settle"
          />
        </Parallax>
        {/* WebGL layer over the static hero image (fades in when ready; absent
            under reduced motion / no-WebGL). */}
        <HeroWebGL
          src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
          className="absolute inset-0 h-full w-full"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/92 via-[#080808]/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        {/* Full-SpaceX hero caption: small and tucked at the bottom-left so the
            photograph owns the first screen. Still the page's single <h1>. */}
        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-14 lg:pb-20">
          <AnimateIn>
            <div className="max-w-md">
              <p className="text-white/70 text-[10px] tracking-[0.5em] uppercase mb-3 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {t.home.eyebrow}
              </p>
              <h1 className="text-white font-semibold uppercase tracking-[0.16em] text-[18px] sm:text-[21px] leading-snug">
                {t.home.heroLines.map((l) => l.words.join(" ")).join(" ")}
              </h1>
              <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
                <TrackedLink
                  href={localizeHref("/orcamento", locale)}
                  trackProps={{ source: "hero" }}
                  className="inline-flex items-center gap-1.5 text-white/85 text-[10px] tracking-[0.28em] uppercase border-b border-white/30 pb-1 transition-colors hover:border-white hover:text-white"
                >
                  {t.common.pedirOrcamento} <span aria-hidden>→</span>
                </TrackedLink>
                <Link
                  href={localizeHref("/galeria", locale)}
                  className="inline-flex items-center gap-1.5 text-white/85 text-[10px] tracking-[0.28em] uppercase border-b border-white/30 pb-1 transition-colors hover:border-white hover:text-white"
                >
                  {t.common.verGaleria} <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </AnimateIn>
        </div>

        <div className="absolute bottom-8 right-6 lg:right-16 z-10 hidden sm:flex flex-col items-center gap-3 anim-3">
          <span className="text-white/75 text-[9px] tracking-[0.5em] uppercase [writing-mode:vertical-rl]">
            {t.home.scroll}
          </span>
          <div className="h-10 w-px overflow-hidden">
            <div className="w-full h-full bg-gradient-to-b from-white/50 to-transparent animate-scroll-line" />
          </div>
        </div>
      </section>

      {/* ── Clients marquee ── */}
      <ClientMarquee />

      {/* ── Services — minimal image tiles ── */}
      <section className="py-16 lg:py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-8 lg:mb-12">
              {/* Cabeçalho de secção (h2): dá à grelha de serviços um heading
                  de nível 2, para os títulos dos cartões (h3) deixarem de
                  saltar de h1 → h3. Estilo idêntico ao antigo <p> (o reset do
                  Tailwind zera tamanho/margem dos headings). */}
              <h2 className="text-foreground/68 text-[10px] tracking-[0.4em] uppercase flex items-center gap-3 font-normal">
                <span className="w-8 h-px bg-gold/60 flex-shrink-0" />
                {t.home.servicesEyebrow}
              </h2>
              <Link
                href={localizeHref("/servicos", locale)}
                className="group text-xs text-foreground/72 hover:text-moss transition-colors flex items-center gap-1.5"
              >
                {t.common.verServicos}
                <span
                  className="group-hover:translate-x-0.5 transition-transform inline-block"
                  aria-hidden
                >
                  →
                </span>
              </Link>
            </div>
          </AnimateIn>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {services.map((s, i) => (
              <Reveal key={s.title} variant="mask" delay={i * 0.08}>
                <TiltCard>
                  <Link
                    href={localizeHref(s.href, locale)}
                    className="group relative block overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
                    style={{ aspectRatio: "3/4" }}
                  >
                    <Image
                      src={s.image}
                      alt=""
                      fill
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      {...blurFor(s.image)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent group-hover:from-black/70 transition-all duration-500" />
                    {/* Cursor-tracked specular sheen (reads --mx/--my from TiltCard). */}
                    <span
                      aria-hidden
                      data-sheen
                      className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                      style={{
                        background:
                          "radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.5), transparent 62%)",
                        mixBlendMode: "soft-light",
                      }}
                    />
                    <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-6">
                      <p className="text-cream/75 text-[9px] sm:text-[10px] tracking-[0.35em] uppercase mb-1">
                        {s.tag}
                      </p>
                      <h3
                        className="text-cream text-base sm:text-lg lg:text-2xl font-bold group-hover:text-moss transition-colors duration-200"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {s.title}
                      </h3>
                    </div>
                  </Link>
                </TiltCard>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery photo wall — 3D curved carousel (flat ribbon fallback) ── */}
      <PhotoWall
        images={ribbon.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }))}
        href={localizeHref("/galeria", locale)}
        label={t.common.verGaleria}
        eyebrow={t.home.wallEyebrow}
        title={t.home.wallTitle}
      />

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Parallax speed={0.1} className="absolute inset-0">
          <Image
            src="/imagens/JOAO_E_PEDRO_1Y1A3450.jpg"
            alt={t.common.imageAlt.homeWedding}
            fill
            sizes="100vw"
            className="object-cover object-center scale-110"
            {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3450.jpg")}
          />
        </Parallax>
        <div className="absolute inset-0 bg-black/48" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.home.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
          </AnimateIn>
          <h2
            className="text-white font-bold leading-[0.9] tracking-tight mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 8vw, 116px)" }}
          >
            <TitleReveal text={t.home.ctaTitleLine1} as="span" className="block" />
            <TitleReveal
              text={t.home.ctaTitleLine2}
              as="span"
              className="block text-moss"
              delay={220}
            />
          </h2>
          <AnimateIn delay={110}>
            <p className="text-white/70 text-base leading-relaxed max-w-md mb-12">
              {t.home.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "home-cta" }}
                className={PRIMARY_BUTTON_DARK_CLASS}
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
              <Link href={localizeHref("/galeria", locale)} className={OUTLINE_LIGHT_BUTTON_CLASS}>
                {t.common.verGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
