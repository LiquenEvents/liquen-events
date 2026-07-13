"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";
import Magnetic from "@/components/motion/Magnetic";
import { SITE } from "@/lib/site";
import { localizeHref } from "@/lib/i18n";

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
  const pathname = usePathname();
  const { locale, t } = useTranslations();

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
    return () => {
      document.body.style.overflow = prev;
      delete document.body.dataset.menuOpen;
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
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[transform,background-color,border-color,box-shadow] duration-500 ${
        // NB: nada de "translate-y-0" no estado visível — QUALQUER transform no
        // nav cria um containing block e prenderia o overlay fixed inset-0 do
        // menu mobile à altura da barra em vez do viewport inteiro.
        hidden && !isOpen ? "-translate-y-full" : ""
      } ${
        // blur de 6px (não 12) + fundo mais opaco: visual igual, metade do
        // custo de repintar o backdrop a cada frame de scroll.
        // backdrop-filter, tal como transform, cria um containing block para
        // descendentes fixed — com o menu aberto isso prendia o overlay
        // fixed inset-0 à altura da própria barra (~72px) em vez do viewport
        // inteiro. Suprimido apenas enquanto isOpen: nesse estado o overlay
        // opaco do menu já cobre este fundo por completo, pelo que o blur
        // nunca chega a ser visível.
        scrolled
          ? `bg-surface/75 border-b border-foreground/8 shadow-sm shadow-black/5 ${isOpen ? "" : "backdrop-blur-[6px]"}`
          : "bg-transparent border-b border-transparent"
      }`}
    >
      {/* Legibility scrim — only over dark hero images, fades to nothing */}
      {light && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-black/35 via-black/10 to-transparent"
        />
      )}
      <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16">
        <div
          className={`relative flex items-center justify-between transition-[height] duration-500 ${
            scrolled ? "h-[72px]" : "h-[140px]"
          }`}
        >
          <Link
            href={localizeHref("/", locale)}
            className="flex items-center shrink-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0"
          >
            <Image
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={210}
              height={125}
              className={`object-contain w-auto transition-[height] duration-500 ${scrolled ? "h-[52px]" : "h-[120px]"}`}
              preload
            />
          </Link>

          <div className="hidden lg:flex items-center gap-6 xl:gap-9">
            {links.map((link) => (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                transitionTypes={navTypes(link.href)}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`link-line text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 ${
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
              className={`text-[11px] tracking-[0.2em] uppercase border px-5 py-2 rounded-sm transition-all duration-300 ${
                light
                  ? "border-white/35 text-white/90 hover:border-white/70 hover:bg-white/10"
                  : "border-moss/35 text-moss hover:border-moss/60 hover:bg-moss/10"
              }`}
            >
              {t.nav.contacto}
            </Link>
            <Magnetic strength={0.3}>
              <Link
                href={localizeHref("/orcamento", locale)}
                className="text-[11px] tracking-[0.2em] uppercase btn-shine bg-moss text-cream px-5 py-2 rounded-sm hover:bg-moss-dark transition-all duration-300"
              >
                {t.nav.orcamento} →
              </Link>
            </Magnetic>
          </div>

          <button
            ref={toggleBtnRef}
            className="lg:hidden p-3 -mr-2 ml-auto"
            onClick={() => setIsOpen(!isOpen)}
            aria-label={t.nav.menuLabel}
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

      {/* ── Menu mobile — overlay a ecrã inteiro, tipografia display em cascata ── */}
      <div
        ref={menuRef}
        role="dialog"
        aria-modal={isOpen}
        aria-label={t.nav.menuLabel}
        aria-hidden={!isOpen}
        className={`lg:hidden fixed inset-0 -z-10 flex flex-col bg-[#10140f] transition-[opacity,visibility] duration-500 ${
          isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
        }`}
      >
        {/* Vinheta subtil — profundidade sem sujar o fundo */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(90%_55%_at_50%_0%,rgba(99,122,95,0.10),transparent_70%)]"
        />

        <nav className="relative flex-1 flex flex-col justify-center px-8 pt-28 pb-4 overflow-y-auto overscroll-contain">
          <p
            className="text-cream/30 text-[10px] tracking-[0.45em] uppercase flex items-center gap-3 mb-6"
            style={{
              opacity: isOpen ? 1 : 0,
              transition: isOpen ? "opacity 0.5s ease 100ms" : "opacity 0.15s ease",
            }}
          >
            <span className="w-6 h-px bg-gold/60 flex-shrink-0" />
            {t.nav.menuLabel}
          </p>
          {[...links, { href: "/contacto", label: t.nav.contacto }].map((link, i) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                transitionTypes={navTypes(link.href)}
                aria-current={active ? "page" : undefined}
                className="group flex items-center justify-between gap-4 py-[18px] border-b border-white/[0.07]"
                style={{
                  opacity: isOpen ? 1 : 0,
                  transform: isOpen ? "none" : "translateY(22px)",
                  transition: isOpen
                    ? `opacity 0.5s cubic-bezier(0.16,1,0.3,1) ${150 + i * 55}ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) ${150 + i * 55}ms`
                    : "opacity 0.15s ease, transform 0.15s ease",
                }}
              >
                <span
                  className={`text-[clamp(24px,6vw,32px)] leading-none transition-colors duration-300 ${
                    active ? "text-moss-light" : "text-cream group-hover:text-moss-light"
                  }`}
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {link.label}
                </span>
                <span className="text-cream/22 text-[10px] tracking-[0.3em] tabular-nums">
                  0{i + 1}
                </span>
              </Link>
            );
          })}
        </nav>

        <div
          className="relative px-8 pb-10 flex flex-col gap-7"
          style={{
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? "none" : "translateY(16px)",
            transition: isOpen
              ? "opacity 0.5s cubic-bezier(0.16,1,0.3,1) 460ms, transform 0.5s cubic-bezier(0.16,1,0.3,1) 460ms"
              : "opacity 0.15s ease, transform 0.15s ease",
          }}
        >
          <Link
            href={localizeHref("/orcamento", locale)}
            className="block text-center text-[11px] tracking-[0.22em] uppercase btn-shine bg-moss text-cream px-5 py-4 rounded-sm"
          >
            {t.nav.pedirOrcamento} →
          </Link>
          <div className="flex items-end justify-between gap-4 border-t border-white/[0.07] pt-6">
            <div className="flex flex-col gap-1.5 min-w-0">
              <a
                href={`mailto:${SITE.email}`}
                className="text-cream/40 hover:text-cream/75 text-[11px] tracking-wide transition-colors truncate"
              >
                {SITE.email}
              </a>
              <a
                href={`tel:${SITE.phone}`}
                className="text-cream/40 hover:text-cream/75 text-[11px] tracking-wide transition-colors"
              >
                {SITE.phoneDisplay}
              </a>
            </div>
            <LanguageToggle light />
          </div>
        </div>
      </div>
    </nav>
  );
}
