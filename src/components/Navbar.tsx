"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useTranslations } from "./LocaleProvider";
import LanguageToggle from "./LanguageToggle";

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();
  const { t } = useTranslations();

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
  const light = !scrolled && overDarkHero;

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
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

  // Lock background scroll while the mobile menu is open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  return (
    <nav
      data-public-nav
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-all duration-500 ${
        scrolled
          ? "bg-surface/55 backdrop-blur-md border-b border-foreground/8 shadow-sm shadow-black/5"
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
          className={`relative flex items-center justify-between transition-all duration-500 ${
            scrolled ? "h-[72px]" : "h-[140px]"
          }`}
        >
          <Link
            href="/"
            className="flex items-center shrink-0 absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 lg:static lg:translate-x-0 lg:translate-y-0"
          >
            <Image
              src="/logo-liquen.png"
              alt="Líquen Events"
              width={210}
              height={125}
              className={`object-contain w-auto transition-all duration-500 ${scrolled ? "h-[52px]" : "h-[120px]"}`}
              preload
            />
          </Link>

          <div className="hidden lg:flex items-center gap-6 xl:gap-9">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`link-line text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 ${
                  light
                    ? pathname === link.href
                      ? "text-white nav-active-light"
                      : "text-white/80 hover:text-white"
                    : pathname === link.href
                      ? "text-moss nav-active"
                      : "text-moss/80 hover:text-moss"
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
              href="/contacto"
              className={`text-[11px] tracking-[0.2em] uppercase border px-5 py-2 rounded-sm transition-all duration-300 ${
                light
                  ? "border-white/35 text-white/90 hover:border-white/70 hover:bg-white/10"
                  : "border-moss/35 text-moss hover:border-moss/60 hover:bg-moss/10"
              }`}
            >
              {t.nav.contacto}
            </Link>
            <Link
              href="/orcamento"
              className="text-[11px] tracking-[0.2em] uppercase btn-shine bg-moss text-cream px-5 py-2 rounded-sm hover:bg-moss-dark transition-all duration-300"
            >
              {t.nav.orcamento} →
            </Link>
          </div>

          <button
            className="lg:hidden p-3 -mr-2 ml-auto"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Menu"
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

      <div
        className={`lg:hidden overflow-y-auto overscroll-contain transition-all duration-400 bg-surface/96 backdrop-blur-md border-t border-foreground/6 ${
          isOpen ? "max-h-[80vh] pb-8" : "max-h-0"
        }`}
      >
        <div className="px-6 pt-6 flex flex-col">
          <Link
            href="/orcamento"
            className="mb-5 inline-block text-center text-[11px] tracking-[0.22em] uppercase btn-shine bg-moss text-cream px-5 py-3.5 rounded-sm"
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? "none" : "translateY(6px)",
              transition: isOpen
                ? "opacity 0.3s ease 50ms, transform 0.3s ease 50ms"
                : "opacity 0.1s ease, transform 0.1s ease",
            }}
          >
            {t.nav.pedirOrcamento} →
          </Link>
          {links.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`py-4 text-[11px] tracking-[0.22em] uppercase border-b border-foreground/6 ${
                pathname === link.href ? "text-moss font-medium" : "text-moss/85 hover:text-moss"
              }`}
              style={{
                opacity: isOpen ? 1 : 0,
                transform: isOpen ? "none" : "translateY(6px)",
                transition: isOpen
                  ? `opacity 0.3s ease ${100 + i * 45}ms, transform 0.3s ease ${100 + i * 45}ms, color 0.3s`
                  : "opacity 0.1s ease, transform 0.1s ease, color 0.3s",
              }}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/contacto"
            className="mt-4 inline-block text-center text-[11px] tracking-[0.22em] uppercase border border-foreground/15 text-foreground/60 px-5 py-3.5 rounded-sm hover:border-foreground/30 hover:text-foreground/78 transition-colors"
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? "none" : "translateY(6px)",
              transition: isOpen
                ? `opacity 0.3s ease ${100 + links.length * 45}ms, transform 0.3s ease ${100 + links.length * 45}ms`
                : "opacity 0.1s ease, transform 0.1s ease",
            }}
          >
            {t.nav.contacto}
          </Link>
          <div
            className="mt-6 flex justify-center"
            style={{
              opacity: isOpen ? 1 : 0,
              transition: isOpen ? "opacity 0.3s ease 250ms" : "opacity 0.1s ease",
            }}
          >
            <LanguageToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}
