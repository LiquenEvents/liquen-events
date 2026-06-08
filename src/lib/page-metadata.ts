import type { Metadata } from "next";
import { headers } from "next/headers";
import { SITE } from "./site";
import { dimsFor } from "./image-meta";

interface PageMetaInput {
  title: string; // used in <title> (template appends "| Líquen Events")
  description: string;
  path: string; // e.g. "/servicos"
  ogTitle?: string; // optional richer title for social cards
  image?: string; // optional page-specific OG image
  keywords?: string[];
  ogLocale?: string; // e.g. "pt_PT" | "en_US" (defaults to the site locale)
}

/** Builds consistent, SEO-complete metadata for a route (PT canonical + EN alt). */
export async function pageMetadata(input: PageMetaInput): Promise<Metadata> {
  const { title, description, path, ogTitle, image, keywords, ogLocale } = input;
  const ogImage = image ?? SITE.ogImage;
  // Declare the image's real dimensions when known so social cards render with
  // the correct aspect ratio; fall back to the OG standard 1200×630.
  const [ogWidth, ogHeight] = dimsFor(ogImage) ?? [1200, 630];

  // The English mirror (/en/*) self-canonicalises; Portuguese stays canonical.
  // Both versions declare the same reciprocal hreflang set so Google clusters
  // them and indexes the English pages.
  const enPath = path === "/" ? "/en" : `/en${path}`;
  const isEn = (await headers()).get("x-liquen-locale") === "en";
  const canonical = isEn ? enPath : path;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical,
      languages: { "pt-PT": path, en: enPath, "x-default": path },
    },
    openGraph: {
      type: "website",
      locale: ogLocale ?? SITE.locale,
      siteName: SITE.name,
      url: `${SITE.url}${canonical}`,
      title: ogTitle ?? `${title} | ${SITE.name}`,
      description,
      images: [{ url: ogImage, width: ogWidth, height: ogHeight, alt: `${title} — ${SITE.name}` }],
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle ?? `${title} | ${SITE.name}`,
      description,
      images: [ogImage],
    },
  };
}
