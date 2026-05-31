"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const links = [
  { href: "/sobre", label: "Sobre" },
  { href: "/servicos", label: "Serviços" },
  { href: "/galeria", label: "Galeria" },
  { href: "/clientes", label: "Clientes" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 30);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 pt-safe transition-all duration-500 ${
        scrolled ? "border-b border-foreground/[0.07] backdrop-blur-sm" : ""
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 lg:px-16">
        <div className="flex items-center justify-between h-[68px]">
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src="/logo-liquen-branco.png"
              alt="Líquen Events"
              width={128}
              height={44}
              className="object-contain"
              priority
            />
          </Link>

          <div className="hidden md:flex items-center gap-9">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`link-line text-[11px] tracking-[0.2em] uppercase transition-colors duration-300 ${
                  pathname === link.href
                    ? "text-moss nav-active"
                    : "text-foreground/38 hover:text-foreground/75"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <div className="hidden md:flex items-center gap-3">
            <Link
              href="/contacto"
              className="text-[11px] tracking-[0.2em] uppercase border border-foreground/18 text-foreground/40 px-5 py-2 rounded-sm hover:border-foreground/35 hover:text-foreground/65 transition-all duration-300"
            >
              Contacto
            </Link>
            <Link
              href="/orcamento"
              className="text-[11px] tracking-[0.2em] uppercase bg-moss text-cream px-5 py-2 rounded-sm hover:bg-moss-dark transition-all duration-300"
            >
              Orçamento →
            </Link>
          </div>

          <button
            className="md:hidden p-3 -mr-2"
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Menu"
            aria-expanded={isOpen}
          >
            <span
              className={`block w-[18px] h-px bg-foreground/60 transition-all duration-300 mb-1.5 ${isOpen ? "rotate-45 translate-y-2" : ""}`}
            />
            <span
              className={`block w-[18px] h-px bg-foreground/60 transition-all duration-300 mb-1.5 ${isOpen ? "opacity-0" : ""}`}
            />
            <span
              className={`block w-[18px] h-px bg-foreground/60 transition-all duration-300 ${isOpen ? "-rotate-45 -translate-y-2" : ""}`}
            />
          </button>
        </div>
      </div>

      <div
        className={`md:hidden overflow-y-auto overscroll-contain transition-all duration-400 bg-surface/96 backdrop-blur-md border-t border-foreground/6 ${
          isOpen ? "max-h-[80vh] pb-8" : "max-h-0"
        }`}
      >
        <div className="px-6 pt-6 flex flex-col">
          <Link
            href="/orcamento"
            className="mb-5 inline-block text-center text-[11px] tracking-[0.22em] uppercase bg-moss text-cream px-5 py-3.5 rounded-sm"
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? "none" : "translateY(6px)",
              transition: isOpen
                ? "opacity 0.3s ease 50ms, transform 0.3s ease 50ms"
                : "opacity 0.1s ease, transform 0.1s ease",
            }}
          >
            Pedir Orçamento →
          </Link>
          {links.map((link, i) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? "page" : undefined}
              className={`py-4 text-[11px] tracking-[0.22em] uppercase border-b border-foreground/6 ${
                pathname === link.href ? "text-moss" : "text-foreground/40 hover:text-foreground/70"
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
            className="mt-4 inline-block text-center text-[11px] tracking-[0.22em] uppercase border border-foreground/15 text-foreground/40 px-5 py-3.5 rounded-sm hover:border-foreground/30 hover:text-foreground/65 transition-colors"
            style={{
              opacity: isOpen ? 1 : 0,
              transform: isOpen ? "none" : "translateY(6px)",
              transition: isOpen
                ? `opacity 0.3s ease ${100 + links.length * 45}ms, transform 0.3s ease ${100 + links.length * 45}ms`
                : "opacity 0.1s ease, transform 0.1s ease",
            }}
          >
            Contacto
          </Link>
        </div>
      </div>
    </nav>
  );
}
