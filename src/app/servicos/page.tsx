import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return pageMetadata({
    title: t.meta.servicosTitle,
    description: t.meta.servicosDescription,
    path: "/servicos",
    image: "/imagens/EW1_1408.jpg",
    keywords: [
      "wedding planner Alentejo",
      "eventos corporativos Lisboa",
      "conferências e congressos",
      "organização de festas Alentejo",
    ],
    ogLocale: t.meta.ogLocale,
  });
}

const navMeta = [{ id: "empresas" }, { id: "celebracoes" }];

/* ── Mosaico editorial para categorias ── */
type ServiceCard = {
  title: string;
  slug: string;
  desc: string;
  image: string;
};

type Category = {
  id: string;
  num: string;
  label: string;
  subtitle: string;
  desc: string;
  layout: "mosaic-right" | "mosaic-left" | "duo";
  services: ServiceCard[];
};

// Locale-independent metadata (ids, images, slugs, layout). Display text comes
// from the dictionary (t.servicos.categories) and is merged in at render time.
const categoryMeta = [
  {
    id: "empresas",
    num: "01",
    layout: "mosaic-right" as const,
    services: [
      { slug: "eventos-corporativos", image: "/imagens/EW1_1330.jpg" },
      { slug: "eventos-corporativos", image: "/imagens/EW1_0576.jpg" },
      { slug: "eventos-corporativos", image: "/imagens/EW1_0697.jpg" },
      { slug: "eventos-corporativos", image: "/imagens/EW1_1404.jpg" },
    ],
  },
  {
    id: "celebracoes",
    num: "02",
    layout: "mosaic-left" as const,
    services: [
      { slug: "casamentos", image: "/imagens/DaniGui_Preview18.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/DaniGui_JantarFesta_11.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/DaniGui_JantarFesta_1.jpg" },
      { slug: "jantares-de-gala", image: "/imagens/JOAO_E_PEDRO_IMGL2180.jpg" },
    ],
  },
];

/* ── Service card ── */
function ServiceCard({
  service,
  index,
  catNum,
  cta,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  service: ServiceCard;
  index: number;
  catNum: string;
  cta: string;
  sizes?: string;
}) {
  return (
    <Link
      href={`/servicos/${service.slug}`}
      className="group relative block overflow-hidden bg-surface-raised h-full w-full"
    >
      <Image
        src={service.image}
        {...blurFor(service.image)}
        alt={service.title}
        fill
        sizes={sizes}
        className="object-cover transition-transform duration-700 group-hover:scale-105"
      />
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
      {/* Hover darkening */}
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors duration-500" />

      {/* Index label top-right */}
      <div className="absolute top-4 right-4">
        <span className="text-cream/15 text-[9px] tracking-[0.3em] font-mono">
          {catNum}.{String(index + 1).padStart(2, "0")}
        </span>
      </div>

      {/* Bottom content */}
      <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6 lg:p-7">
        <p className="text-moss/60 text-[9px] tracking-[0.5em] font-mono uppercase mb-2">
          {String(index + 1).padStart(2, "0")}
        </p>
        <h3
          className="text-cream font-bold leading-tight mb-2"
          style={{
            fontFamily: "var(--font-playfair)",
            fontSize: "clamp(15px, 1.6vw, 22px)",
          }}
        >
          {service.title}
        </h3>
        {/* Mobile: always show desc; desktop: reveal on hover */}
        <p className="text-cream/40 text-xs leading-relaxed md:opacity-0 md:max-h-0 md:group-hover:opacity-100 md:group-hover:max-h-[80px] overflow-hidden transition-all duration-500 ease-out">
          {service.desc}
        </p>
        <span className="hidden md:inline text-moss text-[10px] tracking-[0.35em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-400 delay-150">
          {cta} →
        </span>
      </div>
    </Link>
  );
}

/* ── Mosaic grid — 4 services ── */
function MosaicGrid({ cat, cta }: { cat: Category; cta: string }) {
  const [s0, s1, s2, s3] = cat.services;
  const isRight = cat.layout === "mosaic-right";

  return (
    <div
      className="grid gap-2"
      style={{
        gridTemplateColumns: "repeat(3, 1fr)",
        gridTemplateRows: "clamp(220px,28vw,400px) clamp(220px,28vw,400px)",
      }}
    >
      {isRight ? (
        <>
          {/* Wide top-left */}
          <div className="col-span-2 row-span-1">
            <ServiceCard
              service={s0}
              index={0}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 65vw"
            />
          </div>
          {/* Tall right */}
          <div className="col-span-1 row-span-2">
            <ServiceCard
              service={s1}
              index={1}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 35vw"
            />
          </div>
          {/* Bottom left small */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s2}
              index={2}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
          {/* Bottom mid */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s3}
              index={3}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
        </>
      ) : (
        <>
          {/* Tall left */}
          <div className="col-span-1 row-span-2">
            <ServiceCard
              service={s0}
              index={0}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 35vw"
            />
          </div>
          {/* Wide top-right */}
          <div className="col-span-2 row-span-1">
            <ServiceCard
              service={s1}
              index={1}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 65vw"
            />
          </div>
          {/* Bottom mid */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s2}
              index={2}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
          {/* Bottom right */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s3}
              index={3}
              catNum={cat.num}
              cta={cta}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Duo grid — 2 services ── */
function DuoGrid({ cat, cta }: { cat: Category; cta: string }) {
  return (
    <div
      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      style={{ height: "clamp(280px, 36vw, 520px)" }}
    >
      {cat.services.map((s, i) => (
        <ServiceCard
          key={s.title}
          service={s}
          index={i}
          catNum={cat.num}
          cta={cta}
          sizes="(max-width: 640px) 100vw, 50vw"
        />
      ))}
    </div>
  );
}

/* ── Mobile card list ── */
function MobileCardStack({ cat, cta }: { cat: Category; cta: string }) {
  return (
    <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: "clamp(200px, 48vw, 320px)" }}>
      {cat.services.map((s, i) => (
        <ServiceCard key={s.title} service={s} index={i} catNum={cat.num} cta={cta} sizes="50vw" />
      ))}
    </div>
  );
}

export default async function ServicosPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const ts = t.servicos;
  const navItems = navMeta.map((m, i) => ({ ...m, label: ts.nav[i] }));
  const categories: Category[] = categoryMeta.map((m, ci) => {
    const ct = ts.categories[ci];
    return {
      id: m.id,
      num: m.num,
      layout: m.layout,
      label: ct.label,
      subtitle: ct.subtitle,
      desc: ct.desc,
      services: m.services.map((s, si) => ({
        slug: s.slug,
        image: s.image,
        title: ct.services[si].title,
        desc: ct.services[si].desc,
      })),
    };
  });
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Serviços", path: "/servicos" }]} />
      <ServiceJsonLd
        name="Organização de eventos, casamentos e eventos corporativos"
        description="Organização de casamentos, eventos corporativos, conferências e celebrações em Lisboa e todo o Portugal — da decoração à coordenação."
        path="/servicos"
      />

      {/* ── Hero ── */}
      <section className="relative min-h-[100svh] flex items-end pb-0 pt-24 md:pt-36 bg-surface overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at -10% 80%, rgba(124, 133, 75,0.07) 0%, transparent 55%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-16 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-end">
            {/* Left — headline */}
            <div className="lg:col-span-7 pb-2">
              <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase mb-10 anim-0 flex items-center gap-3">
                <span className="w-6 h-px bg-gold flex-shrink-0" />
                {ts.heroEyebrow}
              </p>
              <h1
                className="text-foreground font-bold leading-[0.88] tracking-tight mb-12 anim-1"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(52px, 8.5vw, 118px)",
                }}
              >
                {ts.heroTitle[0]}
                <br />
                {ts.heroTitle[1]}
                <br />
                <span className="text-moss">{ts.heroTitle[2]}</span>
              </h1>
              <div className="border-t border-foreground/8 pt-9 anim-2">
                <p className="text-foreground/60 text-[15px] leading-[1.85] max-w-sm mb-8">
                  {ts.heroLead}
                </p>
                <Link
                  href="/orcamento"
                  className="inline-flex items-center gap-3 text-sm text-foreground/60 hover:text-moss transition-colors duration-300 group"
                >
                  <span className="w-8 h-px bg-foreground/18 flex-shrink-0 group-hover:w-14 transition-all duration-500" />
                  {t.common.pedirOrcamento}
                </Link>
              </div>
            </div>

            {/* Right — image composition */}
            <div className="lg:col-span-5 anim-2">
              <div
                className="relative grid gap-2"
                style={{
                  height: "clamp(380px, 60vh, 620px)",
                  gridTemplateColumns: "1.15fr 1fr",
                  gridTemplateRows: "1fr 1fr",
                }}
              >
                {/* Tall left image */}
                <div className="row-span-2 relative overflow-hidden">
                  <Image
                    src="/imagens/DaniGui_Adois_61.jpg"
                    {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
                    alt="Casamentos"
                    fill
                    sizes="(max-width: 1024px) 50vw, 22vw"
                    className="object-cover"
                    preload
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-cream/35 text-[8px] tracking-[0.4em] uppercase">
                      Casamentos
                    </span>
                  </div>
                </div>
                {/* Top-right */}
                <div className="relative overflow-hidden">
                  <Image
                    src="/imagens/EW1_1414.jpg"
                    {...blurFor("/imagens/EW1_1414.jpg")}
                    alt="Eventos corporativos"
                    fill
                    loading="eager"
                    sizes="(max-width: 1024px) 50vw, 18vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-cream/35 text-[8px] tracking-[0.4em] uppercase">
                      {ts.imgCorporativos}
                    </span>
                  </div>
                </div>
                {/* Bottom-right */}
                <div className="relative overflow-hidden">
                  <Image
                    src="/imagens/DaniGui_JantarFesta_1.jpg"
                    {...blurFor("/imagens/DaniGui_JantarFesta_1.jpg")}
                    alt="Celebrações privadas"
                    fill
                    sizes="(max-width: 1024px) 50vw, 18vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-cream/35 text-[8px] tracking-[0.4em] uppercase">
                      {ts.imgCelebracoes}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bottom nav */}
          <div className="flex items-center justify-between mt-12 pt-5 border-t border-foreground/8 anim-3">
            <div className="flex items-center gap-5 sm:gap-12">
              {navItems.map((cat, i) => (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="text-foreground/78 text-[9px] tracking-[0.45em] uppercase hover:text-moss transition-colors duration-300"
                >
                  <span className="text-moss/35 mr-2 font-mono">0{i + 1}</span>
                  {cat.label}
                </a>
              ))}
            </div>
            <div className="hidden lg:flex flex-col items-center gap-1.5 pb-4">
              <div className="w-px h-10 bg-foreground/10 relative overflow-hidden">
                <div className="absolute inset-x-0 top-0 h-full bg-moss/50 animate-scroll-line" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Photo band (event backgrounds) ── */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-px"
            style={{ height: "clamp(280px, 46vw, 520px)" }}
          >
            {[
              "/imagens/M&F0152.jpg",
              "/imagens/DJI_20250913190635_0120_D.jpg",
              "/imagens/20_10_2025_0407.jpg",
              "/imagens/DaniGui_Adois_61.jpg",
            ].map((src) => (
              <div key={src} className="relative overflow-hidden group">
                <Image
                  src={src}
                  {...blurFor(src)}
                  alt="Evento organizado pela Líquen Events"
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-[1.1s] ease-out group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── Photo strip (edge-to-edge) ── */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div className="grid grid-cols-3 gap-px" style={{ height: "clamp(150px, 35vw, 400px)" }}>
            {[
              { src: "/imagens/EW1_1408.jpg", label: ts.band1[0] },
              { src: "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg", label: ts.band1[1] },
              { src: "/imagens/20_10_2025_0358.jpg", label: ts.band1[2] },
            ].map((item, i) => (
              <div key={i} className="relative overflow-hidden group">
                <Image
                  src={item.src}
                  {...blurFor(item.src)}
                  alt={item.label}
                  fill
                  sizes="33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/35 group-hover:bg-black/15 transition-colors duration-500" />
                <div className="absolute inset-0 flex items-end p-5">
                  <span className="text-[9px] tracking-[0.4em] uppercase text-white/55 opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                    {item.label}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── Service categories ── */}
      <div className="relative">
        {/* Sticky nav */}
        <div className="sticky top-[calc(60px+env(safe-area-inset-top))] z-30 bg-surface/[0.97] backdrop-blur-md border-b border-foreground/[0.06]">
          <div className="max-w-7xl mx-auto px-6 lg:px-16">
            <div className="flex items-center gap-5 sm:gap-8 h-11 overflow-x-auto scroll-hide">
              {navItems.map((cat, i) => (
                <a
                  key={cat.id}
                  href={`#${cat.id}`}
                  className="text-[10px] tracking-[0.4em] uppercase text-foreground/72 hover:text-moss transition-colors duration-300 flex items-center gap-2 whitespace-nowrap"
                >
                  <span className="text-moss/35 font-mono">0{i + 1}</span>
                  {cat.label}
                </a>
              ))}
            </div>
          </div>
        </div>

        {categories.map((cat) => (
          <section
            key={cat.id}
            id={cat.id}
            className="py-14 md:py-28 lg:py-36 bg-surface border-t border-foreground/8"
          >
            <div className="max-w-7xl mx-auto px-6 lg:px-16">
              {/* Category header */}
              <AnimateIn>
                <div className="relative mb-16 lg:mb-20">
                  <span
                    className="absolute -top-8 -left-2 select-none pointer-events-none font-bold leading-none"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(100px, 18vw, 240px)",
                      color: "rgba(222,218,212,0.022)",
                    }}
                    aria-hidden
                  >
                    {cat.num}
                  </span>
                  <div className="relative flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 pt-4">
                    <div>
                      <p className="text-foreground/68 text-[10px] tracking-[0.5em] uppercase mb-4 flex items-center gap-3">
                        <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                        {cat.subtitle}
                      </p>
                      <h2
                        className="text-foreground font-bold leading-none"
                        style={{
                          fontFamily: "var(--font-playfair)",
                          fontSize: "clamp(42px, 5.5vw, 80px)",
                        }}
                      >
                        {cat.label}
                      </h2>
                    </div>
                    <p className="text-foreground/32 text-sm leading-[1.85] max-w-xs lg:max-w-sm lg:text-right">
                      {cat.desc}
                    </p>
                  </div>
                </div>
              </AnimateIn>

              {/* Mosaic grid — desktop only */}
              <AnimateIn delay={60}>
                <div className="hidden lg:block">
                  {cat.layout === "duo" ? (
                    <DuoGrid cat={cat} cta={ts.verMais} />
                  ) : (
                    <MosaicGrid cat={cat} cta={ts.verMais} />
                  )}
                </div>
                {/* Mobile card stack */}
                <div className="lg:hidden">
                  <MobileCardStack cat={cat} cta={ts.verMais} />
                </div>
              </AnimateIn>

              {/* View all link */}
              <AnimateIn delay={120}>
                <div className="mt-8 flex justify-end">
                  <Link
                    href={`/servicos/${cat.services[0].slug}`}
                    className="group inline-flex items-center gap-3 text-xs text-foreground/72 hover:text-foreground/78 transition-colors duration-300 tracking-[0.3em] uppercase"
                  >
                    <span>{ts.verDetalhes}</span>
                    <span className="w-6 h-px bg-foreground/20 group-hover:w-10 transition-all duration-500" />
                  </Link>
                </div>
              </AnimateIn>
            </div>
          </section>
        ))}
      </div>

      {/* ── Second photo strip ── */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div className="grid grid-cols-3 gap-px" style={{ height: "clamp(160px, 35vw, 440px)" }}>
            {[
              { src: "/imagens/EW1_1342.jpg", label: ts.band2[0], anchor: "#empresas" },
              {
                src: "/imagens/Natalia e Jonathan-167.jpg",
                label: ts.band2[1],
                anchor: "#celebracoes",
              },
              {
                src: "/imagens/DaniGui_JantarFesta_27.jpg",
                label: ts.band2[2],
                anchor: "#celebracoes",
              },
            ].map((item) => (
              <a key={item.src} href={item.anchor} className="relative overflow-hidden group block">
                <Image
                  src={item.src}
                  {...blurFor(item.src)}
                  alt={item.label}
                  fill
                  sizes="33vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/45 group-hover:bg-black/20 transition-colors duration-500" />
                <div className="absolute inset-0 flex items-end p-5 lg:p-7">
                  <span className="text-[9px] tracking-[0.42em] uppercase text-white/55 group-hover:text-white/85 transition-colors duration-300">
                    {item.label}
                  </span>
                </div>
              </a>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── SEO content — image + short text ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <div className="flex flex-col justify-center px-6 lg:px-16 py-16 lg:py-28 order-2 lg:order-1">
            <AnimateIn>
              <p className="text-foreground/68 text-[10px] tracking-[0.48em] uppercase mb-6 flex items-center gap-3">
                <span className="w-5 h-px bg-gold/50 flex-shrink-0" />
                {ts.seoEyebrow}
              </p>
              <h2
                className="text-foreground font-bold leading-[1.05] mb-8"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 52px)" }}
              >
                {ts.seoTitle}
              </h2>
              <p className="text-foreground/78 text-base lg:text-lg leading-[1.8] max-w-md">
                {ts.seoText}
              </p>
            </AnimateIn>
          </div>
          <AnimateIn
            from="right"
            className="relative min-h-[320px] lg:min-h-[560px] overflow-hidden order-1 lg:order-2"
          >
            <Image
              src="/imagens/JOAO_E_PEDRO_1Y1A3439.jpg"
              {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3439.jpg")}
              alt="Evento Líquen Events em Portugal"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
            <div className="absolute inset-0 bg-black/20" />
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Image
          src="/imagens/EW1_1330.jpg"
          alt="Evento corporativo Líquen Events"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/EW1_1330.jpg")}
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/35 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              {ts.ctaEyebrow}
              <span className="w-8 h-px bg-gold" />
            </p>
            <h2
              className="text-white font-bold leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 8vw, 110px)" }}
            >
              {ts.ctaTitleLine1}
              <br />
              <span className="text-moss">{ts.ctaTitleMoss}</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/45 text-base leading-relaxed max-w-md mb-12">{ts.ctaText}</p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/orcamento"
                className="inline-flex items-center gap-3 px-9 py-4 btn-shine bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
              >
                {t.common.pedirOrcamento} →
              </Link>
              <Link
                href="/galeria"
                className="inline-flex items-center gap-3 px-9 py-4 border border-white/25 text-white/70 font-medium hover:border-white/50 hover:text-white transition-all duration-300 text-sm tracking-[0.18em] uppercase"
              >
                {ts.ctaGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
