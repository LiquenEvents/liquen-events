import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import HeroImage from "@/components/HeroImage";
import TrackedLink from "@/components/TrackedLink";
import AnimateIn from "@/components/AnimateIn";
import Parallax from "@/components/Parallax";
import Reveal from "@/components/motion/Reveal";
import { PHOTO_REVEAL_FULL_S, staggerMs } from "@/lib/motion/tokens";
import { blurFor } from "@/lib/blur";
import ClientMarquee from "@/components/ClientMarquee";
import HeroWebGL from "@/components/motion/HeroWebGL";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { OUTLINE_LIGHT_BUTTON_CLASS } from "@/lib/ui-classes";

// Each tile links to a distinct destination that matches its label
// (Corporativos / Casamentos / Privados) — the first two deep-link to their
// dedicated service pages, the third to the celebrations category.
// Full-screen SpaceX-style chapters crop landscape (desktop viewport), so every
// image here is a wide ~1.5:1 frame — EW1_1408 and JantarFesta_27 were portraits
// that centre-cropped to a sliver, so they're swapped for landscape siblings.
const serviceLinks = [
  { image: "/imagens/DaniGui_Preview20.jpg", href: "/servicos/casamentos" },
  { image: "/imagens/EW1_1332.jpg", href: "/servicos/eventos-corporativos" },
  { image: "/imagens/DaniGui_JantarFesta_26.jpg", href: "/servicos#celebracoes" },
];

// Same "continuous fade between images" veil as /serviços (PANEL_VEIL there):
// darkens the bottom (0.75 — keeps the caption legible) AND fades in at the very
// top (0.55), so each full-bleed chapter blends into the one above instead of
// meeting it at a hard seam. The old scrim darkened only the bottom (top 0.05),
// which left a visible bright/dark edge between stacked panels.
const PANEL_VEIL =
  "linear-gradient(to top, rgba(8,8,8,0.75) 0%, rgba(8,8,8,0.20) 38%, rgba(8,8,8,0.16) 58%, rgba(8,8,8,0.55) 100%)";

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
        <Parallax speed={0.14} drift className="absolute inset-0">
          <HeroImage
            src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
            {...blurFor("/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg")}
            alt={t.common.imageAlt.homeHero}
            fill
            priority
            sizes="100vw"
            quality={75}
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
            <div className="max-w-2xl">
              {/* The site's emotional promise, in the SpaceX display lettering:
                  big uppercase sans with tight (tracking-display) spacing. The
                  moss highlight on the closing word (flagged in the dictionary)
                  is honoured here. Kept bottom-left and photo-first so the SpaceX
                  composition still holds. */}
              <h1
                className="text-white font-bold uppercase tracking-display leading-[0.95]"
                style={{ fontSize: "clamp(40px, 7vw, 88px)" }}
              >
                {t.home.heroLines.map((l, i) => (
                  <span key={i} className={`block ${l.moss ? "text-moss" : ""}`}>
                    {l.words.join(" ")}
                  </span>
                ))}
              </h1>
              <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-2">
                {/* Primary hero actions. Small 9px label on phones (the py-2
                    still keeps a ≥40px tap target and the underline keeps the
                    minimal look); 10px from sm up. */}
                <TrackedLink
                  href={localizeHref("/orcamento", locale)}
                  trackProps={{ source: "hero" }}
                  className="inline-flex items-center gap-1.5 text-white/85 text-[9px] sm:text-[10px] tracking-[0.28em] uppercase border-b border-white/30 py-2 sm:pb-1 sm:py-0 transition-colors hover:border-white hover:text-white"
                >
                  {t.common.pedirOrcamento} <span aria-hidden>→</span>
                </TrackedLink>
                <Link
                  href={localizeHref("/galeria", locale)}
                  className="inline-flex items-center gap-1.5 text-white/85 text-[9px] sm:text-[10px] tracking-[0.28em] uppercase border-b border-white/30 py-2 sm:pb-1 sm:py-0 transition-colors hover:border-white hover:text-white"
                >
                  {t.common.verGaleria} <span aria-hidden>→</span>
                </Link>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Clients marquee ── */}
      <ClientMarquee />

      {/* ── Serviços — capítulos SpaceX de ecrã inteiro ──
          Cada serviço é um painel full-bleed (100vw) de altura quase-total,
          empilhado verticalmente à maneira do spacex.com: fotografia a sangrar
          de bordo a bordo, sem goteiras nem cantos redondos, com a legenda
          (eyebrow + título maiúsculo + botão delineado) ancorada em baixo à
          esquerda sobre um scrim. Os títulos são <h2> (h1 do herói → h2 por
          capítulo), mantendo a hierarquia de headings. */}
      {services.map((s, i, arr) => (
        <section
          key={s.title}
          // A altura real era `h-[86svh] min-h-[560px]`, ou seja `max(86svh,
          // 560px)`, mas o espaço reservado dizia só `86svh`. Coincidem no
          // telemóvel comum (86svh ≈ 722 px), mas num ecrã com menos de 651 px
          // de altura — um telemóvel deitado — o piso de 560 px ganhava e o
          // capítulo crescia ao ser desenhado. Agora as três medidas (altura,
          // altura mínima e reserva) saem todas de `--cv-h`.
          // `-mb-px` fecha a costura entre capítulos.
          //
          // A altura é `max(86svh, 560px)` e dá quase sempre um número
          // FRACCIONÁRIO. Quando duas caixas dessas se encostam, há browsers e
          // níveis de zoom em que o arredondamento deixa passar uma fatia de
          // menos de um pixel — e por essa fatia vê-se o fundo BRANCO da
          // página, que entre duas fotografias escuras se lê como uma risca
          // clara de bordo a bordo.
          //
          // Honestamente: NÃO consegui reproduzi-la aqui. Varri as três
          // fronteiras em dez tamanhos de ecrã e medi o brilho linha a linha —
          // nenhuma risca (a fronteira é um degrau de 29 para 53 de brilho, sem
          // pico). Mas o mecanismo é conhecido e depende do arredondamento do
          // browser, portanto a ausência aqui não prova a ausência no ecrã
          // dela. Sobrepor um pixel elimina a possibilidade em vez de a
          // perseguir, não custa nada visível (é 1 px do fundo de uma foto de
          // sangria inteira) e não mexe no espaço reservado do
          // `contain-intrinsic-size`, que é a caixa de conteúdo.
          className="cv-panel relative -mb-px h-[var(--cv-h)] w-full overflow-hidden [--cv-h:max(86svh,560px)]"
        >
          {/* The photograph settles in as the chapter enters — a slow cinematic
              zoom-out (scale 1.08 → 1) with a fade. Pure transform + opacity, so
              it's GPU-composited and stays buttery at 60fps on these full-bleed
              photos (the old clip-path wipe repainted and stuttered). One-shot and
              reduced-motion-safe (Reveal renders the finished state). */}
          <Reveal
            as="div"
            variant="zoom"
            duration={PHOTO_REVEAL_FULL_S}
            className="absolute inset-0"
            start="top 88%"
          >
            <SafeImage
              src={s.image}
              alt=""
              fill
              sizes="100vw"
              quality={75}
              className="object-cover object-center"
              {...blurFor(s.image)}
            />
          </Reveal>
          {/* A imagética da SpaceX é escura por natureza; as nossas fotos podem
              ser claras, por isso um scrim inferior-esquerdo mantém a legenda
              maiúscula legível sem depender de sombra no texto. */}
          <div aria-hidden className="absolute inset-0" style={{ backgroundImage: PANEL_VEIL }} />
          <div className="absolute inset-x-0 bottom-0">
            <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-16 pb-[11svh] lg:pb-[13svh]">
              {/* The caption composes itself in a 3-beat cadence (gold eyebrow →
                  title → CTA) rather than appearing as one block — a small
                  stagger reads as "authored" without feeling slow. */}
              <Reveal as="div" stagger start="top 92%">
                <h2
                  className="text-veil-shadow text-white font-bold uppercase tracking-display leading-[0.95]"
                  style={{ fontSize: "clamp(24px, 3.4vw, 42px)" }}
                >
                  {s.title}
                </h2>
                <Link
                  href={localizeHref(s.href, locale)}
                  className="mt-6 sm:mt-8 inline-flex items-center gap-2 sm:gap-3 border border-white/70 text-white text-[10px] sm:text-[11px] tracking-[0.18em] sm:tracking-[0.3em] uppercase px-5 py-2.5 sm:px-8 sm:py-3.5 hover:bg-white hover:text-[#0c0e0b] hover:border-white transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
                >
                  {t.common.verServicos}
                  <span aria-hidden>→</span>
                </Link>
              </Reveal>
            </div>
          </div>
          {/* Seta ao estilo SpaceX ancorada ao centro-baixo, pulsando (fadeBounce
              via .scroll-chevron; respeita prefers-reduced-motion). Decorativa e
              sem captura de ponteiro. Omitida no último capítulo — nada de
              relevante fica logo abaixo antes do photo wall. */}
          {i < arr.length - 1 && (
            <svg
              aria-hidden
              width="28"
              height="18"
              viewBox="0 0 28 22"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="scroll-chevron absolute bottom-6 left-1/2 -translate-x-1/2 z-10 text-white/70 pointer-events-none"
            >
              <path d="M2 5 L14 17 L26 5" />
            </svg>
          )}
        </section>
      ))}

      {/* ── CTA — full-screen closing panel (matches /servicos) ── */}
      <section
        // O `py-28 lg:py-40` mudou-se daqui para o bloco de conteúdo — ver a
        // nota igual em /servicos. Com o padding aqui, o espaço reservado para
        // o painel ficava 224 px acima da altura real e a home encolhia esses
        // 224 px na primeira descida.
        className="cv-panel relative overflow-hidden flex items-center [--cv-h:clamp(560px,90vh,900px)]"
      >
        <SafeImage
          src="/imagens/JOAO_E_PEDRO_1Y1A4463.jpg"
          alt={t.common.imageAlt.homeWedding}
          fill
          sizes="100vw"
          quality={75}
          className="object-cover object-center"
          {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A4463.jpg")}
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

        <div className="text-veil-shadow relative z-10 max-w-7xl mx-auto px-6 lg:px-16 py-28 lg:py-40 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/70 text-[10px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {t.home.ctaEyebrow}
            </p>
          </AnimateIn>
          {/* Block rise (not word-by-word): the finale now speaks the same
              headline dialect as the hero and chapters, so the journey resolves
              calmly instead of escalating into a fussy per-word reveal at the end. */}
          <AnimateIn>
            <h2
              className="text-white font-bold uppercase tracking-display leading-[0.9] mb-6"
              style={{ fontSize: "clamp(32px, 5.5vw, 78px)" }}
            >
              <span className="block">{t.home.ctaTitleLine1}</span>
              <span className="block text-moss">{t.home.ctaTitleLine2}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={staggerMs(1)}>
            <p className="text-white/70 text-base leading-relaxed max-w-md mb-12">
              {t.home.ctaText}
            </p>
          </AnimateIn>
          <AnimateIn delay={staggerMs(2)}>
            <div className="flex flex-wrap gap-4 justify-center">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "home-cta" }}
                className={OUTLINE_LIGHT_BUTTON_CLASS}
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
