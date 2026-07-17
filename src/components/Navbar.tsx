"use client";

import { useState, useEffect, useRef, memo, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";
import Magnetic from "@/components/motion/Magnetic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { SITE } from "@/lib/site";
import { localizeHref } from "@/lib/i18n";
import { track } from "@/lib/track";

// House easing — the same expressive cubic-bézier used across the site's
// reveals (galeria, heroes, link-line). Kept as a constant so the mobile-menu
// cascade shares the exact motion signature of the rest of the brand.
const MENU_EASE = "cubic-bezier(0.16,1,0.3,1)";

// ── Hairline stroke icons for the overlay's contact + social block. Language-
// neutral affordances (an envelope reads the same in PT and EN), drawn to match
// the site's thin-line motif. Purely decorative — labelled by their parent <a>. ──
// memo: these four are prop-less, so memoizing lets React skip reconciling their
// SVG subtrees entirely when the Navbar re-renders on scroll (scrolled/hidden).
const IconMail = memo(function IconMail() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="m3.5 6.5 8.5 6 8.5-6" />
    </svg>
  );
});
const IconPhone = memo(function IconPhone() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6.5 3.5h3l1.4 3.9-2 1.4a12 12 0 0 0 4.9 4.9l1.4-2 3.9 1.4v3a1.8 1.8 0 0 1-1.9 1.8A15.8 15.8 0 0 1 4.7 5.4 1.8 1.8 0 0 1 6.5 3.5Z" />
    </svg>
  );
});
const IconInstagram = memo(function IconInstagram() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.7" />
      <circle cx="17" cy="7" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
});
const IconFacebook = memo(function IconFacebook() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.35"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M14.5 8.5V6.8c0-.8.3-1.3 1.4-1.3h1.4V2.7A18 18 0 0 0 15 2.5c-2.3 0-3.9 1.4-3.9 4v2h-2.6v3h2.6v8h3.4v-8h2.4l.5-3Z" />
    </svg>
  );
});

// Ordem do menu — define a DIREÇÃO das transições de página: navegar para um
// item mais à frente desliza para a esquerda (avançar), voltar atrás desliza
// para a direita. Ver PageTransition + .vt-page-fwd/bwd em globals.css.
const NAV_ORDER = ["/", "/sobre", "/servicos", "/galeria", "/clientes", "/contacto"];
function orderIdx(path: string): number {
  if (path === "/") return 0;
  const i = NAV_ORDER.findIndex((o) => o !== "/" && (path === o || path.startsWith(`${o}/`)));
  return i === -1 ? 0 : i;
}

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [hidden, setHidden] = useState(false);
  const pathname = usePublicPathname();
  const { locale, t } = useTranslations();
  const reduce = useReducedMotion();

  // Staggered reveal for the overlay's blocks — a single source of truth so the
  // eyebrow, each link and the footer share the same cascade + easing. Under
  // prefers-reduced-motion everything simply cross-fades in place (no travel).
  const reveal = (delay: number): CSSProperties =>
    reduce
      ? {
          opacity: isOpen ? 1 : 0,
          transition: isOpen ? "opacity 0.3s ease" : "opacity 0.15s ease",
        }
      : {
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "none" : "translateY(24px)",
          transition: isOpen
            ? `opacity 0.6s ${MENU_EASE} ${delay}ms, transform 0.6s ${MENU_EASE} ${delay}ms`
            : "opacity 0.15s ease, transform 0.15s ease",
        };

  const links = [
    { href: "/sobre", label: t.nav.sobre },
    { href: "/servicos", label: t.nav.servicos },
    { href: "/galeria", label: t.nav.galeria },
    { href: "/clientes", label: t.nav.clientes },
  ];

  // Pages whose hero is a full-bleed dark image sitting *under* the transparent
  // navbar. On those, the unscrolled nav needs light text + a subtle scrim to
  // stay legible; white-topped pages (/servicos, /galeria, /orcamento, …) keep
  // the moss treatment. Once scrolled, the frosted backdrop takes over for all.
  const overDarkHero =
    pathname === "/" ||
    pathname === "/sobre" ||
    pathname === "/clientes" ||
    pathname === "/contacto" ||
    pathname === "/servicos" ||
    pathname === "/galeria" ||
    pathname.startsWith("/servicos/");
  // O overlay do menu mobile é escuro — com ele aberto o traço do botão e os
  // textos da barra precisam do tratamento claro, seja qual for a página.
  const light = (!scrolled && overDarkHero) || isOpen;

  const navTypes = (href: string) => [
    orderIdx(href) >= orderIdx(pathname) ? "nav-forward" : "nav-back",
  ];

  useEffect(() => {
    let frame = 0;
    let lastY = window.scrollY;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const y = window.scrollY;
        setScrolled(y > 30);
        // Hide when scrolling down past the hero, reveal on the first upward
        // intent — content gets the full stage, navigation is always one
        // gesture away. Small deltas are ignored so it never flickers.
        const delta = y - lastY;
        if (y < 200 || delta < -6) setHidden(false);
        else if (delta > 6) setHidden(true);
        lastY = y;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  // Fechar o menu se o viewport crescer até ao breakpoint de desktop (lg,
  // 1024px). Caso contrário `isOpen` fica preso a true: o overlay é escondido
  // por CSS (`lg:hidden`), mas o scroll-lock (body overflow:hidden +
  // data-menuOpen) mantém-se e o utilizador fica sem forma visível de o
  // fechar — o próprio botão hambúrguer é `lg:hidden`.
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const onChange = () => {
      if (mq.matches) setIsOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // Lock background scroll while the mobile menu is open. The body attribute
  // also hides floating UI (WhatsApp) via CSS so nada flutua sobre o menu.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.dataset.menuOpen = "true";
    // Hide the rest of the page from AT while the modal menu is open, so the
    // screen-reader virtual cursor can't wander into the background (WCAG 4.1.2).
    const main = document.getElementById("conteudo");
    const footer = document.querySelector("footer");
    main?.setAttribute("inert", "");
    footer?.setAttribute("inert", "");
    return () => {
      document.body.style.overflow = prev;
      delete document.body.dataset.menuOpen;
      main?.removeAttribute("inert");
      footer?.removeAttribute("inert");
    };
  }, [isOpen]);

  // Escape closes the overlay + traps Tab inside it (WAI-ARIA dialog pattern)
  // — the one full-screen menu in the codebase that didn't already follow the
  // gallery lightbox's focus-management. Focus moves to the first link on
  // open and back to the toggle button on close, so keyboard users never
  // land on a hidden/invisible element.
  const menuRef = useRef<HTMLDivElement>(null);
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const menu = menuRef.current;
    const focusables = () =>
      Array.from(
        menu?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    // Double rAF: the click that opened the menu is still asserting its own
    // (browser-default) focus on the toggle button through the first painted
    // frame — a single rAF loses that race and focus silently snaps back to
    // the button. Waiting a second frame reliably lands on the menu instead.
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => focusables()[0]?.focus());
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setIsOpen(false);
        toggleBtnRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <nav
      data-public-nav
      aria-label={t.nav.primaryLabel}
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[transform,background-color,border-color,box-shadow] duration-500 ${
        // NB: nada de "translate-y-0" no estado visível — QUALQUER transform no
        // nav cria um containing block e prenderia o overlay fixed inset-0 do
        // menu mobile à altura da barra em vez do viewport inteiro.
        hidden && !isOpen ? "-translate-y-full" : ""
      } ${
        // Fundo quase sólido (90%) em vez de translúcido + backdrop-blur: um
        // backdrop-filter num elemento fixo obriga o browser a voltar a
        // desfocar o conteúdo por trás da barra a CADA frame de scroll — um
        // custo real em dispositivos mais fracos. A 90% de opacidade o aspeto é
        // praticamente igual, mas o scroll deixa de o pagar. (Bónus: sem
        // backdrop-filter também desaparece o containing-block que prendia o
        // overlay fixed do menu mobile.)
        scrolled
          ? "bg-surface/90 border-b border-foreground/8 shadow-sm shadow-black/5"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      {/* Legibility scrim — only over dark hero images, fades to nothing */}
      {light && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/50 via-black/15 to-transparent"
        />
      )}
      {/* px-12 (not px-16) in the lg→xl band: at exactly 1024px the nav links and
          the right-side actions sat only ~4px apart (nearly touching). The extra
          32px of inner width opens that gap; alignment with page content
          (also lg:px-16) is restored at xl, where there's room. */}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-12 xl:px-16">
        <div
          className={`relative flex items-center justify-between transition-[height] duration-500 ${
            scrolled ? "h-[72px]" : "h-[140px]"
          }`}
        >
          <Link href={localizeHref("/", locale)} className="flex items-center shrink-0">
            <Image
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={210}
              height={125}
              className={`object-contain w-auto transition-[height] duration-500 ${scrolled ? "h-[46px] sm:h-[52px]" : "h-[76px] sm:h-[120px]"}`}
            />
          </Link>

          <div className="hidden lg:flex items-center gap-5 xl:gap-9">
            {links.map((link) => (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                transitionTypes={navTypes(link.href)}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`link-line py-1.5 -my-1.5 text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 ${
                  light
                    ? pathname === link.href
                      ? "text-white nav-active-light"
                      : "text-white/80 hover:text-white"
                    : pathname === link.href
                      ? "text-moss nav-active"
                      : "text-moss hover:text-moss-dark"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden lg:flex items-center gap-3">
            <LanguageToggle light={light} />
            <span
              className={`h-3 w-px ${light ? "bg-white/20" : "bg-foreground/15"}`}
              aria-hidden
            />
            <Link
              href={localizeHref("/contacto", locale)}
              transitionTypes={navTypes("/contacto")}
              className={`text-[11px] tracking-[0.2em] uppercase border px-5 py-2 transition-all duration-300 ${
                light
                  ? "border-white/50 text-white/90 hover:border-white/80 hover:bg-white/10"
                  : "border-moss/60 text-moss hover:border-moss/80 hover:bg-moss/10"
              }`}
            >
              {t.nav.contacto}
            </Link>
            <Magnetic strength={0.3}>
              <Link
                href={localizeHref("/orcamento", locale)}
                onClick={() => track("CTAClick", { source: "nav" })}
                className="text-[11px] tracking-[0.2em] uppercase btn-shine bg-moss text-white px-5 py-2 hover:bg-moss-dark transition-all duration-300"
              >
                {t.nav.pedirOrcamento} <span aria-hidden>→</span>
              </Link>
            </Magnetic>
          </div>

          {/* Mobile bar: keep the PT/EN toggle reachable without opening the
              menu — important for the international (destination-wedding)
              audience. Hidden while the menu is open (the overlay has its own). */}
          <div className="lg:hidden flex items-center gap-1 ml-auto">
            {!isOpen && <LanguageToggle light={light} />}
            <button
              ref={toggleBtnRef}
              className="p-3.5 -mr-2"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? t.nav.closeMenu : t.nav.menuLabel}
              aria-expanded={isOpen}
            >
              <span
                className={`block w-[18px] h-px transition-all duration-300 mb-1.5 ${light ? "bg-white/90" : "bg-foreground/70"} ${isOpen ? "rotate-45 translate-y-2" : ""}`}
              />
              <span
                className={`block w-[18px] h-px transition-all duration-300 mb-1.5 ${light ? "bg-white/90" : "bg-foreground/70"} ${isOpen ? "opacity-0" : ""}`}
              />
              <span
                className={`block w-[18px] h-px transition-all duration-300 ${light ? "bg-white/90" : "bg-foreground/70"} ${isOpen ? "-rotate-45 -translate-y-2" : ""}`}
              />
            </button>
          </div>
        </div>
      </div>

      {/* ── Menu mobile — overlay a ecrã inteiro, tipografia editorial em cascata.
          O logótipo e o X vivem na barra (z-10) e "atravessam" este painel, que
          fica em -z-10; por isso o overlay não repete o cabeçalho. ── */}
      <div
        ref={menuRef}
        role="dialog"
        aria-modal={isOpen}
        aria-label={t.nav.menuLabel}
        aria-hidden={!isOpen}
        className={`lg:hidden fixed inset-0 -z-10 flex flex-col bg-[#0d100c] transition-[opacity,visibility] duration-500 ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        }`}
      >
        {/* Atmosfera — três camadas estáticas que dão profundidade sem tocar na
            legibilidade: brilho musgo no topo (junto ao logótipo), um calor
            dourado muito ténue no canto inferior (por trás do CTA) e um
            escurecimento na base para os textos assentarem. O grão de filme
            global (body::before) passa por cima e unifica tudo. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_-10%,rgba(99,122,95,0.16),transparent_55%)]"
        />
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(85%_55%_at_12%_112%,rgba(214,171,58,0.08),transparent_60%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-44 bg-gradient-to-t from-black/45 to-transparent"
        />

        <nav
          aria-label={t.nav.menuLabel}
          className="relative flex-1 flex flex-col justify-center px-8 pt-28 pb-4 overflow-y-auto overscroll-contain"
        >
          {/* Eyebrow — motivo da casa (traço dourado + "MENU" muito espaçado),
              equilibrado à direita por uma legenda de marca (place names, iguais
              nas duas línguas). */}
          <div className="flex items-center justify-between mb-8" style={reveal(60)}>
            <p className="flex items-center gap-3 text-cream/35 text-[10px] tracking-[0.45em] uppercase">
              <span className="w-7 h-px bg-gold/70 flex-shrink-0" />
              {t.nav.menuLabel}
            </p>
            <span className="text-cream/25 text-[10px] tracking-[0.28em] uppercase">
              {SITE.city} · {SITE.region}
            </span>
          </div>

          {[...links, { href: "/contacto", label: t.nav.contacto }].map((link, i) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                transitionTypes={navTypes(link.href)}
                aria-current={active ? "page" : undefined}
                className="group relative flex items-center gap-4 sm:gap-6 py-4 border-b border-white/[0.06]"
                style={reveal(150 + i * 65)}
              >
                {/* Index — passa a marcador editorial: numeral dourado pequeno,
                    alinhado ao topo da inicial serifada, que acende no estado
                    ativo / hover. Largura fixa para as palavras alinharem. */}
                <span
                  className={`w-7 flex-shrink-0 self-start pt-[0.55rem] text-[10px] tracking-[0.25em] tabular-nums transition-colors duration-300 ${
                    active ? "text-gold" : "text-gold/40 group-hover:text-gold/80"
                  }`}
                >
                  0{i + 1}
                </span>

                <span
                  className={`leading-[1.02] tracking-[-0.01em] text-[clamp(30px,8.5vw,46px)] transition-[color,transform] duration-500 ${
                    active ? "text-moss-light" : "text-cream group-hover:text-white"
                  } ${reduce ? "" : "group-hover:translate-x-2 will-change-transform"}`}
                  style={{
                    fontFamily: "var(--font-playfair)",
                    transitionTimingFunction: MENU_EASE,
                  }}
                >
                  {link.label}
                </span>

                {/* Seta — chega da esquerda no hover; presente no item ativo. */}
                <span
                  aria-hidden
                  className={`ml-auto text-lg leading-none transition-all duration-500 ${
                    active
                      ? "text-moss-light opacity-100 translate-x-0"
                      : `text-cream/40 opacity-0 group-hover:opacity-100 ${reduce ? "" : "-translate-x-2 group-hover:translate-x-0"}`
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                >
                  →
                </span>

                {/* Traço que se desenha — reutiliza o motivo .link-line do site:
                    o hairline musgo cresce da esquerda no hover e fica desenhado
                    na página atual. Sob reduced-motion troca de estado sem animar. */}
                <span
                  aria-hidden
                  className={`pointer-events-none absolute inset-x-0 -bottom-px h-px bg-moss-light ${
                    reduce ? "" : "transition-transform duration-500"
                  } ${
                    active
                      ? "origin-left scale-x-100"
                      : "origin-right scale-x-0 group-hover:origin-left group-hover:scale-x-100 group-focus-visible:origin-left group-focus-visible:scale-x-100"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                />
              </Link>
            );
          })}
        </nav>

        {/* Bloco inferior — CTA premium + contactos + redes + idioma.
            paddingBottom soma o safe-area-inset-bottom (home indicator) ao
            espaçamento base — a auditoria assinalou que a base ignorava o inset. */}
        <div
          className="relative px-8 flex flex-col gap-6"
          style={{
            paddingBottom: "calc(2.25rem + env(safe-area-inset-bottom))",
            ...reveal(150 + 5 * 65 + 40),
          }}
        >
          <Link
            href={localizeHref("/orcamento", locale)}
            onClick={() => track("CTAClick", { source: "nav-mobile" })}
            className="group relative flex items-center justify-center gap-3 w-full btn-shine bg-moss text-white px-6 py-[18px] text-[11px] tracking-[0.28em] uppercase transition-colors duration-300 hover:bg-moss-dark shadow-[0_20px_45px_-22px_rgba(99,122,95,0.95)]"
          >
            {/* Filete dourado no topo do botão — remate de luxo, motivo da casa. */}
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gold/40"
            />
            <span>{t.nav.pedirOrcamento}</span>
            <span
              aria-hidden
              className={`text-base leading-none transition-transform duration-300 ${reduce ? "" : "group-hover:translate-x-1"}`}
              style={{ transitionTimingFunction: MENU_EASE }}
            >
              →
            </span>
          </Link>

          <div className="flex items-end justify-between gap-4 border-t border-white/[0.08] pt-6">
            <div className="flex flex-col gap-2 min-w-0">
              <a
                href={`mailto:${SITE.email}`}
                className="group inline-flex items-center gap-2.5 py-1 text-cream/70 hover:text-cream text-[12px] tracking-wide transition-colors min-w-0"
              >
                <span className="text-gold/60 group-hover:text-gold transition-colors flex-shrink-0">
                  <IconMail />
                </span>
                <span className="truncate">{SITE.email}</span>
              </a>
              <a
                href={`tel:${SITE.phone}`}
                className="group inline-flex items-center gap-2.5 py-1 text-cream/70 hover:text-cream text-[12px] tracking-wide transition-colors"
              >
                <span className="text-gold/60 group-hover:text-gold transition-colors flex-shrink-0">
                  <IconPhone />
                </span>
                {SITE.phoneDisplay}
              </a>
              <div className="flex items-center gap-1 pt-1.5 -ml-2.5">
                <a
                  href={SITE.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  className="inline-flex h-11 w-11 items-center justify-center text-cream/55 hover:text-cream transition-colors"
                >
                  <IconInstagram />
                </a>
                <a
                  href={SITE.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  className="inline-flex h-11 w-11 items-center justify-center text-cream/55 hover:text-cream transition-colors"
                >
                  <IconFacebook />
                </a>
              </div>
            </div>
            <LanguageToggle light />
          </div>
        </div>
      </div>
    </nav>
  );
}
