import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import WhatsAppIcon from "./WhatsAppIcon";
import { WHATSAPP_HREF } from "@/data";

const pages = [
  ["Sobre", "/sobre"],
  ["Serviços", "/servicos"],
  ["Galeria", "/galeria"],
  ["Clientes", "/clientes"],
  ["Contacto", "/contacto"],
];

const stripPhotos = [
  { src: "/imagens/JOAO_E_PEDRO_DJI_20250628213935_0005_D.jpg", span: "col-span-2" },
  { src: "/imagens/M&F0152.jpg", span: "col-span-1" },
  { src: "/imagens/EW1_1428.jpg", span: "col-span-1" },
];

export default function Footer() {
  return (
    <footer className="relative bg-transparent overflow-hidden">
      {/* ── Photo strip — full bleed, 4-col grid ── */}
      <div className="grid grid-cols-4 h-[180px] sm:h-[240px] lg:h-[300px]">
        {stripPhotos.map((p, i) => (
          <div key={i} className={`relative overflow-hidden group ${p.span}`}>
            <Image
              src={p.src}
              {...blurFor(p.src)}
              alt=""
              fill
              sizes="(max-width: 768px) 50vw, 25vw"
              className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
            />
            <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-colors duration-500" />
          </div>
        ))}
      </div>

      {/* ── Main content ── */}
      <div className="border-t border-foreground/6">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="py-12 md:py-20 grid grid-cols-1 md:grid-cols-12 gap-10 md:gap-16">
            {/* Brand column */}
            <div className="md:col-span-5 flex flex-col">
              <Image
                src="/logo-liquen-branco.png"
                alt="Líquen Events"
                width={124}
                height={42}
                className="object-contain mb-5 opacity-65"
              />
              <p className="text-foreground/30 text-sm leading-[1.85] max-w-[260px] mb-7">
                Organizamos eventos,
                <br />
                eternizamos memórias.
              </p>

              {/* Disponível badge */}
              <div className="flex items-center gap-2.5 mb-9">
                <span className="relative flex h-2 w-2 flex-shrink-0">
                  <span className="footer-ping absolute inline-flex h-full w-full rounded-full bg-moss opacity-60" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-moss" />
                </span>
                <span className="text-[10px] tracking-[0.32em] uppercase text-foreground/30">
                  Disponível para novos eventos
                </span>
              </div>

              {/* Social icons */}
              <div className="flex items-center gap-5">
                {[
                  {
                    label: "Instagram",
                    href: "https://www.instagram.com/liquen.events",
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
                    href: "https://www.facebook.com/liquen.events",
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
                    className="text-foreground/28 hover:text-foreground/70 transition-colors duration-300"
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
                  className="text-foreground/28 hover:text-moss transition-colors duration-300"
                >
                  <WhatsAppIcon className="w-[18px] h-[18px]" />
                </a>
              </div>
            </div>

            {/* Pages */}
            <div className="md:col-span-3">
              <p className="text-foreground/20 text-[10px] tracking-[0.42em] uppercase mb-8">
                Páginas
              </p>
              <ul className="flex flex-col gap-4">
                {pages.map(([label, href]) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="link-line text-[13px] text-foreground/35 hover:text-foreground/68 transition-colors duration-300"
                    >
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Contact */}
            <div className="md:col-span-4">
              <p className="text-foreground/20 text-[10px] tracking-[0.42em] uppercase mb-8">
                Contacto
              </p>
              <div className="flex flex-col gap-4 text-[13px] text-foreground/35 mb-10">
                <a
                  href="mailto:liquen.alentejo@gmail.com"
                  className="link-line hover:text-foreground/65 transition-colors duration-300"
                >
                  liquen.alentejo@gmail.com
                </a>
                <a
                  href="tel:+351919259820"
                  className="link-line hover:text-foreground/65 transition-colors duration-300"
                >
                  +351 919 259 820
                </a>
                <span className="text-foreground/20">Évora, Portugal</span>
              </div>
              <Link
                href="/orcamento"
                className="inline-flex items-center gap-2.5 px-6 py-3 border border-foreground/12 text-foreground/38 text-[11px] tracking-[0.25em] uppercase rounded-sm hover:border-moss/40 hover:text-moss transition-all duration-300"
              >
                Pedir orçamento →
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* ── Giant wordmark ── */}
      <div className="border-t border-foreground/6 overflow-hidden">
        <p
          aria-hidden
          className="select-none pointer-events-none font-bold tracking-[-0.02em] leading-none text-foreground/[0.052] px-4 lg:px-12 pt-6 pb-1"
          style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(72px, 14.5vw, 218px)" }}
        >
          Líquen Events
        </p>
      </div>

      {/* ── Copyright bar ── */}
      <div className="border-t border-foreground/6 py-6">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <p className="text-[11px] text-foreground/20 tracking-wide">
            © {new Date().getFullYear()} Líquen Events — Todos os direitos reservados
          </p>
          <p className="text-[11px] text-foreground/14 tracking-[0.28em] uppercase">
            Évora · Portugal
          </p>
        </div>
      </div>
    </footer>
  );
}
