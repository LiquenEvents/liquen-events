import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import TestimonialsCarousel from "@/components/TestimonialsCarousel";

export const metadata: Metadata = pageMetadata({
  title: "Serviços — Casamentos e Eventos Corporativos no Alentejo",
  description:
    "Organização de casamentos, eventos corporativos, conferências, festas e eventos culturais em Évora, Alentejo, Lisboa e todo o Portugal. Soluções à medida do seu evento.",
  path: "/servicos",
  image: "/imagens/EW1_1408.jpg",
  keywords: [
    "wedding planner Alentejo",
    "organização de casamentos Évora",
    "eventos corporativos Lisboa",
    "conferências e congressos",
    "organização de festas Alentejo",
  ],
});

const navItems = [
  { label: "Empresas", id: "empresas" },
  { label: "Celebrações", id: "celebracoes" },
  { label: "Cultura", id: "cultura" },
];

const process = [
  {
    step: "01",
    title: "Briefing",
    desc: "Ouvimos a sua ideia e definimos o conceito.",
  },
  {
    step: "02",
    title: "Proposta",
    desc: "Proposta detalhada, com orçamento transparente.",
  },
  {
    step: "03",
    title: "Produção",
    desc: "Fornecedores, logística, decoração e coordenação.",
  },
  {
    step: "04",
    title: "Execução",
    desc: "Presentes no dia, para tudo correr na perfeição.",
  },
];

const differentiators = [
  {
    num: "01",
    title: "Coordenação Total",
    desc: "Um único ponto de contacto, do primeiro olá ao último brinde.",
  },
  {
    num: "02",
    title: "À Sua Medida",
    desc: "Cada projeto construído à volta da sua visão, estilo e orçamento.",
  },
  {
    num: "03",
    title: "Rede de Excelência",
    desc: "Fornecedores de confiança, selecionados ao longo de anos.",
  },
  {
    num: "04",
    title: "Presença Total",
    desc: "Coordenação no local para que cada momento corra na perfeição.",
  },
];

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

const categories: Category[] = [
  {
    id: "empresas",
    num: "01",
    label: "Empresas",
    subtitle: "Para empresas",
    desc: "Elevamos a imagem da sua marca através de eventos que transformam equipas e celebram conquistas.",
    layout: "mosaic-right",
    services: [
      {
        title: "Conferências & Congressos",
        slug: "eventos-corporativos",
        desc: "Organização completa de conferências empresariais, da logística ao audiovisual.",
        image: "/imagens/EW1_1330.jpg",
      },
      {
        title: "Teambuilding",
        slug: "eventos-corporativos",
        desc: "Actividades e experiências que unem equipas e fortalecem a cultura organizacional.",
        image: "/imagens/EW1_0576.jpg",
      },
      {
        title: "Lançamentos de Produto",
        slug: "eventos-corporativos",
        desc: "Eventos de impacto para apresentar novos produtos ao mercado com criatividade.",
        image: "/imagens/EW1_0697.jpg",
      },
      {
        title: "Jantares de Empresa",
        slug: "eventos-corporativos",
        desc: "Desde jantares de Natal a gala awards, criamos momentos de celebração memoráveis.",
        image: "/imagens/EW1_1404.jpg",
      },
    ],
  },
  {
    id: "celebracoes",
    num: "02",
    label: "Celebrações",
    subtitle: "Para particulares",
    desc: "Os momentos mais importantes da sua vida, planeados ao pormenor com cuidado e elegância.",
    layout: "mosaic-left",
    services: [
      {
        title: "Casamentos",
        slug: "casamentos",
        desc: "O vosso dia mais especial, planeado ao pormenor. Da escolha do espaço ao último detalhe.",
        image: "/imagens/DaniGui_Preview18.jpg",
      },
      {
        title: "Batizados & Comunhões",
        slug: "festas-e-aniversarios",
        desc: "Celebrações familiares íntimas e cheias de significado, organizadas com carinho.",
        image: "/imagens/DaniGui_JantarFesta_11.jpg",
      },
      {
        title: "Festas de Aniversário",
        slug: "festas-e-aniversarios",
        desc: "Festas temáticas ou clássicas para todas as idades. Cada aniversário é uma história.",
        image: "/imagens/DaniGui_JantarFesta_1.jpg",
      },
      {
        title: "Jantares de Gala",
        slug: "jantares-de-gala",
        desc: "Eventos sociais de prestígio com ambiente sofisticado e coordenação impecável.",
        image: "/imagens/JOAO_E_PEDRO_IMGL2180.jpg",
      },
    ],
  },
  {
    id: "cultura",
    num: "03",
    label: "Cultura",
    subtitle: "Eventos culturais",
    desc: "Experiências que transcendem o evento e ficam na memória colectiva.",
    layout: "duo",
    services: [
      {
        title: "Eventos Culturais",
        slug: "eventos-culturais",
        desc: "Experiências culturais únicas criadas com criatividade, dedicação e atenção a cada pormenor.",
        image: "/imagens/20_10_2025_0302.jpg",
      },
      {
        title: "Exposições & Inaugurações",
        slug: "eventos-culturais",
        desc: "Abertura de espaços e exposições com ambiente cuidado e coordenação profissional.",
        image: "/imagens/20_10_2025_0044.jpg",
      },
    ],
  },
];

/* ── Service card ── */
function ServiceCard({
  service,
  index,
  catNum,
  sizes = "(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw",
}: {
  service: ServiceCard;
  index: number;
  catNum: string;
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
          Ver mais →
        </span>
      </div>
    </Link>
  );
}

/* ── Mosaic grid — 4 services ── */
function MosaicGrid({ cat }: { cat: Category }) {
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
              sizes="(max-width: 640px) 100vw, 65vw"
            />
          </div>
          {/* Tall right */}
          <div className="col-span-1 row-span-2">
            <ServiceCard
              service={s1}
              index={1}
              catNum={cat.num}
              sizes="(max-width: 640px) 100vw, 35vw"
            />
          </div>
          {/* Bottom left small */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s2}
              index={2}
              catNum={cat.num}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
          {/* Bottom mid */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s3}
              index={3}
              catNum={cat.num}
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
              sizes="(max-width: 640px) 100vw, 35vw"
            />
          </div>
          {/* Wide top-right */}
          <div className="col-span-2 row-span-1">
            <ServiceCard
              service={s1}
              index={1}
              catNum={cat.num}
              sizes="(max-width: 640px) 100vw, 65vw"
            />
          </div>
          {/* Bottom mid */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s2}
              index={2}
              catNum={cat.num}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
          {/* Bottom right */}
          <div className="col-span-1 row-span-1">
            <ServiceCard
              service={s3}
              index={3}
              catNum={cat.num}
              sizes="(max-width: 640px) 100vw, 33vw"
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ── Duo grid — 2 services ── */
function DuoGrid({ cat }: { cat: Category }) {
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
          sizes="(max-width: 640px) 100vw, 50vw"
        />
      ))}
    </div>
  );
}

/* ── Mobile card list ── */
function MobileCardStack({ cat }: { cat: Category }) {
  return (
    <div className="grid grid-cols-2 gap-2" style={{ gridAutoRows: "clamp(200px, 48vw, 320px)" }}>
      {cat.services.map((s, i) => (
        <ServiceCard key={s.title} service={s} index={i} catNum={cat.num} sizes="50vw" />
      ))}
    </div>
  );
}

export default function ServicosPage() {
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Serviços", path: "/servicos" }]} />
      <ServiceJsonLd
        name="Organização de eventos, casamentos e eventos corporativos"
        description="Organização de casamentos, eventos corporativos, conferências e celebrações em Évora, Lisboa e todo o Portugal — da decoração à coordenação."
        path="/servicos"
      />

      {/* ── Ticker ── */}
      <div className="bg-surface border-b border-foreground/[0.055] overflow-hidden">
        <div className="flex animate-marquee whitespace-nowrap py-2.5">
          {[...Array(8)].map((_, i) => (
            <span
              key={i}
              className="text-foreground/18 text-[9px] tracking-[0.55em] uppercase flex-shrink-0 px-6"
            >
              Casamentos · Eventos Corporativos · Celebrações Privadas · Eventos Culturais
            </span>
          ))}
        </div>
      </div>

      {/* ── Hero ── */}
      <section className="relative min-h-[100svh] flex items-end pb-0 pt-24 md:pt-36 bg-surface overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 70% 60% at -10% 80%, rgba(74,124,89,0.07) 0%, transparent 55%)",
          }}
        />

        <div className="relative max-w-7xl mx-auto px-6 lg:px-16 w-full">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-16 items-end">
            {/* Left — headline */}
            <div className="lg:col-span-7 pb-2">
              <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase mb-10 anim-0 flex items-center gap-3">
                <span className="w-6 h-px bg-moss flex-shrink-0" />O que oferecemos
              </p>
              <h1
                className="text-foreground font-bold leading-[0.88] tracking-tight mb-12 anim-1"
                style={{
                  fontFamily: "var(--font-playfair)",
                  fontSize: "clamp(52px, 8.5vw, 118px)",
                }}
              >
                Cada evento,
                <br />
                uma história
                <br />
                <span className="text-moss">por contar.</span>
              </h1>
              <div className="border-t border-foreground/8 pt-9 anim-2">
                <p className="text-foreground/35 text-[15px] leading-[1.85] max-w-sm mb-8">
                  Especializados em eventos privados, corporativos, culturais e casamentos —
                  soluções personalizadas adaptadas ao seu estilo, gosto e orçamento.
                </p>
                <Link
                  href="/contacto"
                  className="inline-flex items-center gap-3 text-sm text-foreground/40 hover:text-foreground/70 transition-colors duration-300 group"
                >
                  <span className="w-8 h-px bg-foreground/18 flex-shrink-0 group-hover:w-14 transition-all duration-500" />
                  Pedir orçamento
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
                    priority
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
                    priority
                    sizes="(max-width: 1024px) 50vw, 18vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-b from-black/20 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-cream/35 text-[8px] tracking-[0.4em] uppercase">
                      Corporativos
                    </span>
                  </div>
                </div>
                {/* Bottom-right */}
                <div className="relative overflow-hidden">
                  <Image
                    src="/imagens/20_10_2025_0220.jpg"
                    {...blurFor("/imagens/20_10_2025_0220.jpg")}
                    alt="Eventos culturais"
                    fill
                    sizes="(max-width: 1024px) 50vw, 18vw"
                    className="object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
                  <div className="absolute bottom-4 left-4">
                    <span className="text-cream/35 text-[8px] tracking-[0.4em] uppercase">
                      Culturais
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
                  className="text-foreground/22 text-[9px] tracking-[0.45em] uppercase hover:text-foreground/60 transition-colors duration-300"
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
              { src: "/imagens/EW1_1408.jpg", label: "Eventos Corporativos" },
              { src: "/imagens/JOAO_E_PEDRO_1Y1A3204.jpg", label: "Casamentos" },
              { src: "/imagens/20_10_2025_0358.jpg", label: "Celebrações" },
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

      {/* ── Large text marquee ── */}
      <section className="bg-surface border-t border-foreground/[0.055] overflow-hidden py-10 lg:py-14">
        <div className="flex animate-marquee whitespace-nowrap">
          {[...Array(4)].map((_, i) => (
            <span
              key={i}
              className="flex-shrink-0 font-bold text-foreground/[0.055] tracking-tight pr-16"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(56px, 8vw, 108px)",
              }}
            >
              EMPRESAS · CASAMENTOS · CELEBRAÇÕES · CULTURA
            </span>
          ))}
        </div>
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
                  className="text-[10px] tracking-[0.4em] uppercase text-foreground/30 hover:text-moss transition-colors duration-300 flex items-center gap-2 whitespace-nowrap"
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
                      <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase mb-4 flex items-center gap-3">
                        <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
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
                  {cat.layout === "duo" ? <DuoGrid cat={cat} /> : <MosaicGrid cat={cat} />}
                </div>
                {/* Mobile card stack */}
                <div className="lg:hidden">
                  <MobileCardStack cat={cat} />
                </div>
              </AnimateIn>

              {/* View all link */}
              <AnimateIn delay={120}>
                <div className="mt-8 flex justify-end">
                  <Link
                    href={`/servicos/${cat.services[0].slug}`}
                    className="group inline-flex items-center gap-3 text-xs text-foreground/30 hover:text-foreground/65 transition-colors duration-300 tracking-[0.3em] uppercase"
                  >
                    <span>Ver detalhes</span>
                    <span className="w-6 h-px bg-foreground/20 group-hover:w-10 transition-all duration-500" />
                  </Link>
                </div>
              </AnimateIn>
            </div>
          </section>
        ))}
      </div>

      {/* ── Como trabalhamos ── */}
      <section className="py-14 md:py-28 lg:py-40 bg-surface-raised border-t border-foreground/8 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-8 mb-20 lg:mb-28">
              <div>
                <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center gap-3">
                  <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                  Como trabalhamos
                </p>
                <h2
                  className="text-foreground font-bold leading-none"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(38px, 5vw, 70px)",
                  }}
                >
                  Do conceito
                  <br />
                  <span className="text-moss">à execução</span>
                </h2>
              </div>
              <p className="text-foreground/30 text-sm leading-[1.85] max-w-xs">
                Quatro etapas que transformam a sua ideia num evento que fica na memória.
              </p>
            </div>
          </AnimateIn>

          {/* Steps — horizontal on desktop */}
          <div className="relative">
            {/* Connecting line */}
            <div className="hidden lg:block absolute top-5 left-5 right-5 h-px bg-foreground/[0.06]" />

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 lg:gap-8">
              {process.map((p, i) => (
                <AnimateIn key={p.step} delay={i * 80}>
                  <div className="relative group">
                    {/* Step number circle */}
                    <div className="relative flex items-center mb-8 lg:mb-10">
                      <div className="w-10 h-10 rounded-full border border-foreground/[0.08] bg-surface-raised flex items-center justify-center flex-shrink-0 group-hover:border-moss/40 transition-colors duration-300">
                        <span className="text-moss/55 text-[9px] tracking-[0.3em] font-mono">
                          {p.step}
                        </span>
                      </div>
                    </div>
                    <h3
                      className="text-foreground text-xl font-bold mb-3 group-hover:text-moss transition-colors duration-200"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {p.title}
                    </h3>
                    <p className="text-foreground/33 text-sm leading-[1.85]">{p.desc}</p>
                  </div>
                </AnimateIn>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── O que nos distingue ── */}
      <section className="py-14 md:py-28 lg:py-40 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-10 mb-20">
              <div>
                <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase mb-5 flex items-center gap-3">
                  <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                  Porquê a Líquen
                </p>
                <h2
                  className="text-foreground font-bold leading-none"
                  style={{
                    fontFamily: "var(--font-playfair)",
                    fontSize: "clamp(38px, 5vw, 70px)",
                  }}
                >
                  O que nos
                  <br />
                  <span className="text-moss">distingue</span>
                </h2>
              </div>
              <p className="text-foreground/30 text-sm leading-[1.85] max-w-xs">
                A nossa abordagem combina atenção ao detalhe, criatividade e uma rede de parceiros
                de excelência — para que cada evento seja único.
              </p>
            </div>
          </AnimateIn>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-foreground/[0.055]">
            {differentiators.map((d, i) => (
              <AnimateIn key={d.num} delay={i * 60}>
                <div className="bg-surface p-7 sm:p-10 lg:p-14 group hover:bg-surface-raised transition-colors duration-300 relative overflow-hidden">
                  <span
                    aria-hidden
                    className="absolute -bottom-4 -right-2 select-none pointer-events-none font-bold leading-none"
                    style={{
                      fontFamily: "var(--font-playfair)",
                      fontSize: "clamp(80px, 10vw, 150px)",
                      color: "rgba(222,218,212,0.025)",
                    }}
                  >
                    {d.num}
                  </span>
                  <div className="relative">
                    <p className="text-moss/50 text-[9px] tracking-[0.48em] font-mono uppercase mb-7">
                      {d.num}
                    </p>
                    <h3
                      className="text-foreground text-2xl font-bold mb-4 group-hover:text-moss transition-colors duration-200"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {d.title}
                    </h3>
                    <p className="text-foreground/33 text-sm leading-[1.85] max-w-xs">{d.desc}</p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── Second photo strip ── */}
      <section className="bg-surface border-t border-foreground/8">
        <AnimateIn from="fade">
          <div className="grid grid-cols-3 gap-px" style={{ height: "clamp(160px, 35vw, 440px)" }}>
            {[
              { src: "/imagens/EW1_1342.jpg", label: "Corporativo", anchor: "#empresas" },
              {
                src: "/imagens/Natalia e Jonathan-167.jpg",
                label: "Casamentos",
                anchor: "#celebracoes",
              },
              { src: "/imagens/20_10_2025_0244.jpg", label: "Cultura", anchor: "#cultura" },
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
              <p className="text-foreground/25 text-[10px] tracking-[0.48em] uppercase mb-6 flex items-center gap-3">
                <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
                Onde atuamos
              </p>
              <h2
                className="text-foreground font-bold leading-[1.05] mb-8"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(28px, 4vw, 52px)" }}
              >
                Évora, Lisboa e todo o Portugal
              </h2>
              <p className="text-foreground/45 text-base lg:text-lg leading-[1.8] max-w-md">
                Casamentos, eventos corporativos e celebrações — do conceito à execução, com a
                sensibilidade do Alentejo e a exigência de uma equipa profissional.
              </p>
            </AnimateIn>
          </div>
          <AnimateIn from="right" className="relative min-h-[320px] lg:min-h-[560px] overflow-hidden order-1 lg:order-2">
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
      <section className="relative py-14 md:py-28 lg:py-48 bg-surface border-t border-foreground/8 overflow-hidden">
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "radial-gradient(ellipse 65% 80% at 0% 105%, rgba(74,124,89,0.11) 0%, transparent 58%)",
          }}
        />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <AnimateIn>
            <p className="text-foreground/25 text-[10px] tracking-[0.5em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-moss flex-shrink-0" />
              <span className="text-moss/65">Próximo passo</span>
            </p>
          </AnimateIn>
          <AnimateIn delay={80}>
            <h2
              className="text-foreground font-bold leading-[0.9] tracking-tight mb-6 max-w-3xl"
              style={{
                fontFamily: "var(--font-playfair)",
                fontSize: "clamp(48px, 7.5vw, 108px)",
              }}
            >
              Tem um evento
              <br />
              <span className="text-moss">em mente?</span>
            </h2>
            <p className="text-foreground/30 text-base leading-[1.85] mb-14 max-w-md">
              Fale connosco. Sem compromisso, sem custo. Ouvimos a sua ideia e apresentamos uma
              proposta à sua medida.
            </p>
          </AnimateIn>
          <AnimateIn delay={180}>
            <div className="flex flex-wrap gap-4">
              <Link
                href="/contacto"
                className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase shadow-lg shadow-moss/15"
              >
                Pedir Orçamento →
              </Link>
              <Link
                href="/galeria"
                className="inline-flex items-center gap-3 px-8 py-4 border border-foreground/12 text-foreground/42 font-medium hover:border-foreground/25 hover:text-foreground/72 transition-all duration-300 text-sm tracking-widest uppercase"
              >
                Ver a galeria
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
