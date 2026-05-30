import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import AnimateIn from "@/components/AnimateIn";
import { blurFor } from "@/lib/blur";
import { BreadcrumbJsonLd, JsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { SITE } from "@/lib/site";
import { projects, getProject } from "../projects-data";

export function generateStaticParams() {
  return projects.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p) return { title: "Projeto não encontrado" };
  return pageMetadata({
    title: `${p.title} — ${p.category} em ${p.location}`,
    description: p.longDesc ?? p.desc,
    path: `/portfolio/${p.slug}`,
    image: p.images[0],
    keywords: [p.title, `${p.category} ${p.location}`, "organização de eventos", "Líquen Events"],
  });
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = getProject(slug);
  if (!p) notFound();

  const others = projects.filter((x) => x.slug !== p.slug).slice(0, 3);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Portfolio", path: "/portfolio" },
          { name: p.title, path: `/portfolio/${p.slug}` },
        ]}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CreativeWork",
          name: p.title,
          about: p.category,
          dateCreated: p.year,
          locationCreated: { "@type": "Place", name: p.location },
          image: p.images.map((i) => `${SITE.url}${i}`),
          description: p.longDesc ?? p.desc,
          creator: { "@id": `${SITE.url}/#organization` },
        }}
      />

      {/* ── Hero ── */}
      <section className="relative min-h-[75vh] flex items-end overflow-hidden">
        <Image src={p.images[0]} alt={p.title} fill priority sizes="100vw" className="object-cover" {...blurFor(p.images[0])} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-black/20" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-20">
          <nav className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-cream/45 mb-8">
            <Link href="/portfolio" className="hover:text-cream transition-colors">Portfolio</Link>
            <span>/</span>
            <span className="text-cream/70">{p.category}</span>
          </nav>
          <h1
            className="text-cream font-bold leading-[0.95] mb-6"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(40px, 7vw, 96px)" }}
          >
            {p.title}
          </h1>
          <div className="flex flex-wrap gap-x-8 gap-y-2 text-cream/55 text-sm">
            <span>{p.category}</span>
            <span>·</span>
            <span>{p.location}</span>
            <span>·</span>
            <span>{p.year}</span>
          </div>
        </div>
      </section>

      {/* ── Description ── */}
      <section className="py-24 bg-surface">
        <div className="max-w-3xl mx-auto px-6 lg:px-16">
          <AnimateIn>
            <p className="text-foreground/55 text-xl leading-[1.8]" style={{ fontFamily: "var(--font-playfair)" }}>
              {p.longDesc ?? p.desc}
            </p>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="flex flex-wrap gap-2 mt-10">
              {p.tags.map((tag) => (
                <span key={tag} className="text-xs px-3 py-1.5 border border-foreground/12 text-foreground/40 rounded-full tracking-wide">
                  {tag}
                </span>
              ))}
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-px">
          {p.images.map((src, i) => (
            <div key={i} className={`relative overflow-hidden group ${i === 0 ? "sm:col-span-2 aspect-[16/9]" : "aspect-[4/3]"}`}>
              <Image
                src={src}
                alt={`${p.title} — fotografia ${i + 1}`}
                fill
                sizes={i === 0 ? "100vw" : "50vw"}
                className="object-cover transition-transform duration-700 group-hover:scale-105"
                {...blurFor(src)}
              />
            </div>
          ))}
        </div>
      </section>

      {/* ── Other projects ── */}
      <section className="py-24 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <p className="text-foreground/25 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
            <span className="w-5 h-px bg-moss/50" /> Outros projetos
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {others.map((o) => (
              <Link key={o.slug} href={`/portfolio/${o.slug}`} className="group relative overflow-hidden rounded-xl aspect-[3/4]">
                <Image src={o.images[0]} alt={o.title} fill sizes="33vw" className="object-cover transition-transform duration-700 group-hover:scale-105" {...blurFor(o.images[0])} />
                <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-transparent" />
                <div className="absolute bottom-0 p-5">
                  <p className="text-cream/55 text-[9px] tracking-[0.35em] uppercase mb-1.5">{o.category}</p>
                  <h3 className="text-cream text-lg font-bold group-hover:text-moss transition-colors" style={{ fontFamily: "var(--font-playfair)" }}>
                    {o.title}
                  </h3>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="py-32 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <h2 className="text-foreground font-bold leading-tight mb-10 max-w-2xl" style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(32px, 5vw, 64px)" }}>
            O próximo evento pode ser o seu.
          </h2>
          <Link
            href="/contacto"
            className="inline-flex items-center gap-3 px-8 py-4 bg-moss text-cream font-medium rounded-sm hover:bg-moss-dark hover:gap-5 transition-all duration-300 text-sm tracking-widest uppercase shadow-lg shadow-moss/15"
          >
            Pedir orçamento →
          </Link>
        </div>
      </section>
    </>
  );
}
