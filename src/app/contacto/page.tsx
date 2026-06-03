import type { Metadata } from "next";
import ContactForm from "./ContactForm";
import FAQ from "./FAQ";
import FaqJsonLd from "./FaqJsonLd";
import AnimateIn from "@/components/AnimateIn";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import Link from "next/link";
import { pageMetadata } from "@/lib/page-metadata";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import { WHATSAPP_HREF_CTA } from "@/data";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export const metadata: Metadata = pageMetadata({
  title: "Contacto — Peça o Seu Orçamento de Evento",
  description:
    "Contacte a Líquen Events para organizar o seu evento no Alentejo, Lisboa ou em qualquer ponto de Portugal. Respondemos em menos de 24 horas com uma proposta à medida.",
  path: "/contacto",
  keywords: ["contacto Líquen Events", "organização de eventos Alentejo"],
});

export default async function ContactoPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const steps = t.contacto.steps.map((s, i) => ({ step: `0${i + 1}`, ...s }));
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Contacto", path: "/contacto" }]} />
      <FaqJsonLd />
      <ContactForm />

      {/* ── Depoimentos ── */}
      <section className="py-16 sm:py-24 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/72 text-xs tracking-[0.3em] uppercase mb-16 flex items-center gap-3">
              <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
              {t.contacto.testimonialsEyebrow}
            </p>
          </AnimateIn>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-foreground/[0.06]">
            {t.testimonials.slice(1).map((item, i) => (
              <AnimateIn key={item.name} delay={i * 80}>
                <div className="bg-surface p-10 lg:p-12 flex flex-col gap-6 h-full">
                  <span
                    className="text-moss/30 text-4xl font-bold leading-none"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    &ldquo;
                  </span>
                  <p
                    className="text-foreground/72 text-sm leading-[1.9] flex-1"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {item.quote}
                  </p>
                  <div>
                    <p className="text-foreground text-sm font-semibold">{item.name}</p>
                    <p className="text-moss text-xs mt-1 tracking-wide">{item.role}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Image band ── */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div className="grid grid-cols-3 gap-px" style={{ height: "clamp(180px, 38vw, 460px)" }}>
            {[
              "/imagens/Natalia e Jonathan-315.jpg",
              "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg",
              "/imagens/M&F0658.jpg",
            ].map((src) => (
              <div key={src} className="relative overflow-hidden group">
                <Image
                  src={src}
                  {...blurFor(src)}
                  alt="Evento organizado pela Líquen Events"
                  fill
                  sizes="33vw"
                  className="object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/25 group-hover:bg-black/10 transition-colors duration-500" />
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── O que acontece a seguir ── */}
      <section className="py-16 sm:py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/68 text-[10px] tracking-[0.48em] uppercase mb-20 flex items-center gap-3">
              <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
              {t.contacto.nextEyebrow}
            </p>
          </AnimateIn>
          <div>
            {steps.map((p, i) => (
              <AnimateIn key={p.step} delay={i * 70}>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-20 py-10 border-t border-foreground/8">
                  <div className="lg:col-span-1 flex items-start gap-4">
                    <span className="text-foreground/15 text-xs font-mono mt-1 tabular-nums">
                      {p.step}
                    </span>
                    <h3
                      className="text-foreground text-lg font-bold"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {p.title}
                    </h3>
                  </div>
                  <p className="lg:col-span-4 text-foreground/60 text-sm leading-relaxed max-w-xl">
                    {p.desc}
                  </p>
                </div>
              </AnimateIn>
            ))}
            <div className="border-t border-foreground/8" />
          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-16 sm:py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_2fr] gap-20 items-start">
              <div className="lg:sticky" style={{ top: "6rem" }}>
                <p className="text-foreground/72 text-xs tracking-[0.3em] uppercase mb-8 flex items-center gap-3">
                  <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
                  {t.contacto.faqEyebrow}
                </p>
                <h2
                  className="text-foreground text-4xl lg:text-5xl font-bold leading-tight"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {t.contacto.faqTitleLine1}
                  <br />
                  {t.contacto.faqTitleLine2}
                </h2>
                <p className="text-foreground/60 text-sm leading-relaxed mt-6 max-w-xs">
                  {t.contacto.faqSub}
                </p>
              </div>
              <FAQ />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── WhatsApp CTA ── */}
      <section className="py-20 sm:py-32 bg-moss-dark relative overflow-hidden border-t border-moss/20">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 105% 110%, rgba(124, 133, 75,0.5) 0%, transparent 55%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <AnimateIn>
            <p className="text-cream/30 text-[10px] tracking-[0.5em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-cream/30 rounded-full flex-shrink-0" />
              {t.contacto.whatsappEyebrow}
            </p>
            <h2
              className="text-cream font-bold leading-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 5vw, 72px)" }}
            >
              {t.contacto.whatsappTitleLine1}
              <br />
              {t.contacto.whatsappTitleLine2}
            </h2>
            <p className="text-cream/45 text-base leading-relaxed max-w-md mb-12">
              {t.contacto.whatsappText}
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href={WHATSAPP_HREF_CTA}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-cream text-ink font-medium rounded-sm hover:bg-cream-dark transition-all duration-300 text-[11px] tracking-[0.3em] uppercase"
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                {t.common.abrirWhatsApp} →
              </a>
              <Link
                href="mailto:liquen.alentejo@gmail.com"
                className="inline-flex items-center gap-3 px-8 py-4 border border-cream/20 text-cream/60 font-medium rounded-sm hover:border-cream/40 hover:text-cream/85 transition-all duration-300 text-[11px] tracking-[0.3em] uppercase"
              >
                {t.common.enviarEmail}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
