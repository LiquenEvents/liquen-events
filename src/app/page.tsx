import Link from "next/link";
import Image from "next/image";
import AnimateIn from "@/components/AnimateIn";
import CountUp from "@/components/CountUp";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";

const clients = [
  "José de Mello", "Aernnova", "Mainova", "Palácio Cadaval", "Ravasqueira",
  "Fitapreta Vinhos", "Universidade de Évora", "Hilton Garden Inn", "Convento do Espinheiro",
  "Pérez-Llorca", "Câmara Municipal de Évora", "PACT", "Clínica Santa Madalena",
  "Casa Morgado Esporão", "PortugalNuts", "ESRI Portugal", "Monte do Zambujal",
  "EDIA", "Ordem dos Médicos Veterinários",
];

const services = [
  { title: "Corporativos", tag: "Empresas",     image: "/imagens/EW1_1408.jpg",            href: "/servicos#empresas" },
  { title: "Casamentos",   tag: "Celebrações",  image: "/imagens/DaniGui_Preview20.jpg",   href: "/servicos#celebrações" },
  { title: "Culturais",    tag: "Cultura",      image: "/imagens/20_10_2025_0358.jpg",     href: "/servicos#cultura" },
  { title: "Privados",     tag: "Celebrações",  image: "/imagens/DaniGui_JantarFesta_27.jpg", href: "/servicos#celebrações" },
];

// Editorial showcase — asymmetric mosaic, image-led, minimal copy
const featured = [
  { title: "Aernnova Aerospace",   category: "Corporativo",  image: "/imagens/EW1_1392.jpg" },
  { title: "Daniela & Guilherme",  category: "Casamento",    image: "/imagens/DaniGui_Preview12.jpg" },
  { title: "João & Pedro",         category: "Casamento",    image: "/imagens/JOAO_E_PEDRO_1Y1A3170.jpg" },
  { title: "Câmara de Évora",      category: "Institucional", image: "/imagens/20_10_2025_0295.jpg" },
  { title: "Matilde & Filipe",     category: "Casamento",    image: "/imagens/M&F0152.jpg" },
];

// Full-bleed scrolling ribbon — celebrates the breadth of work
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
  "/imagens/Matilde&Tomás35.jpg",
];

type Stat =
  | { kind: "count"; to: number; suffix: string; label: string }
  | { kind: "static"; value: string; label: string };

const stats: Stat[] = [
  { kind: "count",  to: 19,  suffix: "+", label: "Clientes empresariais" },
  { kind: "count",  to: 100, suffix: "+", label: "Eventos realizados" },
  { kind: "static", value: "5★",          label: "Avaliação dos clientes" },
  { kind: "count",  to: 100, suffix: "%", label: "Soluções personalizadas" },
];

export default function Home() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col justify-center px-6 lg:px-16 py-32 overflow-hidden">
        <Image
          src="/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"
          alt="Líquen Events — evento aéreo"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/60" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-[#080808]/10 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/30 to-transparent" />

        <div className="relative z-10 max-w-7xl mx-auto w-full">
          <p className="text-white/50 text-xs tracking-[0.4em] uppercase mb-12 anim-0 flex items-center gap-3">
            <span className="inline-block w-6 h-px bg-moss rounded-full flex-shrink-0" />
            Organizamos Eventos · Eternizamos Memórias
          </p>
          <h1
            className="text-white text-[clamp(52px,9vw,128px)] font-bold leading-[0.9] tracking-tight mb-14"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {(
              [
                { words: ["Eventos", "que"], delay: 180 },
                { words: ["ficam", "na"],    delay: 360 },
                { words: ["memória."],       delay: 520, moss: true },
              ] as { words: string[]; delay: number; moss?: boolean }[]
            ).map(({ words, delay, moss }) => (
              <span key={words.join("")} className="block">
                {words.map((word, i) => (
                  <span
                    key={word + i}
                    className={`inline-block${moss ? " text-moss" : ""}`}
                    style={{
                      animation: `word-rise 0.85s cubic-bezier(0.16, 1, 0.3, 1) ${delay + i * 110}ms both`,
                    }}
                  >
                    {word}{i < words.length - 1 ? " " : ""}
                  </span>
                ))}
              </span>
            ))}
          </h1>
          <div className="border-t border-white/10 pt-8 flex flex-wrap items-center gap-x-6 gap-y-4 anim-2">
            <Link
              href="/orcamento"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-moss text-cream text-xs font-medium rounded-sm hover:bg-moss-dark hover:gap-3 transition-all duration-300 tracking-widest uppercase shadow-lg shadow-moss/20"
            >
              Pedir Orçamento →
            </Link>
            <Link
              href="/portfolio"
              className="link-line text-xs text-white/45 hover:text-white/75 transition-colors tracking-[0.2em] uppercase"
            >
              Ver portfolio
            </Link>
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-3 anim-3">
          <span className="text-white/25 text-[9px] tracking-[0.5em] uppercase">Scroll</span>
          <div className="h-12 w-px overflow-hidden">
            <div className="w-full h-full bg-gradient-to-b from-white/50 to-transparent animate-scroll-line" />
          </div>
        </div>
      </section>

      {/* ── Clients marquee ── */}
      <div className="relative py-7 border-y border-foreground/8 overflow-hidden">
        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-surface to-transparent z-10 pointer-events-none" />
        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-surface to-transparent z-10 pointer-events-none" />
        <div className="flex gap-20 animate-marquee whitespace-nowrap">
          {[...clients, ...clients].map((c, i) => (
            <span
              key={i}
              className="text-foreground/20 text-xs font-medium tracking-[0.3em] uppercase flex-shrink-0 hover:text-foreground/50 transition-colors cursor-default"
            >
              {c}
            </span>
          ))}
        </div>
      </div>

      {/* ── Services — minimal image tiles ── */}
      <section className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-12">
              <p className="text-foreground/30 text-xs tracking-[0.3em] uppercase flex items-center gap-3">
                <span className="w-6 h-px bg-moss rounded-full flex-shrink-0" />
                O que fazemos
              </p>
              <Link
                href="/servicos"
                className="group text-xs text-foreground/30 hover:text-foreground/60 transition-colors flex items-center gap-1.5"
              >
                Ver serviços
                <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
              </Link>
            </div>
          </AnimateIn>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 lg:gap-3">
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
                    sizes="(max-width: 1024px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-transparent group-hover:from-black/70 transition-all duration-500" />
                  <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-6">
                    <p className="text-moss/70 text-[9px] tracking-[0.35em] uppercase mb-1.5">{s.tag}</p>
                    <h3
                      className="text-cream text-lg lg:text-2xl font-bold group-hover:text-moss transition-colors duration-200"
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

      {/* ── Featured work — editorial mosaic, image-led ── */}
      <section className="pb-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="flex items-end justify-between mb-12">
              <p className="text-foreground/30 text-xs tracking-[0.3em] uppercase flex items-center gap-3">
                <span className="w-6 h-px bg-moss rounded-full flex-shrink-0" />
                Trabalho selecionado
              </p>
              <Link
                href="/portfolio"
                className="group text-xs text-foreground/30 hover:text-foreground/60 transition-colors flex items-center gap-1.5"
              >
                Ver tudo
                <span className="group-hover:translate-x-0.5 transition-transform inline-block">→</span>
              </Link>
            </div>
          </AnimateIn>

          <div className="grid grid-cols-2 lg:grid-cols-12 gap-2 lg:gap-3 auto-rows-[150px] sm:auto-rows-[210px] lg:auto-rows-[200px]">
            {[
              "lg:col-span-7 lg:row-span-2",
              "lg:col-span-5",
              "lg:col-span-5",
              "lg:col-span-6 row-span-1 lg:row-span-1",
              "lg:col-span-6",
            ].map((span, i) => {
              const p = featured[i];
              return (
                <AnimateIn key={p.title} delay={i * 50} className={`${span} ${i === 0 ? "col-span-2" : ""}`}>
                  <Link
                    href="/portfolio"
                    className="group relative block w-full h-full overflow-hidden rounded-xl"
                  >
                    <Image
                      src={p.image}
                      alt={p.title}
                      fill
                      sizes="(max-width: 1024px) 50vw, 50vw"
                      className="object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent group-hover:from-black/65 transition-all duration-500" />
                    <div className="absolute bottom-0 left-0 right-0 p-5 lg:p-7">
                      <p className="text-cream/55 text-[9px] tracking-[0.35em] uppercase mb-1.5">{p.category}</p>
                      <h3
                        className="text-cream text-lg lg:text-2xl font-bold group-hover:text-moss transition-colors duration-200"
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

      {/* ── Gallery ribbon — full-bleed, scrolling ── */}
      <section className="relative bg-surface border-y border-foreground/8 overflow-hidden py-3">
        <Link href="/galeria" className="group block">
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-surface to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-surface to-transparent z-20 pointer-events-none" />
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
            <span className="px-6 py-3 bg-surface/70 backdrop-blur-sm border border-cream/10 rounded-full text-cream/80 text-[11px] tracking-[0.3em] uppercase opacity-0 group-hover:opacity-100 transition-opacity duration-500">
              Ver galeria completa →
            </span>
          </div>
          <div className="flex gap-2 animate-marquee w-max">
            {[...ribbon, ...ribbon].map((src, i) => (
              <div
                key={i}
                className="relative h-[140px] sm:h-[200px] lg:h-[240px] w-[210px] sm:w-[300px] lg:w-[360px] flex-shrink-0 overflow-hidden rounded-lg"
              >
                <Image
                  src={src}
                  alt=""
                  fill
                  sizes="360px"
                  className="object-cover group-hover:brightness-75 transition-all duration-500"
                />
              </div>
            ))}
          </div>
        </Link>
      </section>

      {/* ── Stats — full-bleed moss break ── */}
      <section className="py-24 bg-moss-dark relative overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 80% 80% at 105% 110%, rgba(74,124,89,0.4) 0%, transparent 55%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-12 lg:gap-20">
            {stats.map((s, i) => (
              <AnimateIn key={s.label} delay={i * 80}>
                <div
                  className="text-cream text-5xl sm:text-6xl lg:text-7xl font-bold mb-4"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  {s.kind === "count" ? (
                    <CountUp to={s.to} suffix={s.suffix} />
                  ) : (
                    s.value
                  )}
                </div>
                <div className="w-6 h-px bg-cream/25 mb-3" />
                <div className="text-cream/50 text-xs tracking-[0.2em] uppercase">
                  {s.label}
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Testimonials ── */}
      <TestimonialsCarousel />

      {/* ── CTA ── */}
      <section className="relative py-44 overflow-hidden">
        <Image
          src="/imagens/J&P-DJI_20250628164714_0165_D.jpg"
          alt="Líquen Events — celebração"
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/72" />
        <div className="absolute inset-0 bg-gradient-to-b from-[#080808]/70 via-transparent to-[#080808]/70" />

        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative z-10">
          <AnimateIn>
            <p className="text-white/35 text-xs tracking-[0.3em] uppercase mb-10 flex items-center gap-3">
              <span className="w-6 h-px bg-moss rounded-full flex-shrink-0" />
              <span className="text-moss">Próximo passo</span>
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <h2
              className="text-white text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-12 max-w-2xl"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Vamos trabalhar juntos?
            </h2>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/contacto"
                className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase shadow-lg shadow-moss/25"
              >
                Entrar em contacto →
              </Link>
              <Link
                href="/portfolio"
                className="inline-flex items-center gap-3 px-8 py-4 border border-white/20 text-white/55 font-medium rounded-sm hover:border-white/40 hover:text-white/85 transition-all duration-300 text-sm tracking-widest uppercase"
              >
                Ver o nosso trabalho
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
