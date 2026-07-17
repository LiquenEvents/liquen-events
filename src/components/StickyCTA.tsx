"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { useTranslations } from "./LocaleProvider";
import { localizeHref } from "@/lib/i18n";
import { track } from "@/lib/track";

// Run `cb` when the browser is idle, falling back to a short timeout where
// requestIdleCallback isn't available (e.g. Safari). Returns a canceller.
// This keeps the scroll listener / IntersectionObserver setup out of the
// critical hydration window — the CTA is invisible + inert until the user
// scrolls ~75% of a viewport anyway, so mounting its logic a beat later is
// imperceptible.
function onIdle(cb: () => void): () => void {
  if (typeof window !== "undefined" && "requestIdleCallback" in window) {
    const id = window.requestIdleCallback(cb, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(cb, 200);
  return () => clearTimeout(id);
}

export default function StickyCTA() {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const pathname = usePublicPathname();
  const { locale, t } = useTranslations();

  const hidden = pathname.startsWith("/orcamento") || pathname.startsWith("/contacto");

  // Defer the whole island (DOM + listeners) past first paint: nothing renders
  // and no work runs until the browser is idle. Both SSR and the first client
  // render return null, so there's no hydration mismatch and no subtree to
  // hydrate up front.
  useEffect(() => onIdle(() => setMounted(true)), []);

  useEffect(() => {
    if (!mounted) return;
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVisible(window.scrollY > window.innerHeight * 0.75);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    // Sync to the current scroll position in case the listener attaches after
    // the user has already scrolled during the (sub-frame) idle deferral.
    onScroll();
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, [mounted]);

  // Hide the floating CTA once the footer is in view so it never overlaps the
  // copyright / footer links.
  useEffect(() => {
    if (!mounted) return;
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    io.observe(footer);
    return () => io.disconnect();
  }, [mounted, pathname]);

  if (hidden || !mounted) return null;

  const show = visible && !atFooter;

  return (
    <div
      // `inert` enquanto invisível: sem isto o link continuava focável por
      // teclado apesar de opacity-0/pointer-events-none — tornava-se a 2.ª
      // paragem de Tab (um elemento no fundo do ecrã, à frente da navbar) com
      // um anel de foco a 0% de opacidade. inert remove-o da ordem de Tab e da
      // árvore de acessibilidade até ficar visível.
      inert={!show}
      // Shown on every breakpoint: on mobile it's the only persistent path to
      // the quote form (the navbar auto-hides on scroll-down). It sits bottom-
      // LEFT, so it never collides with the bottom-right WhatsApp pill.
      className={`fixed bottom-[calc(1.25rem+env(safe-area-inset-bottom))] left-[calc(1.25rem+env(safe-area-inset-left))] lg:bottom-[calc(1.75rem+env(safe-area-inset-bottom))] lg:left-[calc(1.75rem+env(safe-area-inset-left))] z-40 transition-all duration-500 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <Link
        href={localizeHref("/orcamento", locale)}
        onClick={() => track("CTAClick", { source: "sticky" })}
        className="group flex items-center gap-3 px-5 py-3 bg-surface-elevated/90 backdrop-blur-md border border-foreground/12 hover:border-moss/40 transition-all duration-300 shadow-2xl shadow-black/70 rounded-sm"
      >
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="footer-ping absolute inline-flex h-full w-full rounded-full bg-moss opacity-55" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-moss" />
        </span>
        <span className="text-[10px] tracking-[0.28em] uppercase text-foreground/68 group-hover:text-moss transition-colors duration-300">
          {t.footer.pedirOrcamento}
        </span>
        <span
          className="text-foreground/18 group-hover:text-moss/60 group-hover:translate-x-0.5 transition-all duration-300 text-sm"
          aria-hidden
        >
          →
        </span>
      </Link>
    </div>
  );
}
