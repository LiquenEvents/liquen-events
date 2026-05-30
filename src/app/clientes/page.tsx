import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import CountUp from "@/components/CountUp";
import ClientLogoGrid from "@/components/ClientLogoGrid";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { clientLogos } from "@/data";

export const metadata: Metadata = pageMetadata({
  title: "Clientes — Quem Confia na Líquen Events",
  description:
    "Empresas e instituições que confiam na Líquen Events em Évora e no Alentejo: José de Mello, Aernnova, Mainova, Universidade de Évora, Câmara Municipal de Évora, Pérez-Llorca e muito mais.",
  path: "/clientes",
  keywords: ["clientes Líquen Events", "eventos corporativos Évora", "empresas de eventos Alentejo"],
});

const testimonials = [
  {
    name: "António Bettencourt",
    role: "Cliente",
    text: "O ambiente criado pela vossa equipa elevou a imagem do nosso evento. Ficámos impressionados com a sofisticação da decoração.",
    event: "Evento Corporativo",
  },
  {
    name: "Alexandra Teixeira",
    role: "Cliente",
    text: "A dedicação da equipa em criar ambientes mágicos, com decoração impecável e coordenação perfeita, permitiu-nos desfrutar do evento sem qualquer preocupação.",
    event: "Evento Social",
  },
  {
    name: "Stephanie & Mizio",
    role: "Clientes",
    text: "Everything was exactly how we'd envisioned and you created a beautiful space for us!",
    event: "Evento Privado",
  },
  {
    name: "Teresinha Malta",
    role: "Cliente",
    text: "Serviço de excelência, com muito carinho e disponibilidade por parte de toda a equipa. Superaram todas as expectativas.",
    event: "Evento Social",
  },
  {
    name: "Ana Pinho",
    role: "Cliente",
    text: "Excelente, recomendo!!",
    event: "Evento Privado",
  },
];

export default function ClientesPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Clientes", path: "/clientes" }]} />
      <PageHeader
        label="Quem confia em nós"
        title="Os Nossos Clientes"
        description="Empresas e famílias que nos escolheram para os seus momentos mais especiais."
      />

      {/* Stats band */}
      <section className="bg-surface border-b border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-px bg-foreground/[0.06]">
            {[
              { kind: "count" as const, to: 19, suffix: "+", label: "Clientes empresariais" },
              { kind: "count" as const, to: 100, suffix: "+", label: "Eventos realizados" },
              { kind: "static" as const, value: "5★", label: "Avaliação média" },
              { kind: "static" as const, value: "24h", label: "Tempo de resposta" },
            ].map((s, i) => (
              <AnimateIn key={s.label} delay={i * 70}>
                <div className="bg-surface flex flex-col items-center justify-center text-center py-14 px-4 gap-3 h-full">
                  <p
                    className="text-moss text-4xl lg:text-5xl font-bold leading-none"
                    style={{ fontFamily: "var(--font-playfair)" }}
                  >
                    {s.kind === "count" ? <CountUp to={s.to} suffix={s.suffix} /> : s.value}
                  </p>
                  <p className="text-foreground/30 text-[10px] tracking-[0.28em] uppercase">{s.label}</p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* Client logos */}
      <section className="py-28 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-20 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
              Empresas parceiras
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <ClientLogoGrid clients={clientLogos} />
          </AnimateIn>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-28 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-20 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
              O que dizem
            </p>
          </AnimateIn>
          <div>
            {testimonials.map((t, i) => (
              <AnimateIn key={t.name} delay={i * 60}>
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 lg:gap-16 py-12 border-t border-foreground/8">
                  <div className="lg:col-span-1">
                    <p className="text-foreground text-sm font-semibold mb-1">{t.name}</p>
                    <p className="text-foreground/35 text-xs leading-relaxed">{t.role}</p>
                    <p className="text-moss text-xs mt-2 font-medium">{t.event}</p>
                  </div>
                  <p className="lg:col-span-4 text-foreground/50 text-base leading-relaxed">
                    &ldquo;{t.text}&rdquo;
                  </p>
                </div>
              </AnimateIn>
            ))}
            <div className="border-t border-foreground/8" />
          </div>
        </div>
      </section>

      {/* Photo moments */}
      <section className="py-16 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
              Momentos dos nossos eventos
            </p>
          </AnimateIn>
          <AnimateIn from="fade" delay={80}>
            <div className="grid grid-cols-2 md:grid-cols-4 auto-rows-[200px] gap-3">
              {[
                { src: "/imagens/EW1_1393.jpg", label: "Corporativo", cls: "md:row-span-2" },
                { src: "/imagens/DaniGui_Preview70.jpg", label: "Casamento", cls: "" },
                { src: "/imagens/20_10_2025_0407.jpg", label: "Conferência", cls: "" },
                { src: "/imagens/JOAO_E_PEDRO_1Y1A3232.jpg", label: "Casamento", cls: "" },
                { src: "/imagens/DaniGui_Adois_57.jpg", label: "Jantar", cls: "" },
              ].map((item, i) => (
                <div key={i} className={`relative overflow-hidden group ${item.cls}`}>
                  <Image
                    src={item.src} {...blurFor(item.src)}
                    alt={item.label}
                    fill
                    sizes="(max-width: 768px) 50vw, 25vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors duration-500" />
                  <span className="absolute bottom-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 text-[9px] tracking-[0.4em] uppercase text-white/80">
                    {item.label}
                  </span>
                </div>
              ))}
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
              Junte-se aos nossos clientes.
            </h2>
          </AnimateIn>
          <AnimateIn delay={150}>
            <Link
              href="/contacto"
              className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase"
            >
              Falar Connosco →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
