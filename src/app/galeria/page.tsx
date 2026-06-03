import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import GaleriaClient from "./GaleriaClient";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return pageMetadata({
    title: t.meta.galeriaTitle,
    description: t.meta.galeriaDescription,
    path: "/galeria",
    image: "/imagens/DaniGui_Preview20.jpg",
    keywords: ["galeria de eventos", "fotografias de casamentos Alentejo"],
    ogLocale: t.meta.ogLocale,
  });
}

export default async function GaleriaPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return (
    <>
      <BreadcrumbJsonLd items={[{ name: "Galeria", path: "/galeria" }]} />
      <PageHeader
        label={t.galeria.headerLabel}
        title={t.galeria.headerTitle}
        description={t.galeria.headerDesc}
      />

      <section className="py-16 bg-surface">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <GaleriaClient />
        </div>
      </section>

      <section className="py-24 bg-surface border-t border-foreground/8">
        <div className="max-w-7xl mx-auto px-6 lg:px-16">
          <p className="text-foreground/68 text-[10px] tracking-[0.48em] uppercase mb-8 flex items-center gap-3">
            <span className="w-5 h-px bg-moss/50 flex-shrink-0" />
            {t.galeria.instaEyebrow}
          </p>
          <h2
            className="text-foreground text-4xl font-bold mb-5"
            style={{ fontFamily: "var(--font-playfair)" }}
          >
            {t.galeria.instaTitle}
          </h2>
          <p className="text-foreground/60 text-sm leading-relaxed mb-10 max-w-md">
            {t.galeria.instaText}
          </p>
          <a
            href="https://www.instagram.com/liquen.events"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-8 py-4 btn-shine bg-moss text-cream font-medium text-sm tracking-widest uppercase hover:bg-moss-dark hover:gap-5 transition-all duration-300"
          >
            @liquen.events →
          </a>
        </div>
      </section>
    </>
  );
}
