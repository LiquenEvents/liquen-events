import type { Metadata } from "next";
import Link from "next/link";
import TrackedLink from "@/components/TrackedLink";
import AnimateIn from "@/components/AnimateIn";
import ScrollServices, { type CinematicBeat } from "@/components/ScrollServices";
import { blurFor } from "@/lib/blur";
import { BreadcrumbJsonLd, ServiceJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale, localizeHref } from "@/lib/i18n";
import { PRIMARY_BUTTON_CLASS } from "@/lib/ui-classes";

const OUTLINE_ON_LIGHT =
  "inline-flex items-center gap-3 px-8 py-3.5 border border-foreground/25 text-foreground/80 text-[11px] tracking-[0.3em] uppercase hover:border-foreground/50 hover:text-foreground transition-colors duration-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/50";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.servicosTitle,
    description: t.meta.servicosDescription,
    path: "/servicos",
    image: "/imagens/EW1_1330.jpg",
    keywords: [
      "decoração de casamentos Alentejo",
      "coordenação de casamentos Alentejo",
      "eventos corporativos Lisboa",
      "decoração de eventos Alentejo",
    ],
    ogLocale: t.meta.ogLocale,
  });
}

// Locale-independent metadata (ids, images, slugs). Display text comes from the
// dictionary (t.servicos.categories) and is merged in at render time. The images
// are the same real event photography the page always used — now they play as a
// single scroll-scrubbed cinematic instead of stacked panels.
const categoryMeta = [
  {
    id: "celebracoes",
    band: "/imagens/DaniGui_Preview20.jpg",
    services: [
      { slug: "casamentos", image: "/imagens/stephanie-mizio-760.jpg" },
      { slug: "aluguer-de-viaturas-classicas", image: "/imagens/viaturas-classicas.jpg" },
      { slug: "batizados-e-comunhoes", image: "/imagens/DaniGui_JantarFesta_26.jpg" },
      { slug: "festas-e-aniversarios", image: "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg" },
    ],
  },
  {
    id: "empresas",
    band: "/imagens/EW1_1333.jpg",
    services: [{ slug: "eventos-corporativos", image: "/imagens/EW1_1405.jpg" }],
  },
];

const STATEMENT_IMG = "/imagens/J&A-68.jpg";
const CTA_IMG = "/imagens/M&F0497.jpg";
const PHILO_IMG = "/imagens/hd-edited.jpg";
const HERO_IMG = "/imagens/EW1_1330.jpg";

const withBlur = (b: Omit<CinematicBeat, "blurDataURL">): CinematicBeat => ({
  ...b,
  blurDataURL: blurFor(b.image).blurDataURL,
});

export default async function ServicosPage({ params }: { params: Promise<{ lang: string }> }) {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  const ts = t.servicos;

  const cats = categoryMeta.map((m, ci) => {
    const ct = ts.categories[ci];
    return {
      id: m.id,
      band: m.band,
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

  // The flight: hero → signature → each category and its services → where we
  // work → closing. One beat per real photo, so the whole page is the cinematic.
  const beats: CinematicBeat[] = [
    { image: HERO_IMG, eyebrow: ts.heroEyebrow, title: ts.heroTitle.join(" "), desc: ts.heroLead },
    { image: PHILO_IMG, eyebrow: ts.philoEyebrow, title: ts.philoTitle },
    ...cats.flatMap((cat) => [
      { image: cat.band, eyebrow: cat.label, title: cat.subtitle, desc: cat.desc },
      ...cat.services.map((s) => ({
        image: s.image,
        eyebrow: cat.label,
        title: s.title,
        desc: s.desc,
      })),
    ]),
    { image: STATEMENT_IMG, eyebrow: ts.seoEyebrow, title: ts.seoTitle, desc: ts.seoText },
    {
      image: CTA_IMG,
      eyebrow: ts.ctaEyebrow,
      title: `${ts.ctaTitleLine1} ${ts.ctaTitleMoss}`,
      desc: ts.ctaText,
    },
  ].map(withBlur);

  return (
    <>
      <BreadcrumbJsonLd
        locale={locale}
        homeName={t.nav.inicio}
        items={[{ name: t.nav.servicos, path: "/servicos" }]}
      />
      <ServiceJsonLd
        locale={locale}
        name={t.jsonld.servicosServiceName}
        description={t.jsonld.servicosServiceDescription}
        path="/servicos"
      />

      {/* ── The scroll cinematic — real event photography, played as one flight.
          -mt-24 cancels the global <main> pt-24 so the first frame runs full-bleed
          to the top behind the transparent navbar. ── */}
      <div className="-mt-24">
        <ScrollServices beats={beats} />
      </div>

      {/* ── Explore + CTA — real links (navigation + SEO), on a clean surface
          after the cinematic. Every service keeps its detail page. ── */}
      <section className="bg-surface px-6 py-20 lg:px-16 lg:py-28">
        <div className="mx-auto max-w-7xl">
          <AnimateIn>
            <p className="mb-10 flex items-center gap-3 text-[10px] uppercase tracking-[0.5em] text-foreground/55">
              <span className="h-px w-8 flex-shrink-0 bg-gold" />
              {ts.philoEyebrow}
            </p>
          </AnimateIn>
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-2">
            {cats.map((cat) => (
              <AnimateIn key={cat.id}>
                <div className="border-t border-foreground/12 pt-6">
                  <h2 className="text-lg font-bold uppercase tracking-display text-foreground">
                    {cat.label}
                  </h2>
                  <p className="mt-2 max-w-md text-sm leading-relaxed text-foreground/60">
                    {cat.desc}
                  </p>
                  <ul className="mt-5 flex flex-col">
                    {cat.services.map((s) => (
                      <li key={s.slug} className="border-t border-foreground/8 first:border-t-0">
                        <Link
                          href={localizeHref(`/servicos/${s.slug}`, locale)}
                          aria-label={`${ts.verMais} — ${s.title}`}
                          className="group flex items-center justify-between gap-4 py-3.5 text-foreground/80 transition-colors hover:text-foreground"
                        >
                          <span className="text-sm uppercase tracking-display">{s.title}</span>
                          <span
                            aria-hidden
                            className="text-foreground/30 transition-transform group-hover:translate-x-1 group-hover:text-gold-text"
                          >
                            →
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              </AnimateIn>
            ))}
          </div>

          <AnimateIn>
            <div className="mt-16 flex flex-wrap items-center gap-4 border-t border-foreground/12 pt-10">
              <TrackedLink
                href={localizeHref("/orcamento", locale)}
                trackProps={{ source: "services-cta" }}
                className={PRIMARY_BUTTON_CLASS}
              >
                {t.common.pedirOrcamento} <span aria-hidden>→</span>
              </TrackedLink>
              <Link href={localizeHref("/galeria", locale)} className={OUTLINE_ON_LIGHT}>
                {ts.ctaGaleria}
              </Link>
            </div>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
