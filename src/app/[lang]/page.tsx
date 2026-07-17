import Link from "next/link";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import TitleReveal from "@/components/TitleReveal";
import { blurFor } from "@/lib/blur";
import ClientMarquee from "@/components/ClientMarquee";
import HeroWebGL from "@/components/motion/HeroWebGL";
import PhotoWall from "@/components/motion/PhotoWall";
import { PHOTOS } from "./galeria/photos-data";
import { ratioFor } from "@/lib/image-meta";
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

// Landscape-only pool for the photo wall. The 12 curated frames above are the
// spine; we widen the pool with a spread of landscape gallery photos (filtered
// to ≥1.4:1 so the wide frames never crop to a sliver) so PhotoWall can shuffle
// and sample a fresh cut on every visit. Blur placeholders are ~150 B each, so
// this ~30-image pool adds only a few KB to the flight payload.
const WALL_RATIO_MIN = 1.4;
// Even spread across a category so the pool doesn't cluster on one photo series.
function spreadPick(arr: string[], n: number): string[] {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  return Array.from({ length: n }, (_, i) => arr[Math.floor(i * step)]);
}
const landscapeByLabel = (label: string, n: number) =>
  spreadPick(
    PHOTOS.filter((p) => p.label === label && ratioFor(p.src) >= WALL_RATIO_MIN).map((p) => p.src),
    n,
  );
const wallPool = Array.from(
  new Set([
    ...ribbon,
    ...landscapeByLabel("Casamento", 12),
    ...landscapeByLabel("Corporativo", 5),
    ...landscapeByLabel("Evento", 4),
    ...landscapeByLabel("Aéreo", 2),
  ]),
);

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
        {/* Two hero veils merged into one layer (multiple backgrounds paint
            first-listed on top, so the former upper div is listed first): same
            pixels, one paint/composite pass instead of two. */}
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
      <section className="py-20 lg:py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-10 lg:mb-14">
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
          {/* Full-SpaceX tiles: the photograph carries each card. One light
              bottom-gradient veil (matches the hero + /servicos panels), a small
              tucked caption in the sans, and a single restrained hover — no tilt,
              sheen or accent swaps. */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {services.map((s, i) => (
              <AnimateIn key={s.title} delay={i * 90}>
                <Link
                  href={localizeHref(s.href, locale)}
                  className="group relative block overflow-hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white/80"
                  style={{ aspectRatio: "3/4" }}
                >
                  <Image
                    src={s.image}
                    alt=""
                    fill
                    sizes="(max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 384px"
                    className="object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    {...blurFor(s.image)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/20 to-transparent" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6">
                    <p className="text-white/60 text-[10px] tracking-[0.4em] uppercase mb-2">
                      {s.tag}
                    </p>
                    {/* Mobile: two-column tiles are only ~127px wide inside the
                        padding, so the longest title ("Corporativos", 12 letters)
                        overflowed the tile's overflow-hidden edge with the full
                        0.16em tracking. Ease the size + tracking on small screens;
                        restore the airy sizing from sm up where the tiles widen. */}
                    <h3 className="text-white font-semibold uppercase tracking-[0.12em] sm:tracking-[0.16em] text-[13px] sm:text-[17px] leading-snug">
                      {s.title}
                    </h3>
                  </div>
                </Link>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Gallery photo wall — 3D curved carousel (flat ribbon fallback) ── */}
      <PhotoWall
        images={wallPool.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }))}
        href={localizeHref("/galeria", locale)}
        label={t.common.verGaleria}
        eyebrow={t.home.wallEyebrow}
        title={t.home.wallTitle}
      />

      {/* ── CTA — full-screen closing panel (matches /servicos) ── */}
      <section
        className="relative overflow-hidden border-t border-foreground/8 flex items-center py-28 lg:py-40"
        style={{ minHeight: "clamp(560px, 90vh, 900px)" }}
      >
        <Image
          src="/imagens/JOAO_E_PEDRO_1Y1A3450.jpg"
          alt={t.common.imageAlt.homeWedding}
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3450.jpg")}
        />
        {/* Wash + gradient merged into one layer (gradient listed first = on
            top, matching the former div order). Same look, one paint pass. */}
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
