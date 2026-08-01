"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { localizeHref, type Locale } from "@/lib/i18n/config";
import { ALTURA_BARRA_FIXA_PX, ehRotaSocial } from "@/lib/meta/barra";

// Minimal RGPD cookie-consent bar. It only governs the Google tag's Consent
// Mode signals (ad/analytics cookies) — the site's own first-party essentials
// don't need consent. Shown once; the choice is stored in localStorage and
// mirrored into gtag('consent','update',…). Denied by default (see GoogleTag),
// so doing nothing = no ad cookies.
type Gtag = (...args: unknown[]) => void;

const COPY = {
  pt: {
    text: "Usamos cookies do Google e da Meta para estatísticas de visitas (Google Analytics) e para medir a eficácia da nossa publicidade (Google Ads, Instagram e Facebook). Pode aceitar ou recusar e a sua escolha fica guardada.",
    more: "Saber mais",
    accept: "Aceitar",
    decline: "Recusar",
    aria: "Aviso de cookies",
  },
  en: {
    text: "We use Google and Meta cookies for visit statistics (Google Analytics) and to measure how well our ads perform (Google Ads, Instagram and Facebook). You can accept or decline and your choice is remembered.",
    more: "Learn more",
    accept: "Accept",
    decline: "Decline",
    aria: "Cookie notice",
  },
} as const;

export default function ConsentBanner({ locale }: { locale: Locale }) {
  const [show, setShow] = useState(false);
  const pathname = usePathname();
  // The consent bar governs Google's public-visitor tracking; it has no place
  // over the authenticated back office (…/orcamento/admin[/…], locale-prefixed
  // in EN), where it would also sit on top of the mobile nav and intercept its
  // clicks. Staying out of that surface keeps it a marketing-site concern only.
  const isBackOffice = pathname?.includes("/orcamento/admin") ?? false;

  useEffect(() => {
    // Only surface the bar when no choice has been stored yet. Wrapped in
    // try/catch because localStorage throws in private-mode / blocked-storage.
    try {
      if (!localStorage.getItem("liquen-consent")) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShow(true);
      }
    } catch {
      /* storage unavailable — skip the banner rather than risk a throw */
    }
  }, []);

  // Re-open on demand from the "Gerir cookies" footer link, so a visitor can
  // change or withdraw their choice at any time (RGPD: withdrawing consent must
  // be as easy as giving it).
  useEffect(() => {
    const open = () => setShow(true);
    window.addEventListener("liquen:open-consent", open);
    return () => window.removeEventListener("liquen:open-consent", open);
  }, []);

  const choose = (granted: boolean) => {
    const value = granted ? "granted" : "denied";
    try {
      localStorage.setItem("liquen-consent", value);
    } catch {
      /* ignore */
    }
    const gtag = (window as unknown as { gtag?: Gtag }).gtag;
    gtag?.("consent", "update", {
      ad_storage: value,
      ad_user_data: value,
      ad_personalization: value,
      analytics_storage: value,
    });
    // O pixel da Meta não tem Consent Mode: ou existe, ou não existe. Este
    // aviso é o que o faz nascer no instante em que a pessoa aceita, sem ela
    // ter de recarregar a página. O `storage` do browser só chega a OUTROS
    // separadores, por isso não servia para isto.
    try {
      window.dispatchEvent(new Event("liquen:consent-changed"));
    } catch {
      /* ambiente sem eventos sintéticos — o pixel nasce na próxima página */
    }
    setShow(false);
  };

  if (isBackOffice || !show) return null;
  const t = COPY[locale === "en" ? "en" : "pt"];

  // Nas variantes sociais o banner SOBE a altura da barra fixa, em vez de se
  // sentar em cima dela. Ver o cabeçalho de src/lib/meta/barra.ts: os dois
  // eram `bottom: 0`, o banner tem z-index maior, e o resultado era o botão
  // de WhatsApp — a acção principal da página — invisível para toda a gente
  // que chega de um anúncio.
  const acimaDaBarra = ehRotaSocial(pathname);

  return (
    <div
      // role="region" (a labelled landmark), NOT "dialog": the bar is
      // non-modal — it doesn't trap focus or block the page, so a dialog role
      // would be a false modal claim. It also kept colliding with the real
      // modal dialogs on the page (gallery lightbox) under getByRole('dialog').
      role="region"
      aria-label={t.aria}
      className="fixed inset-x-0 bottom-0 z-[70] border-t border-white/12 bg-moss-dark/95 backdrop-blur-sm px-5 py-4 sm:px-8"
      style={{
        // Fora das rotas sociais nada muda: `bottom: 0` (da classe) e o
        // preenchimento a respeitar a zona segura do iPhone.
        //
        // Nas sociais o banner ASSENTA EM CIMA da barra fixa. A altura da
        // barra soma-se à zona segura porque a própria barra já a reserva por
        // dentro — sem isso, o banner ficaria a tapar-lhe a parte de baixo
        // num telefone com barra de gestos.
        paddingBottom: "calc(1rem + env(safe-area-inset-bottom))",
        bottom: acimaDaBarra
          ? `calc(${ALTURA_BARRA_FIXA_PX}px + env(safe-area-inset-bottom))`
          : undefined,
      }}
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-[12.5px] leading-relaxed text-white/80">
          {t.text}{" "}
          <Link
            href={localizeHref("/privacidade", locale)}
            className="whitespace-nowrap text-white underline underline-offset-2 hover:text-white/90"
          >
            {t.more}
          </Link>
        </p>
        {/* Accept and Decline are given equal visual weight (same border, size
            and contrast). CNPD cookie guidance requires refusing to be as easy
            and as prominent as accepting — a low-contrast "decline" would be a
            dark pattern that undermines freely-given consent. */}
        <div className="flex flex-shrink-0 items-center gap-2.5">
          <button
            type="button"
            onClick={() => choose(false)}
            className="border border-white/70 px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-white hover:text-[#0c0e0b]"
          >
            {t.decline}
          </button>
          <button
            type="button"
            onClick={() => choose(true)}
            className="border border-white/70 px-5 py-2 text-[11px] uppercase tracking-[0.18em] text-white transition-colors hover:bg-white hover:text-[#0c0e0b]"
          >
            {t.accept}
          </button>
        </div>
      </div>
    </div>
  );
}
