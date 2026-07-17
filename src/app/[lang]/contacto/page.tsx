import type { Metadata } from "next";
import Link from "next/link";
import FAQ from "./FAQ";
import AnimateIn from "@/components/AnimateIn";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import { pageMetadata } from "@/lib/page-metadata";
import { BreadcrumbJsonLd, FaqJsonLd } from "@/components/JsonLd";
import WhatsAppIcon from "@/components/WhatsAppIcon";
import Parallax from "@/components/Parallax";
import KineticHeading from "@/components/KineticHeading";
import RatingBadge from "@/components/RatingBadge";
import HeroWebGL from "@/components/motion/HeroWebGL";
import { waHref } from "@/data";
import { SITE } from "@/lib/site";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.contactoTitle,
    description: t.meta.contactoDescription,
    path: "/contacto",
    image: "/imagens/DJI_20250913190635_0120_D.jpg",
    keywords: ["contacto Líquen Events", "decoração de eventos Alentejo"],
    ogLocale: t.meta.ogLocale,
  });
}

export default async function ContactoPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const steps = t.contacto.steps.map((s, i) => ({ step: `0${i + 1}`, ...s }));
  const tf = t.contacto.form;
  const td = t.contacto.direct;
  const heroImg = "/imagens/DJI_20250913190635_0120_D.jpg";
  // Fundos de foto para os dois CTA (com véu por cima para manter o contraste).
  const orcamentoCtaImg = "/imagens/DaniGui_JantarFesta_130.jpg";
  const whatsappCtaImg = "/imagens/Natalia e Jonathan-198.jpg";
  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.contacto, path: "/contacto" }]}
      />
      {/* Same source as the visible <FAQ /> — Google requires the FAQPage
          markup to match the on-page content, in the language being served. */}
      <FaqJsonLd faqs={t.contacto.faqs} />

      {/* ── Hero ── */}
      {/* -mt-24 cancels the global <main> pt-24 so the hero runs full-bleed to
          the very top behind the transparent navbar (no white strip / hairline). */}
      <section
        className="relative -mt-24 overflow-hidden"
        style={{ height: "65svh", minHeight: "420px" }}
      >
        <Parallax speed={0.14} className="absolute inset-0">
          <Image
            src={heroImg}
            {...blurFor(heroImg)}
            alt={t.common.imageAlt.contactoHero}
            fill
            preload
            sizes="100vw"
            className="object-cover hero-settle"
          />
        </Parallax>
        {/* WebGL layer over the static hero (fades in when ready; absent under
            reduced motion / no-WebGL). */}
        <HeroWebGL src={heroImg} className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/15" />
        <div className="absolute inset-0 flex flex-col justify-end px-6 lg:px-16 pb-20">
          <div className="max-w-7xl mx-auto w-full">
            <p className="text-cream/70 text-[10px] tracking-[0.5em] uppercase mb-8 flex items-center gap-3">
              <span className="w-5 h-px bg-gold/60 flex-shrink-0" />
              {tf.heroEyebrow}
            </p>
            <KineticHeading
              className="text-cream font-bold leading-[0.88] tracking-tight"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 7.5vw, 100px)" }}
              lines={[[{ text: tf.heroTitleLine1 }], [{ text: tf.heroTitleMoss, moss: true }]]}
            />
            <div className="mt-7">
              <RatingBadge
                label={t.common.reviewsLabel}
                ptFormat={locale === "pt"}
                starClassName="text-gold"
                textClassName="text-cream/75"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Canais diretos + CTA para o formulário único ──
          O antigo formulário de contacto foi retirado: /orcamento é agora o
          único formulário (capta o lead para o CRM). Aqui ficam os canais
          diretos (para perguntas rápidas) e o CTA que encaminha para esse
          formulário — sem dois funis a competir. */}
      <section className="bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr]">
            {/* ── Esquerda — canais diretos ── */}
            <div className="border-b border-foreground/8 lg:border-b-0 lg:border-r py-12 md:py-20 lg:pr-20">
              <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase mb-14 flex items-center gap-3">
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {tf.infoEyebrow}
              </p>

              <div className="flex flex-col divide-y divide-foreground/8 mb-12">
                {[
                  {
                    label: tf.emailLabel,
                    value: SITE.email,
                    href: `mailto:${SITE.email}`,
                    sub: tf.emailSub,
                  },
                  {
                    label: tf.phoneLabel,
                    value: SITE.phoneDisplay,
                    href: `tel:${SITE.phone}`,
                    sub: tf.phoneSub,
                  },
                  {
                    label: tf.locationLabel,
                    value: tf.locationValue,
                    href: SITE.googleBusiness,
                    sub: tf.locationSub,
                  },
                ].map((item) => (
                  <div key={item.label} className="py-7">
                    <p className="text-foreground/78 text-[10px] tracking-[0.45em] uppercase mb-2">
                      {item.label}
                    </p>
                    {item.href ? (
                      <a
                        href={item.href}
                        {...(item.href.startsWith("http")
                          ? { target: "_blank", rel: "noopener noreferrer" }
                          : {})}
                        className="text-foreground text-sm font-medium hover:text-moss transition-colors block mb-1.5"
                      >
                        {item.value}
                      </a>
                    ) : (
                      <p className="text-foreground text-sm font-medium mb-1.5">{item.value}</p>
                    )}
                    <p className="text-foreground/68 text-xs">{item.sub}</p>
                  </div>
                ))}
              </div>

              {/* WhatsApp — canal mais rápido para uma pergunta */}
              <a
                href={waHref(t.common.whatsappPrefill)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-6 py-4 border border-foreground/12 hover:border-moss/40 hover:bg-moss/6 transition-all duration-300 group mb-3"
              >
                <span className="text-moss flex-shrink-0">
                  <WhatsAppIcon className="w-4 h-4" />
                </span>
                <span className="text-[11px] tracking-[0.22em] uppercase text-foreground/68 group-hover:text-foreground/85 transition-colors">
                  {tf.whatsappLink}
                </span>
                <span
                  aria-hidden
                  className="ml-auto text-foreground/40 group-hover:text-moss/60 group-hover:translate-x-0.5 transition-all duration-300 text-sm"
                >
                  →
                </span>
              </a>

              {/* Google — Perfil de Empresa (Maps + avaliações). Reforça o
                  sinal local e dá aos clientes um caminho direto para avaliar. */}
              <a
                href={SITE.googleBusiness}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 w-full px-6 py-4 border border-foreground/12 hover:border-gold/50 hover:bg-gold/[0.06] transition-all duration-300 group mb-12"
              >
                <span className="flex-shrink-0" aria-hidden>
                  <svg viewBox="0 0 24 24" className="w-4 h-4">
                    <path
                      fill="#4285F4"
                      d="M23.5 12.27c0-.79-.07-1.54-.2-2.27H12v4.51h6.47a5.53 5.53 0 0 1-2.4 3.58v3h3.88c2.27-2.09 3.55-5.17 3.55-8.82z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.96-1.08 7.95-2.91l-3.88-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.27 14.29a7.2 7.2 0 0 1 0-4.58V6.62H1.28a12 12 0 0 0 0 10.76z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.18 15.24 0 12 0A12 12 0 0 0 1.28 6.62l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75z"
                    />
                  </svg>
                </span>
                <span className="text-[11px] tracking-[0.22em] uppercase text-foreground/68 group-hover:text-foreground/85 transition-colors">
                  {tf.googleLink}
                </span>
                <span
                  aria-hidden
                  className="ml-auto text-foreground/40 group-hover:text-gold group-hover:translate-x-0.5 transition-all duration-300 text-sm"
                >
                  →
                </span>
              </a>

              {/* Redes */}
              <div className="flex gap-7 mb-14">
                {[
                  { label: "Instagram", href: SITE.instagram },
                  { label: "Facebook", href: SITE.facebook },
                ].map((s) => (
                  <a
                    key={s.label}
                    href={s.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] tracking-[0.25em] uppercase text-foreground/68 hover:text-foreground/78 transition-colors border-b border-foreground/12 pb-0.5 hover:border-foreground/40"
                  >
                    {s.label}
                  </a>
                ))}
              </div>

              {/* Promise */}
              <div className="border-l-2 border-moss/40 pl-7 py-2">
                <p
                  className="text-foreground/72 text-base leading-relaxed mb-4"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {tf.promise}
                </p>
                <p className="text-foreground/68 text-[10px] tracking-[0.3em] uppercase">
                  {tf.promiseSign}
                </p>
              </div>
            </div>

            {/* ── Direita — CTA para o formulário único (/orcamento) ──
                Painel com foto de um evento decorado + véu escuro por cima,
                para o texto (cream) manter contraste AA sobre a imagem. */}
            <div className="relative overflow-hidden flex flex-col justify-center py-14 px-8 md:py-20 md:px-12 lg:pl-20 lg:pr-12">
              <Image
                src={orcamentoCtaImg}
                {...blurFor(orcamentoCtaImg)}
                alt=""
                aria-hidden
                fill
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-br from-ink/85 via-ink/72 to-moss-dark/70" />
              <AnimateIn>
                <div className="relative">
                  <p className="text-cream/70 text-[10px] tracking-[0.5em] uppercase mb-8 flex items-center gap-3">
                    <span className="w-5 h-px bg-gold flex-shrink-0" />
                    {td.ctaEyebrow}
                  </p>
                  <h2
                    className="text-cream font-bold leading-[0.95] tracking-tight mb-8"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(34px, 4.5vw, 60px)",
                    }}
                  >
                    {td.ctaTitleLine1}
                    <br />
                    <span className="text-gold">{td.ctaTitleMoss}</span>
                  </h2>
                  <p className="text-cream/85 text-base leading-[1.85] max-w-md mb-12">
                    {td.ctaText}
                  </p>
                  <Link
                    href={localizeHref("/orcamento", locale)}
                    className="inline-flex w-fit items-center gap-3 bg-cream px-8 py-4 text-[11px] font-medium uppercase tracking-[0.3em] text-ink transition-all duration-300 hover:bg-cream-dark"
                  >
                    {td.ctaButton} →
                  </Link>
                </div>
              </AnimateIn>
            </div>
          </div>
        </div>
      </section>

      {/* ── Depoimentos ── */}
      <section className="py-16 sm:py-24 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/72 text-xs tracking-[0.3em] uppercase mb-16 flex items-center gap-3">
              <span className="w-6 h-px bg-gold flex-shrink-0" />
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
              {
                src: "/imagens/Natalia e Jonathan-315.jpg",
                alt: "Cerimónia de casamento ao ar livre no Alentejo",
              },
              {
                src: "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg",
                alt: "Casamento ao pôr do sol numa herdade alentejana",
              },
              {
                src: "/imagens/M&F0658.jpg",
                alt: "Mesa posta de jantar de casamento com decoração floral",
              },
            ].map(({ src, alt }, i) => (
              <div key={src} className="relative overflow-hidden group">
                <Image
                  src={src}
                  {...blurFor(src)}
                  alt={t.common.imageAlt.contactoBand[i] ?? alt}
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
                    <span
                      aria-hidden
                      className="text-foreground/25 text-xs font-mono mt-1 tabular-nums"
                    >
                      {p.step}
                    </span>
                    <h3
                      className="text-foreground text-lg font-bold"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {p.title}
                    </h3>
                  </div>
                  <p className="lg:col-span-4 text-foreground/72 text-sm leading-relaxed max-w-xl">
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
                  <span className="w-6 h-px bg-gold flex-shrink-0" />
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
                <p className="text-foreground/72 text-sm leading-relaxed mt-6 max-w-xs">
                  {t.contacto.faqSub}
                </p>
              </div>
              <FAQ />
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── WhatsApp CTA ──
          Foto de evento com um escurecimento cinematográfico (preto) — o mesmo
          tratamento das restantes secções finais do site, para a imagem
          respirar em vez de ficar lavada de verde. Um brilho verde muito subtil
          no canto mantém o toque de marca; o texto cream continua a garantir
          contraste AA sobre o véu escuro. */}
      <section className="py-20 sm:py-32 bg-[#0c0e0b] relative overflow-hidden border-t border-white/10">
        <Image
          src={whatsappCtaImg}
          {...blurFor(whatsappCtaImg)}
          alt=""
          aria-hidden
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-[#080808]/15 to-[#080808]/45" />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 105% 110%, rgba(99, 122, 95, 0.28) 0%, transparent 55%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <AnimateIn>
            <p className="text-cream/80 text-[10px] tracking-[0.5em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-cream/45 flex-shrink-0" />
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
            <p className="text-cream/85 text-base leading-relaxed max-w-md mb-12">
              {t.contacto.whatsappText}
            </p>
            <div className="flex flex-wrap gap-4">
              <a
                href={waHref(t.common.whatsappPrefill)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 px-8 py-4 bg-cream text-ink font-medium hover:bg-cream-dark transition-all duration-300 text-[11px] tracking-[0.3em] uppercase"
              >
                <WhatsAppIcon className="w-4 h-4 flex-shrink-0" />
                {t.common.abrirWhatsApp} →
              </a>
              <a
                href={`mailto:${SITE.email}`}
                className="inline-flex items-center gap-3 px-8 py-4 border border-cream/35 text-cream/85 font-medium hover:border-cream/60 hover:text-cream transition-all duration-300 text-[11px] tracking-[0.3em] uppercase"
              >
                {t.common.enviarEmail}
              </a>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
