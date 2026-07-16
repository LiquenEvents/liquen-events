"use client";

import { useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";
import { useTranslations } from "./LocaleProvider";

export default function WhatsAppButton() {
  const [visible, setVisible] = useState(false);
  const { t } = useTranslations();

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <a
      href={WHATSAPP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t.common.contactWhatsApp}
      // Invisible during the 1.5s reveal delay — keep it out of the tab order
      // and a11y tree until it's actually shown (WCAG 2.4.3).
      inert={!visible}
      // bg passa de #25D366 (verde-marca WhatsApp) para #0c7f3a: com texto
      // branco, #25D366 dá só 1.98:1 (falha AA); #0c7f3a dá 5.11:1. Continua
      // claramente verde/WhatsApp e o glow do hover mantém o verde-marca.
      className={`whatsapp-fixed fixed z-50 flex items-center gap-2.5 bg-[#0c7f3a] text-white rounded-full shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-[#25D366]/25 hover:scale-105 transition-all duration-500 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4 pointer-events-none"
      }`}
      style={{
        bottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        right: "calc(1.25rem + env(safe-area-inset-right))",
        padding: "13px 20px 13px 16px",
      }}
    >
      <WhatsAppIcon className="w-5 h-5 flex-shrink-0" />
      <span className="text-sm font-medium tracking-wide">WhatsApp</span>
    </a>
  );
}
