import Link from "next/link";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";
import { blurFor } from "@/lib/blur";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, localizeHref, type Locale } from "@/lib/i18n";

// Editorial footer background — a long-table photo from João & Pedro's wedding
// under a dark veil, so the footer reads as one immersive, premium band
// (wedding-editorial look). Chosen for warmth + legibility under white text.
const FOOTER_BG = "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg";

// Service detail slugs, paired with t.footer.serviceLinks (same order) — gives
// the money pages keyword-anchored internal links from every page's footer.
const serviceSlugs = [
  "casamentos",
  "aluguer-de-viaturas-classicas",
  "eventos-corporativos",
  "festas-e-aniversarios",
];

export default function Footer({ locale = "pt" }: { locale?: Locale }) {
  const t = getDictionary(locale);
  return (
    <footer className="relative overflow-hidden bg-[#0c0e0b] text-white">
      {/* ── Background photo + dark veil ── */}
      <Image
        src={FOOTER_BG}
        {...blurFor(FOOTER_BG)}
        alt=""
        fill
        sizes="100vw"
        quality={70}
        // Frame lower-centre so the long table (foreground of the photo) is the
        // part that shows, instead of the middle band of the building.
        className="absolute inset-0 object-cover object-[50%_68%]"
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          backgroundImage: "linear-gradient(to bottom, rgba(7,8,7,0.55), rgba(7,8,7,0.8))",
        }}
      />
      {/* Soft top fade (no hard line): the footer image eases in from the dark
          section above as you scroll, so the backgrounds read as one continuous
          flow instead of two panels with a seam between them. */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-40"
        style={{ backgroundImage: "linear-gradient(to bottom, rgba(7,8,7,0.9), transparent)" }}
      />

      {/* ── Content (over the photo) ── */}
      <div className="relative">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          {/* Editorial hero — big white logo, serif promise, CTA, social */}
          <div className="pt-16 pb-12 flex flex-col items-center text-center">
            <Image
              src="/logo-liquen-branco.png"
              alt="Líquen Events"
              width={215}
              height={128}
              className="h-20 sm:h-24 w-auto object-contain"
            />
            <p className="mt-7 max-w-xl text-white font-semibold uppercase tracking-display text-[18px] sm:text-[21px] leading-snug">
              {t.footer.sloganLine1} {t.footer.sloganLine2}
            </p>
            <TrackedLink
              href={localizeHref("/orcamento", locale)}
              trackProps={{ source: "footer" }}
              className="mt-8 inline-flex items-center gap-2.5 px-8 py-3.5 border border-white/35 text-white/90 text-[11px] tracking-[0.25em] uppercase hover:bg-white hover:text-[#0c0e0b] hover:border-white transition-colors duration-300 ease-expo"
            >
              {t.footer.pedirOrcamento} <span aria-hidden>→</span>
            </TrackedLink>

            {/* Social icons */}
            <div className="mt-9 flex items-center gap-6">
              <a
                href={SITE.instagram}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Instagram (${t.common.newWindow})`}
                className="inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="2" y="2" width="20" height="20" rx="5" />
                  <circle cx="12" cy="12" r="4" />
                  <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
                </svg>
              </a>
              <a
                href={SITE.facebook}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Facebook (${t.common.newWindow})`}
                className="inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
              >
                <svg
                  width="19"
                  height="19"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                </svg>
              </a>
              <a
                href={WHATSAPP_HREF}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`WhatsApp (${t.common.newWindow})`}
                className="inline-flex items-center justify-center p-2 -m-2 text-white/60 hover:text-white transition-colors duration-300"
              >
                <WhatsAppIcon className="w-[19px] h-[19px]" />
              </a>
            </div>
          </div>

          {/* Serviços + Contacto — centred on mobile, two columns from sm up */}
          <div className="border-t border-white/12 py-10 flex flex-col sm:flex-row sm:justify-between gap-8 text-center sm:text-left">
            <div>
              <p className="text-white/55 text-[10px] tracking-[0.42em] uppercase mb-4">
                {t.footer.servicosTitulo}
              </p>
              <ul className="flex flex-col gap-2.5">
                {serviceSlugs.map((slug, i) => (
                  <li key={slug}>
                    <Link
                      href={localizeHref(`/servicos/${slug}`, locale)}
                      className="link-line text-[13px] text-white/75 hover:text-white transition-colors duration-300"
                    >
                      {t.footer.serviceLinks[i]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
            <div className="sm:text-right">
              <p className="text-white/55 text-[10px] tracking-[0.42em] uppercase mb-4">
                {t.footer.contacto}
              </p>
              <div className="flex flex-col gap-2.5 text-[13px] text-white/75">
                <a
                  href={`mailto:${SITE.email}`}
                  className="link-line hover:text-white transition-colors duration-300"
                >
                  {SITE.email}
                </a>
                <a
                  href={`tel:${SITE.phone}`}
                  className="link-line hover:text-white transition-colors duration-300"
                >
                  {SITE.phoneDisplay}
                </a>
                <span className="text-white/55">{t.footer.country}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Copyright bar ── */}
        <div className="border-t border-white/12 py-5">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 flex flex-col sm:flex-row justify-between items-center gap-3 text-center">
            <p className="text-[11px] text-white/55 tracking-wide">
              © {new Date().getFullYear()} Líquen Events — {t.footer.rights}
            </p>
            <div className="flex items-center gap-5 text-[11px] text-white/55 tracking-wide">
              <Link
                href={localizeHref("/privacidade", locale)}
                className="link-line hover:text-white transition-colors"
              >
                {t.footer.privacidade}
              </Link>
              <Link
                href={localizeHref("/termos", locale)}
                className="link-line hover:text-white transition-colors"
              >
                {t.footer.termos}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
