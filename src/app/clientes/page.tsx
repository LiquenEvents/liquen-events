import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import CountUp from "@/components/CountUp";
import ClientLogoGrid from "@/components/ClientLogoGrid";
import ClientMarquee from "@/components/ClientMarquee";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { clientLogos } from "@/data";
import { SITE } from "@/lib/site";

export const metadata: Metadata = pageMetadata({
  title: "Clientes — Quem Confia na Líquen Events",
  description:
    "Empresas e instituições que confiam na Líquen Events em Évora e no Alentejo: José de Mello, Aernnova, Mainova, Universidade de Évora, Câmara Municipal de Évora, Pérez-Llorca e muito mais.",
  path: "/clientes",
  keywords: [
    "clientes Líquen Events",
    "eventos corporativos Évora",
    "empresas de eventos Alentejo",
  ],
});

const testimonials = [
  {
    name: "António Bettencourt",
    text: "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
    event: "Evento Corporativo",
  },
  {
    name: "Stephanie & Mizio",
    text: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
    event: "Evento Privado",
  },
  {
    name: "Teresinha Malta",
    text: "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
    event: "Evento Social",
  },
  {
    name: "Ana Pinho",
    text: "Excelente, recomendo sem qualquer reserva. Uma equipa de confiança do início ao fim.",
    event: "Evento Privado",
  },
];

const eyebrow =
  "text-foreground/25 text-[10px] tracking-[0.48em] uppercase flex items-center gap-3";

const mosaicItems = [
  {
    src: "/imagens/EW1_1408.jpg",
    alt: "Evento corporativo",
    label: "Corporativo",
    cls: "col-span-5 row-span-2",
  },
  {
    src: "/imagens/DaniGui_Preview20.jpg",
    alt: "Casamento",
    label: "Casamento",
    cls: "col-span-4 row-span-1",
  },
  {
    src: "/imagens/20_10_2025_0358.jpg",
    alt: "Evento cultural",
    label: "Cultural",
    cls: "col-span-3 row-span-1",
  },
  {
    src: "/imagens/JOAO_E_PEDRO_1Y1A3232.jpg",
    alt: "Casamento",
    label: "Casamento",
    cls: "col-span-4 row-span-1",
  },
  {
    src: "/imagens/DaniGui_Adois_57.jpg",
    alt: "Jantar de gala",
    label: "Jantar",
    cls: "col-span-3 row-span-1",
  },
  {
    src: "/imagens/DaniGui_JantarFesta_27.jpg",
    alt: "Gala",
    label: "Gala",
    cls: "col-span-7 row-span-1",
  },
  {
    src: "/imagens/20_10_2025_0295.jpg",
    alt: "Evento institucional",
    label: "Institucional",
    cls: "col-span-5 row-span-1",
  },
];

export default function ClientesPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Clientes", path: "/clientes" }]} />

      {/* ── HERO ── */}
      <section className="relative min-h-screen flex flex-col justify-end overflow-hidden">
        <Image
          src="/imagens/EW1_1393.jpg"
          alt="Evento corporativo Líquen Events"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/EW1_1393.jpg")}
        />
        <div className="absolute inset-0 bg-black/50" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-20 lg:pb-28 pt-40">
          <AnimateIn>
            <p className="text-white/35 text-[10px] tracking-[0.52em] uppercase flex items-center gap-3 mb-10">
              <span className="w-8 h-px bg-moss flex-shrink-0" />
              Quem confia em nós
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <h1
              className="text-white font-bold leading-[0.88] tracking-tight"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(58px, 10.5vw, 148px)",
              }}
            >
              Os Nossos
              <br />
              <em className="not-italic text-moss">Clientes.</em>
            </h1>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="mt-10 border-l-2 border-moss/50 pl-6 max-w-md">
              <p className="text-white/45 text-base leading-[1.8]">
                Empresas, instituições e famílias que nos escolheram para os seus momentos mais
                especiais — e que nos honram com a sua confiança.
              </p>
            </div>
          </AnimateIn>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2.5 pointer-events-none">
          <span className="text-white/30 text-[8px] tracking-[0.45em] uppercase">Scroll</span>
          <div className="w-px h-12 bg-gradient-to-b from-white/30 to-transparent" />
        </div>
      </section>

      {/* ── MARQUEE ── */}
      <ClientMarquee />

      {/* ── LEAD STATEMENT ── */}
      <section className="py-28 lg:py-36 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid lg:grid-cols-[1fr_auto] gap-16 lg:gap-24 items-end">
            <AnimateIn>
              <p
                className="text-foreground/55 leading-[1.72]"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 2.8vw, 36px)" }}
              >
                De grandes empresas a celebrações de família, são dezenas os que confiam à Líquen
                Events os seus momentos mais importantes — e a essa confiança respondemos com{" "}
                <span className="text-moss">rigor, criatividade e dedicação</span> em cada detalhe.
              </p>
            </AnimateIn>
            <AnimateIn delay={100} className="hidden lg:block">
              <div className="flex flex-col items-end gap-1.5 text-right min-w-[120px]">
                <span className="text-foreground/12 text-[9px] tracking-[0.45em] uppercase block">
                  Desde
                </span>
                <span
                  className="text-foreground/10 font-bold leading-none"
                  style={{ fontFamily: "var(--font-playfair)", fontSize: "72px" }}
                >
                  {SITE.founded}
                </span>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── STATS ── */}
      <section className="bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-foreground/[0.06]">
            {[
              { kind: "count" as const, to: 19, suffix: "+", label: "Clientes empresariais" },
              { kind: "count" as const, to: 100, suffix: "+", label: "Eventos realizados" },
              { kind: "static" as const, value: "5★", label: "Avaliação média" },
              { kind: "static" as const, value: "24h", label: "Tempo de resposta" },
            ].map((s, i) => (
              <AnimateIn key={s.label} delay={i * 80} className="h-full">
                <div className="flex flex-col items-center justify-center text-center py-16 lg:py-20 px-6 gap-4 h-full group hover:bg-surface-raised/30 transition-colors duration-500">
                  <p
                    className="text-moss font-bold leading-none"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(46px, 5vw, 78px)",
                    }}
                  >
                    {s.kind === "count" ? <CountUp to={s.to} suffix={s.suffix} /> : s.value}
                  </p>
                  <p className="text-foreground/28 text-[10px] tracking-[0.32em] uppercase">
                    {s.label}
                  </p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── CLIENT LOGOS ── */}
      <section className="py-24 lg:py-32 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-6 mb-14">
            <AnimateIn>
              <p className={`${eyebrow} mb-4`}>
                <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                Empresas &amp; instituições
              </p>
              <h2
                className="text-foreground font-bold leading-[1.05]"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 3.8vw, 50px)" }}
              >
                Marcas que confiam em nós
              </h2>
            </AnimateIn>
            <AnimateIn delay={80} className="hidden lg:block">
              <span className="text-foreground/12 text-[9px] tracking-[0.4em] uppercase">
                {clientLogos.length} clientes
              </span>
            </AnimateIn>
          </div>
          <AnimateIn delay={120}>
            <ClientLogoGrid clients={clientLogos} />
          </AnimateIn>
        </div>
      </section>

      {/* ── FEATURED TESTIMONIAL (editorial split) ── */}
      <section className="bg-surface border-b border-foreground/8 overflow-hidden">
        <div className="max-w-7xl mx-auto">
          <div className="grid lg:grid-cols-[1fr_45%] min-h-[600px]">
            {/* Quote side */}
            <AnimateIn className="flex flex-col justify-center px-6 lg:px-16 py-20 lg:py-28">
              <p className={`${eyebrow} mb-12`}>
                <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                Testemunhos
              </p>
              <span
                className="text-moss/15 leading-[0.75] select-none block -mb-2"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(80px, 12vw, 160px)" }}
                aria-hidden
              >
                &ldquo;
              </span>
              <blockquote
                className="text-foreground/75 leading-[1.65] mt-4"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.2vw, 27px)" }}
              >
                A dedicação da equipa em criar ambientes mágicos, com decoração impecável e
                coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.
              </blockquote>
              <div className="mt-10 pt-7 border-t border-foreground/10 flex items-center gap-5">
                <div className="w-8 h-px bg-moss flex-shrink-0" />
                <div>
                  <p className="text-foreground text-sm font-semibold tracking-wide">
                    Alexandra Teixeira
                  </p>
                  <p className="text-moss/65 text-[10px] mt-1 tracking-[0.2em] uppercase">
                    Evento Social
                  </p>
                </div>
              </div>
            </AnimateIn>

            {/* Photo side */}
            <div className="relative min-h-[380px] lg:min-h-0">
              <Image
                src="/imagens/DaniGui_JantarFesta_1.jpg"
                alt="Jantar de evento Líquen Events"
                fill
                sizes="(max-width: 1024px) 100vw, 45vw"
                className="object-cover object-center"
                {...blurFor("/imagens/DaniGui_JantarFesta_1.jpg")}
              />
              <div className="absolute inset-0 bg-gradient-to-r from-[#080808] via-[#080808]/15 to-transparent lg:block hidden" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/30 to-transparent lg:hidden" />
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS GRID ── */}
      <section className="py-24 lg:py-28 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-14">
            <h2
              className="text-foreground font-bold leading-[1.05]"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 3.2vw, 42px)" }}
            >
              Palavras de quem confiou.
            </h2>
          </AnimateIn>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-foreground/[0.05]">
            {testimonials.map((t, i) => (
              <AnimateIn key={t.name} delay={i * 55} className="h-full">
                <figure className="h-full flex flex-col p-8 lg:p-10 bg-surface hover:bg-surface-raised/25 transition-colors duration-500">
                  <span
                    className="text-moss/20 text-5xl leading-none mb-5 select-none"
                    style={{ fontFamily: "var(--font-playfair)" }}
                    aria-hidden
                  >
                    &ldquo;
                  </span>
                  <blockquote
                    className="text-foreground/58 leading-[1.72] flex-1"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(16px, 1.7vw, 19px)",
                    }}
                  >
                    {t.text}
                  </blockquote>
                  <figcaption className="mt-8 pt-6 border-t border-foreground/8 flex items-center gap-4">
                    <div className="w-6 h-px bg-moss flex-shrink-0" />
                    <div>
                      <p className="text-foreground text-sm font-semibold">{t.name}</p>
                      <p className="text-moss/60 text-[10px] mt-0.5 tracking-[0.18em] uppercase">
                        {t.event}
                      </p>
                    </div>
                  </figcaption>
                </figure>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── PHOTO MOSAIC ── */}
      <section className="py-20 lg:py-28 bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn className="mb-10">
            <p className={eyebrow}>
              <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
              Momentos dos nossos eventos
            </p>
          </AnimateIn>
          <AnimateIn from="fade" delay={80}>
            <div
              className="grid grid-cols-12 gap-2"
              style={{ gridTemplateRows: "210px 210px 230px" }}
            >
              {mosaicItems.map((item, i) => (
                <div key={i} className={`${item.cls} relative overflow-hidden group`}>
                  <Image
                    src={item.src}
                    alt={item.alt}
                    fill
                    sizes="(max-width: 768px) 100vw, 40vw"
                    className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                    {...blurFor(item.src)}
                  />
                  <div className="absolute inset-0 bg-black/25 group-hover:bg-black/5 transition-colors duration-700" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                  <span className="absolute bottom-4 left-4 text-white/0 group-hover:text-white/65 transition-all duration-500 text-[9px] tracking-[0.42em] uppercase font-medium">
                    {item.label}
                  </span>
                </div>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── CTA with background photo ── */}
      <section className="relative py-36 lg:py-52 overflow-hidden">
        <Image
          src="/imagens/DJI_20250913190635_0120_D.jpg"
          alt="Vista aérea de evento Líquen Events"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/DJI_20250913190635_0120_D.jpg")}
        />
        <div className="absolute inset-0 bg-black/55" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/85 via-transparent to-[#080808]/45" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/35 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-moss" />
              Próximo evento
              <span className="w-8 h-px bg-moss" />
            </p>
            <h2
              className="text-white font-bold leading-[0.88] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(50px, 9vw, 128px)" }}
            >
              Junte-se aos
              <br />
              nossos clientes.
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/38 text-base leading-relaxed max-w-sm mb-14">
              Conte-nos a sua ideia e mostramos-lhe como a podemos transformar num evento memorável.
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <Link
              href="/contacto"
              className="inline-flex items-center gap-3 px-11 py-5 bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
            >
              Falar Connosco →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
