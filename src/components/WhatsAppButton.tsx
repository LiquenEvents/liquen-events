"use client";

import { useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";
import { useTranslations } from "./LocaleProvider";
import { usePublicPathname } from "@/lib/use-public-pathname";

export default function WhatsAppButton() {
  const [visible, setVisible] = useState(false);
  const [atFooter, setAtFooter] = useState(false);
  const { t } = useTranslations();
  const pathname = usePublicPathname();

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(id);
  }, []);

  // Retract once the footer is in view so the pill never covers the footer's
  // links / legal text on mobile (mirrors StickyCTA's behaviour).
  useEffect(() => {
    const footer = document.querySelector("footer");
    if (!footer) return;
    const io = new IntersectionObserver(([entry]) => setAtFooter(entry.isIntersecting), {
      rootMargin: "0px 0px -40px 0px",
    });
    io.observe(footer);
    return () => io.disconnect();
  }, [pathname]);

  // The quote form and its confirmation already offer WhatsApp/contact inline;
  // the floating pill there only overlaps the submit / action buttons on mobile.
  if (pathname.startsWith("/orcamento")) return null;

  const show = visible && !atFooter;

  return (
    <a
      href={WHATSAPP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.common.contactWhatsApp}
      // Invisible during the 1.5s reveal delay / at the footer — keep it out of
      // the tab order and a11y tree until it's actually shown (WCAG 2.4.3).
      inert={!show}
      // bg passa de #25D366 (verde-marca WhatsApp) para #0c7f3a: com texto
      // branco, #25D366 dá só 1.98:1 (falha AA); #0c7f3a dá 5.11:1. Continua
      // claramente verde/WhatsApp e o glow do hover mantém o verde-marca.
      // Icon-only (a compact circle) below sm so it never collides with the
      // bottom-left "Pedir orçamento" pill on small phones; full label from sm up.
      className={`whatsapp-fixed fixed z-50 flex items-center justify-center gap-2.5 p-3.5 sm:pl-4 sm:pr-5 sm:py-[13px] bg-[#0c7f3a] text-white rounded-full shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-[#25D366]/25 hover:scale-105 transition-all duration-500 ${
        show ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      style={{
        bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        right: "calc(1.25rem + env(safe-area-inset-right))",
      }}
    >
      <WhatsAppIcon className="w-5 h-5 flex-shrink-0" />
      <span className="hidden sm:inline text-sm font-medium tracking-wide">WhatsApp</span>
    </a>
  );
}
