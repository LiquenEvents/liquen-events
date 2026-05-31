"use client";

import { useEffect, useState } from "react";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";

export default function WhatsAppButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const id = setTimeout(() => setVisible(true), 1500);
    return () => clearTimeout(id);
  }, []);

  return (
    <a
      href={WHATSAPP_HREF}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Contactar pelo WhatsApp"
      className={`whatsapp-fixed fixed z-50 flex items-center gap-2.5 bg-[#25D366] text-white rounded-full shadow-lg shadow-black/30 hover:shadow-xl hover:shadow-[#25D366]/25 hover:scale-105 transition-all duration-500 ${
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
