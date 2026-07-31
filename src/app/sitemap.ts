import type { MetadataRoute } from "next";
import { execFileSync } from "node:child_process";
import { SITE } from "@/lib/site";
import { SERVICES } from "@/lib/services-data";
import { PHOTOS } from "@/app/[lang]/galeria/photos-data";
import { POLOS, ESTILOS, caminhoPolo } from "@/lib/ads/polos";

const base = SITE.url;

// Absolute URL for an image in /public/imagens (ASCII names only — see the
// project notes on the optimizer 400ing on accented/space filenames).
const img = (file: string) => `${base}/imagens/${file}`;

// Absolutise a "/imagens/…"-style public path into a full URL for the sitemap.
const abs = (src: string) => (src.startsWith("http") ? src : `${base}${src}`);

// Every gallery photo, as absolute URLs, so Google discovers the whole
// portfolio for Google Images (not just a hand-picked few). Google allows up
// to 1000 <image> per URL; the gallery sits comfortably under that.
const galleryImages = PHOTOS.map((p) => abs(p.src));

/**
 * Real last-modified date for a route, from the last git commit that
 * touched its source file — not `new Date()` (which would stamp every URL
 * with "right now" on every build, making lastmod meaningless as a change
 * signal). Falls back to `undefined` (lastmod omitted for that entry)
 * rather than a fabricated date if git isn't available — e.g. a shallow
 * clone or a source tree without .git — since Google explicitly treats a
 * missing lastmod as more trustworthy than a wrong one.
 */
function lastModifiedFor(sourceFile: string): Date | undefined {
  try {
    // `:(literal)` pathspec magic: the source paths contain `[lang]`, which git
    // would otherwise read as a glob character class (matching l/a/n/g, not the
    // literal directory) and never resolve — freezing every lastmod.
    const iso = execFileSync(
      "git",
      ["log", "-1", "--format=%aI", "--", `:(literal)${sourceFile}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      },
    ).trim();
    return iso ? new Date(iso) : undefined;
  } catch {
    return undefined;
  }
}

interface RawEntry {
  path: string;
  sourceFile: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  images?: string[];
}

export default function sitemap(): MetadataRoute.Sitemap {
  const core: RawEntry[] = [
    {
      path: "/",
      sourceFile: "src/app/[lang]/page.tsx",
      changeFrequency: "weekly",
      priority: 1.0,
      images: [
        img("JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"),
        img("DaniGui_Adois_61.jpg"),
        img("JOAO_E_PEDRO_1Y1A3450.jpg"),
      ],
    },
    {
      path: "/servicos",
      sourceFile: "src/app/[lang]/servicos/page.tsx",
      changeFrequency: "monthly",
      priority: 0.9,
      images: [img("EW1_1408.jpg"), img("EW1_1330.jpg"), img("EW1_0697.jpg")],
    },
    {
      path: "/contacto",
      sourceFile: "src/app/[lang]/contacto/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Conversion page — the quote request form.
    {
      path: "/orcamento",
      sourceFile: "src/app/[lang]/orcamento/page.tsx",
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      path: "/sobre",
      sourceFile: "src/app/[lang]/sobre/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
      images: [img("JOAO_E_PEDRO_1Y1A3204.jpg"), img("DaniGui_Preview12.jpg")],
    },
    {
      path: "/galeria",
      sourceFile: "src/app/[lang]/galeria/page.tsx",
      changeFrequency: "weekly",
      priority: 0.7,
      // The full portfolio — every gallery photo, so Google can index them all.
      images: galleryImages,
    },
    {
      path: "/clientes",
      sourceFile: "src/app/[lang]/clientes/page.tsx",
      changeFrequency: "monthly",
      priority: 0.7,
      images: [img("EW1_1393.jpg")],
    },
    {
      path: "/privacidade",
      sourceFile: "src/app/[lang]/privacidade/page.tsx",
      changeFrequency: "yearly",
      priority: 0.2,
    },
    {
      path: "/termos",
      sourceFile: "src/app/[lang]/termos/page.tsx",
      changeFrequency: "yearly",
      priority: 0.2,
    },
  ];

  // Landing pages das campanhas. Entram no sitemap de propósito, ainda que
  // sejam destino de tráfego PAGO: uma página que a Google já conhece e indexou
  // arranca com Índice de Qualidade melhor do que uma que ela vê pela primeira
  // vez quando o anúncio começa a servir, e o custo por clique reflecte isso.
  // O conteúdo delas é próprio (não é duplicado de /servicos), por isso não há
  // risco de canibalização orgânica.
  const campanhas: RawEntry[] = [
    ...POLOS.map((p) => ({
      path: caminhoPolo(p.slug),
      // Todo o conteúdo destas páginas vive no catálogo — não há ficheiro por
      // polo a que apontar, tal como acontece nos serviços.
      sourceFile: "src/lib/ads/polos.ts",
      changeFrequency: "monthly" as const,
      priority: 0.8,
      images: [p.hero, ...p.fotos].map(abs),
    })),
    ...ESTILOS.map((e) => ({
      path: `/casamentos/estilo/${e.slug}`,
      sourceFile: "src/lib/ads/polos.ts",
      changeFrequency: "monthly" as const,
      priority: 0.6,
      images: [e.hero, ...e.fotos].map(abs),
    })),
    {
      path: "/casamentos/destination",
      sourceFile: "src/app/[lang]/casamentos/destination/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];

  const services: RawEntry[] = SERVICES.map((s) => ({
    path: `/servicos/${s.slug}`,
    // All service content (copy, hero, gallery, FAQs) lives in this single
    // shared data file — there's no per-slug source file to point at.
    sourceFile: "src/lib/services-data.ts",
    changeFrequency: "monthly",
    priority: 0.85,
    // Hero + the service's supporting gallery, so each service page surfaces
    // its own set of photos in Google Images.
    images: [s.hero, ...s.gallery].map(abs),
  }));

  // Each language version gets its own <url> entry (not just an hreflang
  // annotation on the PT one) — Google's documented pattern for sitemaps
  // with alternate-language pages — with both entries listing the full
  // reciprocal set, including themselves.
  return [...core, ...services, ...campanhas].flatMap((entry): MetadataRoute.Sitemap => {
    // Home is canonical without a trailing slash (matches the <link rel=canonical>
    // and OG url), so don't emit `${base}/` for it.
    const ptUrl = entry.path === "/" ? base : `${base}${entry.path}`;
    const enUrl = entry.path === "/" ? `${base}/en` : `${base}/en${entry.path}`;
    const lastModified = lastModifiedFor(entry.sourceFile);
    // PT is the default/canonical language → x-default points at it, mirroring
    // the hreflang set in the page <head>.
    const alternates = { languages: { "pt-PT": ptUrl, en: enUrl, "x-default": ptUrl } };
    const shared = {
      lastModified,
      changeFrequency: entry.changeFrequency,
      priority: entry.priority,
      images: entry.images,
      alternates,
    };
    return [
      { url: ptUrl, ...shared },
      { url: enUrl, ...shared },
    ];
  });
}
