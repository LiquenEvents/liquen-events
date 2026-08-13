"use client";

import type { Locale } from "@/lib/i18n/config";

// Footer link that re-opens the cookie consent bar so a visitor can change (or
// withdraw) their choice at any time — RGPD requires withdrawing consent to be
// as easy as giving it. Dispatches an event that <ConsentBanner> listens for.
export default function ManageCookiesLink({ locale }: { locale: Locale }) {
  const label = locale === "en" ? "Manage cookies" : "Gerir cookies";
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event("liquen:open-consent"))}
      // `alvo-toque`: media 73×17 px no telemóvel, ao lado dos dois links de
      // legais que agora também o levam. É por aqui que se RETIRA o
      // consentimento, e o RGPD exige que retirar seja tão fácil como dar.
      className="alvo-toque link-line hover:text-white transition-colors"
    >
      {label}
    </button>
  );
}
