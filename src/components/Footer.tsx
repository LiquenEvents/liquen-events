import Link from "next/link";
import Image from "next/image";
import TrackedLink from "@/components/TrackedLink";
import { blurFor } from "@/lib/blur";
import RotatingPhotoGrid from "@/components/RotatingPhotoGrid";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, localizeHref, type Locale } from "@/lib/i18n";

// The footer photo strip draws a fresh 3 from this pool on every entry to the
// page (see RotatingPhotoGrid), so it changes as you move around the site.
const STRIP_POOL = [
  "/imagens/JOAO_E_PEDRO_DJI_20250628213935_0005_D.jpg",
  "/imagens/M&F0152.jpg",
  "/imagens/EW1_1428.jpg",
  "/imagens/hd-edited.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/J&P-IMGL4769.jpg",
  "/imagens/teresinhaeze-909.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/DJI_20250913190635_0120_D.jpg",
  "/imagens/matilde-e-tomas0654-1.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
];

const STRIP_CELLS = [
  { cls: "col-span-2", sizes: "50vw" },
  { cls: "col-span-1", sizes: "25vw" },
  { cls: "col-span-1", sizes: "25vw" },
];

// Service detail slugs, paired with t.footer.serviceLinks (same order) — gives
// the money pages keyword-anchored internal links from every page's footer.
const serviceSlugs = [
  "casamentos",
  "eventos-corporativos",
  "festas-e-aniversarios",
  "jantares-de-gala",
];

export default function Footer({ locale = "pt" }: { locale?: Locale }) {
  const t = getDictionary(locale);
  const stripPool = STRIP_POOL.map((src) => ({ src, blurDataURL: blurFor(src).blurDataURL }));
  const pages: [string, string][] = [
    [t.nav.sobre, "/sobre"],
    [t.nav.servicos, "/servicos"],
    [t.nav.galeria, "/galeria"],
    [t.nav.clientes, "/clientes"],
    [t.nav.contacto, "/contacto"],
  ];
  return (
    <footer className="relative bg-transparent overflow-hidden">
      {/* ── Photo strip — full bleed, 4-col grid; rotates per entry ── */}
      <RotatingPhotoGrid
        cells={STRIP_CELLS}
        pool={stripPool}
        alt=""
        className="grid grid-cols-4 h-[130px] sm:h-[170px] lg:h-[210px]"
        imgClassName="transition-transform duration-700 group-hover:scale-[1.04]"
        overlayClassName="bg-black/30 group-hover:bg-black/10"
      />

      {/* ── Main content ── */}
      <div className="border-t border-foreground/6">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="py-10 md:py-14 grid grid-cols-1 md:grid-cols-12 gap-8 md:gap-12">
            {/* Brand column */}
            <div className="md:col-span-5 flex flex-col">
              <Image
                src="/logo-liquen.png"
                alt="Líquen Events"
                width={215}
                height={128}
                className="object-contain mb-6 h-28 sm:h-36 w-auto"
              />
              <p className="text-foreground/72 text-sm leading-[1.85] max-w-[260px] mb-7">
                {t.footer.sloganLine1}
                <br />
                {t.footer.sloganLine2}
              </p>

              {/* Social icons — sem o antigo badge "disponível": nada de pontos
                  a pulsar (idioma SpaceX = sem ornamentos animados). mb-9 passou
                  para este bloco para manter o mesmo respiro abaixo do slogan. */}
              <div className="flex items-center gap-5 mt-2">
                {[
                  {
                    label: "Instagram",
                    href: SITE.instagram,
                    icon: (
                      <svg
                        width="18"
                        height="18"
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
                    ),
                  },
                  {
                    label: "Facebook",
                    href: SITE.facebook,
                    icon: (
                      <svg
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" />
                      </svg>
                    ),
                  },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={s.label}
                    className="inline-flex items-center justify-center p-2 -m-2 text-foreground/68 hover:text-moss transition-colors duration-300"
                  >
                    {s.icon}
                  </a>
                ))}

                {/* WhatsApp */}
                <a
                  href={WHATSAPP_HREF}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="WhatsApp"
                  className="inline-flex items-center justify-center p-2 -m-2 text-foreground/68 hover:text-moss transition-colors duration-300"
                >
                  <WhatsAppIcon className="w-[18px] h-[18px]" />
                </a>
              </div>
            </div>

            {/* Pages */}
            <div className="md:col-span-3">
              <p className="text-foreground/78 text-[10px] tracking-[0.42em] uppercase mb-8">
                {t.footer.paginas}
              </p>
              <ul className="flex flex-col gap-4">
                {pages.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={localizeHref(href, locale)}
                      className="link-line text-[13px] text-foreground/72 hover:text-moss transition-colors duration-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="text-foreground/78 text-[10px] tracking-[0.42em] uppercase mt-10 mb-8">
                {t.footer.servicosTitulo}
              </p>
              <ul className="flex flex-col gap-4">
                {serviceSlugs.map((slug, i) => (
                  <li key={slug}>
                    <Link
                      href={localizeHref(`/servicos/${slug}`, locale)}
                      className="link-line text-[13px] text-foreground/72 hover:text-moss transition-colors duration-300"
                    >
                      {t.footer.serviceLinks[i]}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div className="md:col-span-4">
              <p className="text-foreground/78 text-[10px] tracking-[0.42em] uppercase mb-8">
                {t.footer.contacto}
              </p>
              <div className="flex flex-col gap-4 text-[13px] text-foreground/72 mb-10">
                <a
                  href={`mailto:${SITE.email}`}
                  className="link-line hover:text-foreground/78 transition-colors duration-300"
                >
                  {SITE.email}
                </a>
                <a
                  href={`tel:${SITE.phone}`}
                  className="link-line hover:text-foreground/78 transition-colors duration-300"
                >
                  {SITE.phoneDisplay}
                </a>
                <span className="text-foreground/78">{t.footer.country}</span>
              </div>
              {/* CTA no idioma SpaceX — filete quadrado que enche no hover com
                  inversão de texto (o ground do footer é branco, por isso enche
                  a foreground escura e o texto passa a claro), em vez do antigo
                  hover que só tingia o traço de moss. */}
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "footer" }}
                className="inline-flex items-center gap-2.5 px-6 py-3 border border-foreground/25 text-foreground/70 text-[11px] tracking-[0.25em] uppercase hover:bg-foreground hover:text-white hover:border-foreground transition-colors duration-300 ease-expo"
              >
                {t.footer.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
            </div>
          </div>
        </div>
      </div>

      {/* ── Copyright bar ── */}
      <div className="border-t border-foreground/6 py-6">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <p className="text-[11px] text-foreground/78 tracking-wide">
            © {new Date().getFullYear()} Líquen Events — {t.footer.rights}
          </p>
          <div className="flex items-center gap-5 text-[11px] text-foreground/68 tracking-wide">
            <Link
              href={localizeHref("/privacidade", locale)}
              className="link-line hover:text-moss transition-colors"
            >
              {t.footer.privacidade}
            </Link>
            <Link
              href={localizeHref("/termos", locale)}
              className="link-line hover:text-moss transition-colors"
            >
              {t.footer.termos}
            </Link>
          </div>
          <p className="text-[11px] text-foreground/68 tracking-[0.28em] uppercase">
            {t.footer.country}
          </p>
        </div>
      </div>
    </footer>
  );
}
