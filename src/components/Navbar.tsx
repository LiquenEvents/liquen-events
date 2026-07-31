"use client";

import { useState, useEffect, useRef, useCallback, memo, type CSSProperties } from "react";
import Link from "next/link";
import SafeImage from "@/components/SafeImage";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";
import Magnetic from "@/components/motion/Magnetic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import type { ChromeDict } from "@/lib/i18n";
import { track } from "@/lib/track";
import { EASE_OUT } from "@/lib/motion/tokens";

// A desaceleração de assinatura, LIDA DA FICHA em vez de copiada. Era a quarta
// cópia à mão da curva (o próprio `tokens.ts` a nomeia), e uma cópia é um sítio
// onde o sítio pode passar a ter duas desacelerações sem ninguém dar por isso.
const MENU_EASE = EASE_OUT;

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
          transition: isOpen ? `opacity 0.3s ${MENU_EASE}` : `opacity 0.15s ${MENU_EASE}`,
        }
      : {
          opacity: isOpen ? 1 : 0,
          transform: isOpen ? "none" : "translateY(24px)",
          // O FECHO estava em `ease` enquanto a ABERTURA estava na assinatura:
          // o mesmo menu a abrir com uma curva e a fechar com outra. Medido no
          // sítio a correr, eram as últimas 7 transições da página inicial fora
          // da assinatura. Continua a ser rápido (0,15 s) — só deixa de ser uma
          // desaceleração diferente.
          transition: isOpen
            ? `opacity 0.6s ${MENU_EASE} ${delay}ms, transform 0.6s ${MENU_EASE} ${delay}ms`
            : `opacity 0.15s ${MENU_EASE}, transform 0.15s ${MENU_EASE}`,
        };

  const links = [
    { href: "/sobre", label: t.nav.sobre },
    { href: "/servicos", label: t.nav.servicos },
    { href: "/galeria", label: t.nav.galeria },
    { href: "/clientes", label: t.nav.clientes },
  ];

  // Featured services block at the foot of the menu (SpaceX "Upcoming Launches"
  // idiom, adapted): two flagship services with a small photo, title + eyebrow
  // and an arrow. Labels are kept inline (locale-switched) so this menu-only
  // copy doesn't have to ride the shared chrome dictionary.
  const featuredHeader = locale === "en" ? "Our services" : "Os nossos serviços";
  const featured = [
    {
      href: "/servicos/casamentos",
      img: "/imagens/EW1_1100.jpg",
      title: locale === "en" ? "Weddings" : "Casamentos",
      sub: locale === "en" ? "Decoration & coordination" : "Decoração e coordenação",
    },
    {
      href: "/servicos/eventos-corporativos",
      img: "/imagens/EW1_1332.jpg",
      title: locale === "en" ? "Corporate Events" : "Eventos Corporativos",
      sub: locale === "en" ? "For companies" : "Para empresas",
    },
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
      // h-[100dvh] (dynamic viewport height) instead of inset-0 / 100vh: on
      // mobile the layout viewport is taller than the VISIBLE area while the
      // browser's URL bar is showing, so an inset-0 overlay pushed the bottom
      // block (contacts) behind the browser chrome. dvh tracks the visible area,
      // keeping the contacts on screen as the URL bar shows/hides.
      className={`lg:hidden fixed inset-x-0 top-0 h-[100dvh] -z-10 flex flex-col bg-moss-dark transition-[opacity,visibility] duration-500 ${
        isOpen ? "opacity-100 visible" : "opacity-0 invisible pointer-events-none"
      }`}
    >
      {/* Menu SpaceX — minimalismo puro: fundo liso monocromático, sem
          numeração, sem serif, sem brilhos nem dourados. A tipografia sans
          maiúscula muito espaçada e o espaço branco fazem todo o trabalho; o
          único acento é um filete branco que cresce no item ativo. */}
      {/* Conteúdo com scroll (links + serviços em destaque). pt-40 limpa o
          logótipo (barra aberta h-150); a barra tem fundo moss quando o menu
          está aberto, por isso o conteúdo desliza por trás dela sem se ver.
          min-h-0 é essencial: sem ele um filho flex com overflow-y-auto cresce
          até à altura do conteúdo (min-height:auto) em vez de fazer scroll
          interno — e o rodapé (CTA + redes) acabava por sobrepor os cartões. */}
      <div className="relative flex-1 min-h-0 overflow-y-auto overscroll-contain px-8 pt-40 pb-6">
        <nav aria-label={t.nav.menuLabel} className="w-full">
          {[...links, { href: "/contacto", label: t.nav.contacto }].map((link, i) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={localizeHref(link.href, locale)}
                prefetch
                transitionTypes={navTypes(link.href)}
                aria-current={active ? "page" : undefined}
                className={`group flex items-center justify-between py-2.5 sm:py-3 transition-colors duration-300 ${
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
        </nav>

        {/* Serviços em destaque — cartão com foto + título + seta (idioma
            SpaceX "Upcoming Launches", adaptado à Líquen). Imagens só montam com
            o menu aberto para não descarregarem em todas as páginas. */}
        <div className="mt-6" style={reveal(80 + 6 * 60)}>
          <p className="mb-3 text-[11px] tracking-[0.26em] uppercase text-white/45">
            {featuredHeader}
          </p>
          <div className="border-t border-white/12">
            {featured.map((s) => (
              <Link
                key={s.href}
                href={localizeHref(s.href, locale)}
                prefetch
                transitionTypes={navTypes(s.href)}
                className="group flex items-center gap-4 border-b border-white/12 py-3"
              >
                <span className="relative h-14 w-14 flex-shrink-0 overflow-hidden bg-white/5">
                  {isOpen && (
                    /* SEM legenda de indisponível de propósito: numa miniatura
                       de 56px uma etiqueta de texto não cabe e lê-se como mais
                       um defeito. Aqui "digno" é silencioso — a superfície
                       desfocada da própria foto, sobre o quadrado bg-white/5
                       que já existe, e nunca o ícone de imagem partida (que é
                       precisamente o que a dona fotografou no menu). */
                    <SafeImage
                      src={s.img}
                      alt=""
                      fill
                      sizes="56px"
                      quality={55}
                      className="object-cover"
                    />
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base leading-snug text-white font-semibold uppercase tracking-display">
                    {s.title}
                  </span>
                  <span className="mt-1 block text-[10px] tracking-[0.18em] uppercase text-white/45">
                    {s.sub}
                  </span>
                </span>
                <span
                  aria-hidden
                  className={`flex-shrink-0 text-white/50 group-hover:text-white ${
                    reduce ? "" : "transition-transform duration-300 group-hover:translate-x-1"
                  }`}
                  style={{ transitionTimingFunction: MENU_EASE }}
                >
                  →
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Bloco inferior — apenas o CTA de contorno, compacto e ancorado ao fundo
          do ecrã. Sem redes sociais aqui (já vivem no rodapé do site) para o
          menu respirar e caber tudo. paddingBottom soma o safe-area-inset-bottom
          (home indicator). */}
      <div
        className="relative shrink-0 px-8"
        style={{
          paddingBottom: "calc(1.5rem + env(safe-area-inset-bottom))",
          ...reveal(80 + 5 * 60 + 40),
        }}
      >
        <Link
          href={localizeHref("/orcamento", locale)}
          onClick={() => track("CTAClick", { source: "nav-mobile" })}
          className="group flex items-center justify-between w-full border border-white/25 px-5 py-2.5 text-white text-[10px] tracking-[0.28em] uppercase transition-colors duration-300 hover:bg-white hover:text-[#0c0e0b] hover:border-white"
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
  // No top scrim while the mobile menu is open: the menu carries its own moss
  // background, so the dark hero-legibility gradient would just paint an ugly
  // darker band across the top of the green. The bar's contents (logo, close)
  // are already light (see `light` below) and read fine on the moss.
  const showScrim = !isOpen && !scrolled && overDarkHero;
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
    // Sincronizar com a posição ACTUAL, e não só reagir ao próximo evento.
    // Apanhado com a sonda de transições: numa página que já está a meio (o
    // browser repõe o scroll ao recarregar ou ao voltar atrás), o scroll é
    // reposto ANTES de este listener existir, o evento perde-se, e nada o
    // repõe — a barra ficava nos 164 px por cima de uma página descida, e só
    // ao primeiro gesto do visitante é que corrigia, tocando a animação de
    // altura de 500 ms inteira. Ou seja: um salto visível, e uma passagem
    // extra pela ÚNICA animação de layout do sítio, exactamente no primeiro
    // gesto — o pior momento possível. O StickyCTA ao lado já fazia esta
    // chamada; a barra é que não fazia.
    onScroll();
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
      // `border-bottom-color`, não `border-color`: a barra só tem borda EM
      // BAIXO (`border-b`), mas o utilitário de cor pinta as quatro, e pedir
      // `border-color` na transição arranca as quatro — três delas em lados com
      // 0 px de largura, que não desenham um único pixel. Medido com
      // `transitionrun` num passo de scroll que cruza o limiar dos 30 px: 23
      // transições a arrancar ao mesmo tempo, das quais 3 eram estas. Ficam 20,
      // e o aspecto é o mesmo — uma borda de largura zero não se vê.
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-[background-color,border-bottom-color,box-shadow] duration-500 ease-expo ${
        // Barra CLARA sólida ao fazer scroll (fundo surface a 95% + filete ténue
        // + sombra suave). SEM backdrop-blur de propósito — um backdrop-filter num
        // elemento fixo cria um containing-block que prenderia o overlay
        // `fixed inset-0` do menu mobile à altura da barra em vez do viewport
        // (além do custo de re-desfocar a cada frame de scroll). A 95% de opacidade
        // já é praticamente sólida, pelo que o blur seria impercetível.
        isOpen
          ? "bg-moss-dark border-b border-transparent"
          : scrolled
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
            // The open bar is kept trim (150px) so the menu below has room for
            // the links + both service cards + the CTA without overflowing.
            isOpen ? "h-[150px]" : scrolled ? "h-[76px]" : "h-[164px]"
          }`}
        >
          {/* Logo: horizontally centred on mobile (absolute, out of flow), and
              in-flow on the left from lg up. */}
          <Link
            href={localizeHref("/", locale)}
            className="flex items-center shrink-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0"
          >
            {/* O logótipo está em `public/` e portanto existe sempre; o que
                pode faltar é a DERIVADA que o carregador do sítio pede (hoje
                `/_img/l/…`, antes `/_next/image`). Com o SafeImage, uma falha
                dessa derivada deixa de significar uma marca partida no topo de
                TODAS as páginas — passa a significar um segundo pedido ao PNG
                original. */}
            <SafeImage
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={300}
              height={179}
              priority
              className={`object-contain w-auto transition-[height] duration-500 ${isOpen ? "h-[104px] sm:h-[120px]" : scrolled ? "h-[52px] sm:h-[58px]" : "h-[128px] sm:h-[148px]"}`}
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
                // Full prefetch (not the default "up to the loading boundary"):
                // the public pages are static, so this warms the ENTIRE page so a
                // click swaps instantly — no fetch pause, no loading-screen flash.
                prefetch
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
