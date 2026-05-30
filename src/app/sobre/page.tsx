import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import Image from "next/image";
import AnimateIn from "@/components/AnimateIn";
import CountUp from "@/components/CountUp";

export const metadata: Metadata = {
  title: "Sobre",
  description:
    "Conheça a Liquen Events — empresa especializada em organização de eventos com sede em Évora. Eventos corporativos, casamentos, celebrações e muito mais.",
};

const values = [
  {
    title: "Criatividade",
    desc: "Cada evento é único. Desenvolvemos conceitos originais que refletem a personalidade e visão de cada cliente.",
  },
  {
    title: "Excelência",
    desc: "Não nos contentamos com o suficiente. Perseguimos a perfeição em cada detalhe, por mais pequeno que seja.",
  },
  {
    title: "Compromisso",
    desc: "Tratamos cada evento como se fosse o nosso. O sucesso do cliente é o nosso sucesso.",
  },
  {
    title: "Transparência",
    desc: "Comunicação clara, orçamentos detalhados e total honestidade em cada etapa do processo.",
  },
];

export default function SobrePage() {
  return (
    <>
      <PageHeader
        label="Quem somos"
        title="Sobre a Liquen Events"
        description="Mais de 10 anos a criar eventos extraordinários em Portugal."
      />

      {/* Story */}
      <section className="py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-20 items-start">
            <AnimateIn from="left">
              <div>
                <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-10 flex items-center gap-3">
                  <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                  A Nossa História
                </p>
                <div className="flex flex-col gap-5 text-foreground/45 text-base leading-[1.85]">
                  <p>
                    A Líquen Events é uma empresa especializada em planear e executar
                    eventos únicos, transformando as suas ideias em experiências memoráveis.
                    Com sede em Évora, atuamos em todo o território nacional.
                  </p>
                  <p>
                    Trabalhamos lado a lado consigo, oferecendo soluções personalizadas
                    adaptadas ao seu estilo, gosto e orçamento — para eventos privados,
                    corporativos, culturais e casamentos.
                  </p>
                  <p>
                    A nossa equipa criativa e dedicada tem uma missão clara:
                    organizamos eventos, eternizamos memórias.
                  </p>
                </div>
              </div>
            </AnimateIn>
            <AnimateIn from="right" delay={120}>
              <div className="flex flex-col gap-8">
                {/* Mission — editorial left-border quote */}
                <div className="border-l-2 border-moss/50 pl-8 py-2">
                  <p className="text-foreground/25 text-[10px] tracking-[0.38em] uppercase mb-4">A nossa missão</p>
                  <p
                    className="text-foreground/70 text-2xl leading-snug"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    Organizamos eventos,<br />eternizamos memórias.
                  </p>
                </div>
                {/* Stats — flat grid */}
                <div className="grid grid-cols-2 gap-px bg-foreground/[0.06]">
                  <div className="bg-surface flex flex-col items-center justify-center py-10 gap-1.5">
                    <p
                      className="text-moss text-4xl font-bold leading-none"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      <CountUp to={100} suffix="+" />
                    </p>
                    <p className="text-foreground/28 text-[10px] tracking-[0.28em] uppercase">Eventos</p>
                  </div>
                  <div className="bg-surface flex flex-col items-center justify-center py-10 gap-1.5">
                    <p
                      className="text-moss text-4xl font-bold leading-none"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      <CountUp to={19} suffix="+" />
                    </p>
                    <p className="text-foreground/28 text-[10px] tracking-[0.28em] uppercase">Clientes</p>
                  </div>
                </div>
              </div>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* Photo strip — edge-to-edge */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div
            className="grid grid-cols-2 lg:grid-cols-4 gap-px"
            style={{ height: "clamp(180px, 28vw, 380px)" }}
          >
            {[
              { src: "/imagens/Natalia e Jonathan-167.jpg", label: "Casamento" },
              { src: "/imagens/EW1_1342.jpg", label: "Corporativo" },
              { src: "/imagens/JOAO_E_PEDRO_1Y1A3179.jpg", label: "Casamento" },
              { src: "/imagens/20_10_2025_0375.jpg", label: "Evento" },
            ].map((item, i) => (
              <div key={i} className="relative overflow-hidden group">
                <Image
                  src={item.src}
                  alt={item.label}
                  fill
                  sizes="(max-width: 768px) 50vw, 25vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-500" />
              </div>
            ))}
          </div>
        </AnimateIn>
      </section>

      {/* Cinematic statement — full bleed */}
      <section className="relative overflow-hidden border-t border-foreground/8" style={{ minHeight: "clamp(420px, 65vh, 680px)" }}>
        <Image
          src="/imagens/M&F0497.jpg"
          alt="Líquen Events — celebração"
          fill
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-black/65" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#080808] via-transparent to-[#080808]/60" />
        <div className="relative z-10 h-full flex items-center">
          <div className="max-w-7xl mx-auto px-6 lg:px-16 w-full py-28">
            <AnimateIn>
              <p className="text-cream/40 text-[10px] tracking-[0.5em] uppercase mb-10 flex items-center gap-3">
                <span className="w-6 h-px bg-moss rounded-full flex-shrink-0" />
                A nossa filosofia
              </p>
            </AnimateIn>
            <AnimateIn delay={100}>
              <p
                className="text-cream font-bold leading-[1.15] max-w-4xl"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4.2vw, 60px)" }}
              >
                Não organizamos apenas eventos.
                <span className="text-cream/45"> Desenhamos experiências que ficam para sempre na memória de quem as vive.</span>
              </p>
            </AnimateIn>
          </div>
        </div>
      </section>

      {/* Values */}
      <section className="py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-20 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
              O que nos guia
            </p>
          </AnimateIn>
          <div>
            {values.map((v, i) => (
              <AnimateIn key={v.title} delay={i * 60}>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-20 py-10 border-t border-foreground/8">
                  <div className="lg:col-span-1 flex items-start gap-4">
                    <span className="text-foreground/15 text-xs font-mono mt-1">0{i + 1}</span>
                    <h3
                      className="text-foreground text-lg font-bold"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {v.title}
                    </h3>
                  </div>
                  <p className="lg:col-span-4 text-foreground/40 text-sm leading-relaxed max-w-xl">
                    {v.desc}
                  </p>
                </div>
              </AnimateIn>
            ))}
            <div className="border-t border-foreground/8" />
          </div>
        </div>
      </section>

      {/* Team */}
      <section className="py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-20 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
              As pessoas
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-px bg-foreground/[0.06]">
              {/* Left — identity */}
              <div className="bg-surface p-12 lg:p-16">
                <h3
                  className="text-foreground font-bold leading-none mb-3"
                  style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 4vw, 52px)" }}
                >
                  Catarina Gaspar
                </h3>
                <p className="text-foreground/38 text-sm mb-8">Fundadora & CEO</p>
                <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase flex items-center gap-2">
                  <span className="w-1 h-1 rounded-full bg-moss flex-shrink-0" />
                  Évora, Portugal
                </p>
              </div>
              {/* Right — quote */}
              <div className="bg-surface p-12 lg:p-16 border-t lg:border-t-0 border-foreground/[0.06]">
                <span className="block text-moss/25 text-6xl font-bold leading-none mb-6" style={{ fontFamily: "var(--font-playfair)" }}>&ldquo;</span>
                <p
                  className="text-foreground/55 text-lg leading-[1.7]"
                  style={{ fontFamily: "var(--font-playfair)" }}
                >
                  Cada evento é uma oportunidade única de criar algo extraordinário. É o que nos move todos os dias.
                </p>
              </div>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* CTA */}
      <section className="py-40 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <h2
              className="text-foreground text-5xl sm:text-6xl lg:text-7xl font-bold leading-tight mb-12 max-w-2xl"
              style={{ fontFamily: "var(--font-playfair)" }}
            >
              Vamos trabalhar juntos?
            </h2>
          </AnimateIn>
          <AnimateIn delay={150}>
            <Link
              href="/contacto"
              className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase"
            >
              Entrar em Contacto →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
