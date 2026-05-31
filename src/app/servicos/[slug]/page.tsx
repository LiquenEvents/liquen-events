import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { blurFor } from "@/lib/blur";
import AnimateIn from "@/components/AnimateIn";
import { BreadcrumbJsonLd, ServiceJsonLd, FaqJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { SERVICES, getService } from "../services-data";

export function generateStaticParams() {
  return SERVICES.map((s) => ({ slug: s.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const svc = getService(slug);
  if (!svc) return { title: "Serviço não encontrado" };
  return pageMetadata({
    title: svc.metaTitle,
    description: svc.metaDescription,
    path: `/servicos/${svc.slug}`,
    image: svc.hero,
    keywords: svc.keywords,
  });
}

export default async function ServiceDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const svc = getService(slug);
  if (!svc) notFound();

  const related = svc.related.map(getService).filter(Boolean) as NonNullable<
    ReturnType<typeof getService>
  >[];

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "Serviços", path: "/servicos" },
          { name: svc.title, path: `/servicos/${svc.slug}` },
        ]}
      />
      <ServiceJsonLd name={svc.title} description={svc.metaDescription} path={`/servicos/${svc.slug}`} />
      {svc.faqs.length > 0 && <FaqJsonLd faqs={svc.faqs} />}

      {/* ── Hero ── */}
      <section className="relative min-h-[70vh] flex items-end overflow-hidden">
        <Image src={svc.hero} {...blurFor(svc.hero)} alt={svc.title} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/20" />
        <div className="relative z-10 w-full max-w-7xl mx-auto px-6 lg:px-16 pb-20">
          <nav className="flex items-center gap-2 text-[11px] tracking-[0.2em] uppercase text-cream/45 mb-8">
            <Link href="/servicos" className="hover:text-cream transition-colors">Serviços</Link>
            <span>/</span>
            <span className="text-cream/70">{svc.eyebrow}</span>
          </nav>
          <h1
            className="text-cream font-bold leading-[0.95] max-w-4xl"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 6vw, 84px)" }}
          >
            {svc.title}
          </h1>
        </div>
      </section>

      {/* ── Intro + includes ── */}
      <section className="py-24 bg-surface">
        <div className="max-w-7xl mx-auto px-6 lg:px-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-16">
          <AnimateIn>
            <div className="flex flex-col gap-6 text-foreground/50 text-[16px] leading-[1.9]">
              {svc.intro.map((p, i) => (
                <p key={i} dangerouslySetInnerHTML={{ __html: p.replace(
                  /(Líquen Events|Évora|Alentejo|Lisboa|Portugal)/g,
                  '<strong class="text-foreground/75 font-medium">$1</strong>'
                ) }} />
              ))}
              <Link
                href="/contacto"
                className="inline-flex items-center gap-3 mt-4 text-sm text-moss hover:gap-5 transition-all duration-300 tracking-widest uppercase"
              >
                Pedir orçamento →
              </Link>
            </div>
          </AnimateIn>
          <AnimateIn delay={120}>
            <div className="border border-foreground/10 rounded-xl p-8 bg-surface-raised/40">
              <p className="text-foreground/25 text-[10px] tracking-[0.4em] uppercase mb-6">O que inclui</p>
              <ul className="flex flex-col gap-4">
                {svc.includes.map((item) => (
                  <li key={item} className="flex items-start gap-3 text-foreground/55 text-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-moss mt-1.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </AnimateIn>
        </div>
      </section>

      {/* ── Gallery ── */}
      <section className="bg-surface border-t border-foreground/8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-px">
          {svc.gallery.map((src, i) => (
            <div key={i} className="relative aspect-[3/4] overflow-hidden group">
              <Image
                src={src} {...blurFor(src)}
                alt={`${svc.title} — ${i + 1}`}
                fill
                sizes="(max-width: 1024px) 50vw, 25vw"
                className="object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/15 group-hover:bg-black/0 transition-colors duration-500" />
            </div>
          ))}
        </div>
      </section>

      {/* ── FAQ ── */}
      {svc.faqs.length > 0 && (
        <section className="py-24 bg-surface border-t border-foreground/8">
          <div className="max-w-3xl mx-auto px-6 lg:px-16">
            <p className="text-foreground/25 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50" /> Perguntas frequentes
            </p>
            <div className="flex flex-col">
              {svc.faqs.map((f) => (
                <div key={f.q} className="border-t border-foreground/8 py-7">
                  <h2 className="text-foreground/80 text-base mb-3" style={{ fontFamily: "var(--font-playfair)" }}>
                    {f.q}
                  </h2>
                  <p className="text-foreground/45 text-sm leading-[1.9]">{f.a}</p>
                </div>
              ))}
              <div className="border-t border-foreground/8" />
            </div>
          </div>
        </section>
      )}

      {/* ── Related ── */}
      {related.length > 0 && (
        <section className="py-24 bg-surface border-t border-foreground/8">
          <div className="max-w-7xl mx-auto px-6 lg:px-16">
            <p className="text-foreground/25 text-[10px] tracking-[0.4em] uppercase mb-10 flex items-center gap-3">
              <span className="w-5 h-px bg-moss/50" /> Outros serviços
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  href={`/servicos/${r.slug}`}
                  className="group relative overflow-hidden rounded-xl aspect-[16/9]"
                >
                  <Image src={r.hero} {...blurFor(r.hero)} alt={r.title} fill sizes="50vw" className="object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 to-transparent" />
                  <div className="absolute bottom-0 p-6">
                    <p className="text-moss/70 text-[9px] tracking-[0.35em] uppercase mb-1.5">{r.eyebrow}</p>
                    <h3 className="text-cream text-xl font-bold group-hover:text-moss transition-colors" style={{ fontFamily: "var(--font-playfair)" }}>
                      {r.title}
                    </h3>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── CTA ── */}
      <section className="relative py-40 bg-surface border-t border-foreground/8 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none" style={{ background: "radial-gradient(ellipse 65% 80% at 0% 105%, rgba(74,124,89,0.11) 0%, transparent 58%)" }} />
        <div className="max-w-7xl mx-auto px-6 lg:px-16 relative">
          <h2 className="text-foreground font-bold leading-[0.95] mb-12 max-w-2xl" style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(36px, 5.5vw, 76px)" }}>
            Vamos planear o seu evento?
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
