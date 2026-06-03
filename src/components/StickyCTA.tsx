"use client";
import Link from "next/link";
import { useState, useEffect } from "react";
import { usePathname } from "next/navigation";
import { useTranslations } from "./LocaleProvider";

export default function StickyCTA() {
  const [visible, setVisible] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const pathname = usePathname();
  const { t } = useTranslations();

  const hidden = pathname.startsWith("/orcamento") || pathname.startsWith("/contacto");

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setVisible(window.scrollY > window.innerHeight * 0.75);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Hide the floating CTA once the footer is in view so it never overlaps the
  // copyright / footer links.
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    io.observe(footer);
    return () => io.disconnect();
  }, [pathname]);

  if (hidden) return null;

  const show = visible && !atFooter;

  return (
    <div
      className={`hidden lg:block fixed bottom-7 left-7 z-40 transition-all duration-500 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
    >
      <Link
        href="/orcamento"
        className="group flex items-center gap-3 px-5 py-3 bg-surface-elevated/90 backdrop-blur-md border border-foreground/12 hover:border-moss/40 transition-all duration-300 shadow-2xl shadow-black/70 rounded-sm"
      >
        <span className="relative flex h-1.5 w-1.5 flex-shrink-0">
          <span className="footer-ping absolute inline-flex h-full w-full rounded-full bg-moss opacity-55" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-moss" />
        </span>
        <span className="text-[10px] tracking-[0.28em] uppercase text-foreground/38 group-hover:text-moss transition-colors duration-300">
          {t.footer.pedirOrcamento}
        </span>
        <span className="text-foreground/18 group-hover:text-moss/60 group-hover:translate-x-0.5 transition-all duration-300 text-sm">
          →
        </span>
      </Link>
    </div>
  );
}
