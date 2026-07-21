"use client";

import { useState, useEffect, useRef, useCallback, memo, type CSSProperties } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";
import Magnetic from "@/components/motion/Magnetic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { SITE } from "@/lib/site";
import { localizeHref, type ChromeDict, type Locale } from "@/lib/i18n";
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

// The full-screen mobile menu overlay, extracted into a memoized child so the
// Navbar's frequent scroll-driven re-renders (scrolled/hidden state) no longer
// reconcile this ~180-line dialog subtree. It depends ONLY on isOpen / pathname
// / locale / t / reduce / onClose — none of which change on scroll — and all of
// links/navTypes/reveal are derived INSIDE it (not passed as fresh props) so the
// memo comparison actually holds. The focus-trap / open-focus effect lives here
// with the menuRef it guards; `onClose` (stable, from the parent) closes the
// menu and returns focus to the hamburger button, which stays in the parent.
const MobileMenu = memo(function MobileMenu({
  isOpen,
  pathname,
  locale,
  t,
  reduce,
  onClose,
}: {
  isOpen: boolean;
  pathname: string;
  locale: Locale;
  t: ChromeDict;
  reduce: boolean;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

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

  // A section stays "current" while the visitor is on any page beneath it, so a
  // service-detail route (/servicos/casamentos) keeps the Serviços item lit.
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

  const navTypes = (href: string) => [
    orderIdx(href) >= orderIdx(pathname) ? "nav-forward" : "nav-back",
  ];

  // Escape closes the overlay + traps Tab inside it (WAI-ARIA dialog pattern).
  // Focus moves to the first link on open and back to the toggle button on
  // close (via onClose), so keyboard users never land on a hidden element.
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
        onClose();
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
  }, [isOpen, onClose]);

  return (
    <div
      ref={menuRef}
      role="dialog"
      aria-modal={isOpen}
      aria-label={t.nav.menuLabel}
      aria-hidden={!isOpen}
      className={`lg:hidden fixed inset-0 -z-10 flex flex-col bg-[#0c0e0b] transition-[opacity,visibility] duration-500 ${
        isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
      }`}
    >
      {/* Menu SpaceX — minimalismo puro: fundo liso monocromático, sem
          numeração, sem serif, sem brilhos nem dourados. A tipografia sans
          maiúscula muito espaçada e o espaço branco fazem todo o trabalho; o
          único acento é um filete branco que cresce no item ativo. */}
      <nav
        aria-label={t.nav.menuLabel}
        // min-h-0 lets this flex child actually shrink so overflow-y-auto scrolls
        // the list INSIDE the nav on short screens — instead of the list growing
        // and spilling over the compact top bar or the CTA block below. pt-24
        // clears the (now compact) bar when the menu is open. Centering is done
        // with `m-auto` on the inner list (NOT justify-center on this scroller):
        // margin:auto centers only when the list fits and collapses to a normal
        // top-aligned, fully-scrollable start when it doesn't — so the first link
        // is never stranded above an unreachable overflow on short/landscape.
        className="relative flex-1 min-h-0 flex flex-col px-8 pt-52 pb-6 overflow-y-auto overscroll-contain"
      >
        <div className="m-auto w-full">
          {[...links, { href: "/contacto", label: t.nav.contacto }].map((link, i) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                transitionTypes={navTypes(link.href)}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center justify-between py-5 sm:py-6 transition-colors duration-300 ${
                  active ? "text-white" : "text-white/55 hover:text-white"
                }`}
                style={reveal(80 + i * 60)}
              >
                <span
                  className={`text-[15px] sm:text-base tracking-[0.26em] uppercase font-light ${
                    reduce ? "" : "transition-transform duration-500 group-hover:translate-x-1.5"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                >
                  {link.label}
                </span>
                <span
                  aria-hidden
                  className={`h-px bg-current ${reduce ? "" : "transition-all duration-500"} ${
                    active
                      ? "w-7 opacity-100"
                      : "w-0 opacity-0 group-hover:w-4 group-hover:opacity-50"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                />
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bloco inferior — CTA de contorno + contactos, monocromático e sóbrio.
          paddingBottom soma o safe-area-inset-bottom (home indicator). */}
      <div
        className="relative shrink-0 px-8 flex flex-col gap-5"
        style={{
          paddingBottom: "calc(2rem + env(safe-area-inset-bottom))",
          ...reveal(80 + 5 * 60 + 40),
        }}
      >
        <Link
          href={localizeHref("/orcamento", locale)}
          onClick={() => track("CTAClick", { source: "nav-mobile" })}
          className="group flex items-center justify-between w-full border border-white/25 px-6 py-4 text-white text-[11px] tracking-[0.3em] uppercase transition-colors duration-300 hover:bg-white hover:text-[#0c0e0b] hover:border-white"
        >
          <span>{t.nav.pedirOrcamento}</span>
          <span
            aria-hidden
            className={reduce ? "" : "transition-transform duration-300 group-hover:translate-x-1"}
            style={{ transitionTimingFunction: MENU_EASE }}
          >
            →
          </span>
        </Link>

        <div className="flex flex-col gap-1.5 pt-5 border-t border-white/10 text-[12px] tracking-wide">
          <a
            href={`mailto:${SITE.email}`}
            className="group inline-flex items-center gap-2.5 text-white/65 hover:text-white transition-colors min-w-0"
          >
            <span className="text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0">
              <IconMail />
            </span>
            <span className="truncate">{SITE.email}</span>
          </a>
          <a
            href={`tel:${SITE.phone}`}
            className="group inline-flex items-center gap-2.5 text-white/65 hover:text-white transition-colors"
          >
            <span className="text-white/30 group-hover:text-white/60 transition-colors flex-shrink-0">
              <IconPhone />
            </span>
            {SITE.phoneDisplay}
          </a>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 -ml-2.5">
            <a
              href={SITE.instagram}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Instagram (${t.common.newWindow})`}
              className="inline-flex h-11 w-11 items-center justify-center text-white/40 hover:text-white transition-colors"
            >
              <IconInstagram />
            </a>
            <a
              href={SITE.facebook}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Facebook (${t.common.newWindow})`}
              className="inline-flex h-11 w-11 items-center justify-center text-white/40 hover:text-white transition-colors"
            >
              <IconFacebook />
            </a>
          </div>
          <LanguageToggle light />
        </div>
      </div>
    </div>
  );
});

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePublicPathname();
  const { locale, t } = useTranslations();
  const reduce = useReducedMotion();

  const links = [
    { href: "/sobre", label: t.nav.sobre },
    { href: "/servicos", label: t.nav.servicos },
    { href: "/galeria", label: t.nav.galeria },
    { href: "/clientes", label: t.nav.clientes },
  ];

  // A section stays "current" while the visitor is on any page beneath it, so a
  // service-detail route (/servicos/casamentos) keeps the Serviços item lit and
  // exposes aria-current to assistive tech. Exact match otherwise.
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(`${href}/`));

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
  // Scrim de legibilidade — SÓ sobre o hero escuro no topo (barra transparente)
  // ou com o menu aberto. Uma vez em scroll a barra ganha fundo sólido próprio,
  // pelo que o gradiente deixaria apenas uma sombra a sangrar para o conteúdo.
  const showScrim = (!scrolled && overDarkHero) || isOpen;
  // Tratamento claro (texto/traços brancos) da barra — SÓ sobre o hero escuro no
  // topo (barra transparente) ou com o menu mobile aberto. Em scroll a barra
  // passa a CLARA (surface), por isso os links voltam ao tratamento escuro (moss)
  // para ficarem legíveis sobre esse fundo claro.
  const light = (!scrolled && overDarkHero) || isOpen;

  const navTypes = (href: string) => [
    orderIdx(href) >= orderIdx(pathname) ? "nav-forward" : "nav-back",
  ];

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        // Only track the scrolled state (for the solid frosted background). The
        // bar stays fixed and always visible — it never auto-hides on scroll —
        // so navigation is available on every page at any scroll position.
        setScrolled(window.scrollY > 30);
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

  // The hamburger toggle stays in the top bar; the overlay's focus-trap (in
  // MobileMenu) calls onClose to close the menu and return focus here, so
  // keyboard users never land on a hidden element. useCallback keeps onClose a
  // stable reference across the Navbar's scroll re-renders, so MobileMenu's memo
  // isn't defeated by a fresh callback each render.
  const toggleBtnRef = useRef<HTMLButtonElement>(null);
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    toggleBtnRef.current?.focus();
  }, []);

  return (
    <nav
      data-public-nav
      aria-label={t.nav.primaryLabel}
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[background-color,border-color,box-shadow] duration-500 ease-expo ${
        // Barra CLARA sólida ao fazer scroll (fundo surface a 95% + filete ténue
        // + sombra suave). SEM backdrop-blur de propósito — um backdrop-filter num
        // elemento fixo cria um containing-block que prenderia o overlay
        // `fixed inset-0` do menu mobile à altura da barra em vez do viewport
        // (além do custo de re-desfocar a cada frame de scroll). A 95% de opacidade
        // já é praticamente sólida, pelo que o blur seria impercetível.
        scrolled
          ? "bg-surface/95 border-b border-foreground/10 shadow-sm shadow-black/5"
          : "bg-transparent border-b border-transparent"
      }`}
    >
      {/* Legibility scrim — only over dark hero images, fades to nothing */}
      {showScrim && (
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
            // Three bar heights: a taller bar while the mobile menu is OPEN so it
            // can carry a prominent centred logo (the menu's pt clears it); the
            // compact 72px bar once the page is scrolled; the full 140px at rest.
            isOpen ? "h-[200px]" : scrolled ? "h-[76px]" : "h-[164px]"
          }`}
        >
          {/* Logo: horizontally centred on mobile (absolute, out of flow), and
              in-flow on the left from lg up. */}
          <Link
            href={localizeHref("/", locale)}
            className="flex items-center shrink-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0"
          >
            <Image
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={300}
              height={179}
              className={`object-contain w-auto transition-[height] duration-500 ${isOpen ? "h-[152px] sm:h-[168px]" : scrolled ? "h-[52px] sm:h-[58px]" : "h-[128px] sm:h-[148px]"}`}
            />
          </Link>

          {/* Mobile: language toggle on the LEFT, balancing the centred logo
              (hidden while the menu is open — the overlay carries its own). */}
          <div className="lg:hidden flex items-center">
            {!isOpen && <LanguageToggle light={light} />}
          </div>

          <div className="hidden lg:flex items-center gap-5 xl:gap-9">
            {links.map((link) => (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                transitionTypes={navTypes(link.href)}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`link-line py-1.5 -my-1.5 text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 ${
                  light
                    ? isActive(link.href)
                      ? "text-white nav-active-light"
                      : "text-white/80 hover:text-white"
                    : isActive(link.href)
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
            {/* CTA primária no idioma SpaceX — filete quadrado que enche no
                hover em vez do bloco sólido moss. Sobre o hero (light) o traço
                é branco e enche a branco (texto inverte para #0c0e0b); nas
                páginas de topo claro o traço é moss e enche a moss (texto a
                branco). Continua a ação principal: contorno mais firme que o
                "Contacto" e enche por completo. */}
            <Magnetic strength={0.3}>
              <Link
                href={localizeHref("/orcamento", locale)}
                onClick={() => track("CTAClick", { source: "nav" })}
                className={`text-[11px] tracking-[0.2em] uppercase border px-5 py-2 transition-colors duration-300 ease-expo ${
                  light
                    ? "border-white/70 text-white hover:bg-white hover:text-[#0c0e0b] hover:border-white"
                    : "border-moss text-moss hover:bg-moss hover:text-white hover:border-moss"
                }`}
              >
                {t.nav.pedirOrcamento} <span aria-hidden>→</span>
              </Link>
            </Magnetic>
          </div>

          {/* Mobile: hamburger on the RIGHT (balances the left PT/EN toggle
              around the centred logo). */}
          <div className="lg:hidden flex items-center">
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

      <MobileMenu
        isOpen={isOpen}
        pathname={pathname}
        locale={locale}
        t={t}
        reduce={reduce}
        onClose={closeMenu}
      />
    </nav>
  );
}
