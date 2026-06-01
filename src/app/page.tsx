import Link from "next/link";
import Image from "next/image";
import AnimateIn from "@/components/AnimateIn";
import { blurFor } from "@/lib/blur";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";
import ClientMarquee from "@/components/ClientMarquee";

const services = [
  {
    title: "Corporativos",
    tag: "Empresas",
    image: "/imagens/EW1_1408.jpg",
    href: "/servicos#empresas",
  },
  {
    title: "Casamentos",
    tag: "Celebrações",
    image: "/imagens/DaniGui_Preview20.jpg",
    href: "/servicos#celebracoes",
  },
  {
    title: "Privados",
    tag: "Celebrações",
    image: "/imagens/DaniGui_JantarFesta_27.jpg",
    href: "/servicos#celebracoes",
  },
];

const featured = [
  {
    title: "Aernnova Aerospace",
    category: "Corporativo",
    image: "/imagens/EW1_1392.jpg",
  },
  {
    title: "Daniela & Guilherme",
    category: "Casamento",
    image: "/imagens/DaniGui_Preview12.jpg",
  },
  {
    title: "João & Pedro",
    category: "Casamento",
    image: "/imagens/JOAO_E_PEDRO_1Y1A3170.jpg",
  },
  {
    title: "Câmara de Évora",
    category: "Institucional",
    image: "/imagens/20_10_2025_0295.jpg",
  },
  {
    title: "Matilde & Filipe",
    category: "Casamento",
    image: "/imagens/M&F0152.jpg",
  },
];

const ribbon = [
  "/imagens/Natalia e Jonathan-167.jpg",
  "/imagens/EW1_0697.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg",
  "/imagens/DaniGui_Adois_61.jpg",
  "/imagens/20_10_2025_0220.jpg",
  "/imagens/Inês&Gonçalo_weddingphotos_@carinho.mio-252.jpg",
  "/imagens/M&F0497.jpg",
  "/imagens/EW1_1330.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3439.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A3450.jpg",
];

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative min-h-[100svh] flex flex-col justify-end overflow-hidden">
        <Image
          src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
          alt="Líquen Events — evento aéreo no Alentejo"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center scale-105"
        />
        <div className="absolute inset-0 bg-black/40" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/25 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/45 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full px-6 lg:px-16 pb-20 lg:pb-28 pt-40">
          <p className="text-white/45 text-[10px] sm:text-xs tracking-[0.45em] uppercase mb-8 lg:mb-12 anim-0 flex items-center gap-3">
            <span className="inline-block w-8 h-px bg-gold flex-shrink-0" />
            Organização de eventos · Évora
          </p>
          <h1
            className="text-white font-bold leading-[0.86] tracking-tight"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(56px, 10vw, 150px)" }}
          >
            {(
              [
                { words: ["Eventos", "que"], delay: 180 },
                { words: ["ficam", "na"], delay: 360 },
                { words: ["memória."], delay: 520, moss: true },
              ] as { words: string[]; delay: number; moss?: boolean }[]
            ).map(({ words, delay, moss }) => (
              <span key={words.join("")} className="flex flex-wrap" style={{ gap: "0.26em" }}>
                {words.map((word, i) => (
                  <span
                    key={word + i}
                    className={`inline-block word-rise${moss ? " text-moss" : ""}`}
                    style={{ "--word-delay": `${delay + i * 110}ms` } as React.CSSProperties}
                  >
                    {word}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <div className="mt-10 lg:mt-14 flex flex-wrap items-center gap-x-6 gap-y-4 anim-2">
            <Link
              href="/orcamento"
              className="inline-flex items-center gap-2 px-8 py-4 bg-moss text-cream text-xs font-medium rounded-sm hover:bg-moss-dark hover:gap-3 transition-all duration-300 tracking-widest uppercase shadow-lg shadow-moss/20"
            >
              Pedir Orçamento →
            </Link>
            <Link
              href="/galeria"
              className="link-line text-xs text-white/55 hover:text-white/85 transition-colors tracking-[0.2em] uppercase"
            >
              Ver galeria
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 right-6 lg:right-16 z-10 flex flex-col items-center gap-3 anim-3">
          <span className="text-white/25 text-[9px] tracking-[0.5em] uppercase [writing-mode:vertical-rl]">
            Scroll
          </span>
          <div className="h-10 w-px overflow-hidden">
            <div className="w-full h-full bg-gradient-to-b from-white/50 to-transparent animate-scroll-line" />
          </div>
        </div>
      </section>

      {/* ── Clients marquee ── */}
      <ClientMarquee />

      {/* ── Services — minimal image tiles ── */}
      <section className="py-16 lg:py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-8 lg:mb-12">
              <p className="text-foreground/30 text-xs tracking-[0.3em] uppercase flex items-center gap-3">
                <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />O que fazemos
              </p>
              <Link
                href="/servicos"
                className="group text-xs text-foreground/30 hover:text-foreground/60 transition-colors flex items-center gap-1.5"
              >
                Ver serviços
                <span className="group-hover:translate-x-0.5 transition-transform inline-block">
                  →
                </span>
              </Link>
            </div>
          </AnimateIn>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
            {services.map((s, i) => (
              <AnimateIn key={s.title} delay={i * 60}>
                <Link
                  href={s.href}
                  className="group relative block rounded-xl overflow-hidden"
                  style={{ aspectRatio: "3/4" }}
                >
                  <Image
                    src={s.image}
                    alt={s.title}
                    fill
                    sizes="(max-width: 640px) 50vw, (max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    {...blurFor(s.image)}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent group-hover:from-black/70 transition-all duration-500" />
                  <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-6">
                    <p className="text-moss/70 text-[8px] sm:text-[9px] tracking-[0.35em] uppercase mb-1">
                      {s.tag}
                    </p>
                    <h3
                      className="text-cream text-base sm:text-lg lg:text-2xl font-bold group-hover:text-moss transition-colors duration-200"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {s.title}
                    </h3>
                  </div>
                </Link>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Featured work — editorial mosaic ── */}
      <section className="pb-16 lg:pb-24 bg-surface">
        <div className="max-w-7xl mx-auto px-5 sm:px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-8 lg:mb-12">
              <p className="text-foreground/30 text-xs tracking-[0.3em] uppercase flex items-center gap-3">
                <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
                Trabalho selecionado
              </p>
              <Link
                href="/galeria"
                className="group text-xs text-foreground/30 hover:text-foreground/60 transition-colors flex items-center gap-1.5"
              >
                Ver tudo
                <span className="group-hover:translate-x-0.5 transition-transform inline-block">
                  →
                </span>
              </Link>
            </div>
          </AnimateIn>

          <div className="grid grid-cols-2 lg:grid-cols-12 gap-2 lg:gap-3 auto-rows-[180px] sm:auto-rows-[220px] lg:auto-rows-[200px]">
            {[
              "lg:col-span-7 lg:row-span-2",
              "lg:col-span-5",
              "lg:col-span-5",
              "lg:col-span-6 row-span-1 lg:row-span-1",
              "lg:col-span-6",
            ].map((span, i) => {
              const p = featured[i];
              return (
                <AnimateIn
                  key={p.title}
                  delay={i * 50}
                  className={`${span} ${i === 0 ? "col-span-2 row-span-2" : ""}`}
                >
                  <Link
                    href="/galeria"
                    className="group relative block w-full h-full overflow-hidden rounded-xl"
                  >
                    <Image
                      src={p.image}
                      alt={p.title}
                      fill
                      sizes={
                        i === 0 ? "(max-width: 640px) 100vw, 50vw" : "(max-width: 640px) 50vw, 50vw"
                      }
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                      {...blurFor(p.image)}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent group-hover:from-black/65 transition-all duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-4 lg:p-7">
                      <p className="text-cream/55 text-[8px] sm:text-[9px] tracking-[0.35em] uppercase mb-1">
                        {p.category}
                      </p>
                      <h3
                        className="text-cream text-sm sm:text-lg lg:text-2xl font-bold group-hover:text-moss transition-colors duration-200 leading-tight"
                        style={{ fontFamily: "var(--font-playfair)" }}
                      >
                        {p.title}
                      </h3>
                    </div>
                  </Link>
                </AnimateIn>
              );
            })}
          </div>
        </div>
      </section>

      {/* ── Gallery ribbon ── */}
      <section className="relative bg-surface border-y border-foreground/8 overflow-hidden py-2 sm:py-3">
        <Link href="/galeria" className="group block">
          <div className="absolute inset-y-0 left-0 w-20 sm:w-32 bg-gradient-to-r from-surface to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-20 sm:w-32 bg-gradient-to-l from-surface to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <span className="px-5 py-2.5 bg-surface/70 backdrop-blur-sm border border-cream/10 rounded-full text-cream/80 text-[10px] sm:text-[11px] tracking-[0.3em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              Ver galeria →
            </span>
          </div>
          <div className="flex gap-2 animate-marquee w-max">
            {[...ribbon, ...ribbon].map((src, i) => (
              <div
                key={i}
                className="relative h-[120px] sm:h-[180px] lg:h-[240px] w-[180px] sm:w-[270px] lg:w-[360px] flex-shrink-0 overflow-hidden rounded-lg"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="360px"
                  className="object-cover group-hover:brightness-75 transition-all duration-500"
                  {...blurFor(src)}
                />
              </div>
            ))}
          </div>
        </Link>
      </section>

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── SEO content — organização de eventos em Évora, Lisboa e Portugal ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          {/* Image */}
          <AnimateIn
            from="left"
            className="relative min-h-[300px] lg:min-h-[640px] overflow-hidden"
          >
            <Image
              src="/imagens/DaniGui_Adois_61.jpg"
              alt="Organização de eventos no Alentejo — Líquen Events"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
              {...blurFor("/imagens/DaniGui_Adois_61.jpg")}
            />
            <div className="absolute inset-0 bg-black/20" />
          </AnimateIn>

          {/* Text — trimmed */}
          <div className="flex flex-col justify-center px-6 lg:px-16 py-16 lg:py-28">
            <AnimateIn>
              <p className="text-foreground/30 text-xs tracking-[0.3em] uppercase mb-6 flex items-center gap-3">
                <span className="w-6 h-px bg-gold rounded-full flex-shrink-0" />
                Onde atuamos
              </p>
              <h2
                className="text-foreground font-bold leading-[1.05] mb-8"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(30px, 4vw, 56px)" }}
              >
                Eventos em Évora,
                <br />
                Lisboa e todo o Portugal
              </h2>
              <p className="text-foreground/45 text-base lg:text-lg leading-[1.8] max-w-lg">
                Casamentos, eventos corporativos e celebrações — do conceito à execução, tratamos de
                cada detalhe para que só tenha de viver o momento.
              </p>
            </AnimateIn>
            <AnimateIn delay={120}>
              <div className="mt-10 flex flex-wrap gap-2.5">
                {[
                  "Casamentos no Alentejo",
                  "Eventos corporativos em Lisboa",
                  "Conferências em Évora",
                  "Festas privadas",
                  "Jantares de gala",
                ].map((t) => (
                  <span
                    key={t}
                    className="text-xs tracking-wide text-foreground/40 border border-foreground/12 rounded-full px-4 py-2"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="relative py-32 lg:py-52 overflow-hidden border-t border-foreground/8">
        <Image
          src="/imagens/JOAO_E_PEDRO_1Y1A3450.jpg"
          alt="Evento Líquen Events"
          fill
          sizes="100vw"
          className="object-cover object-center"
          {...blurFor("/imagens/JOAO_E_PEDRO_1Y1A3450.jpg")}
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808]/90 via-transparent to-[#080808]/50" />

        <div className="relative z-10 max-w-7xl mx-auto px-6 lg:px-16 flex flex-col items-center text-center">
          <AnimateIn>
            <p className="text-white/35 text-[9px] tracking-[0.52em] uppercase flex items-center justify-center gap-4 mb-10">
              <span className="w-8 h-px bg-gold" />
              Próximo passo
              <span className="w-8 h-px bg-gold" />
            </p>
            <h2
              className="text-white font-bold leading-[0.9] tracking-tight mb-6"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(44px, 8vw, 116px)" }}
            >
              Tem um evento
              <br />
              <span className="text-moss">em mente?</span>
            </h2>
          </AnimateIn>
          <AnimateIn delay={110}>
            <p className="text-white/45 text-base leading-relaxed max-w-md mb-12">
              Conte-nos a sua ideia. Sem compromisso — respondemos com uma proposta à medida em
              menos de 24 horas.
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4 justify-center">
              <Link
                href="/orcamento"
                className="inline-flex items-center gap-3 px-9 py-4 bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-[0.18em] uppercase shadow-xl shadow-black/30"
              >
                Pedir Orçamento →
              </Link>
              <Link
                href="/galeria"
                className="inline-flex items-center gap-3 px-9 py-4 border border-white/25 text-white/70 font-medium hover:border-white/50 hover:text-white transition-all duration-300 text-sm tracking-[0.18em] uppercase"
              >
                Ver galeria
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
