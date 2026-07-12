import type { MetadataRoute } from "next";
import { execFileSync } from "node:child_process";
import { SITE } from "@/lib/site";
import { SERVICES } from "./servicos/services-data";

const base = SITE.url;

// Absolute URL for an image in /public/imagens (ASCII names only — see the
// project notes on the optimizer 400ing on accented/space filenames).
const img = (file: string) => `${base}/imagens/${file}`;

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
    const iso = execFileSync("git", ["log", "-1", "--format=%aI", "--", sourceFile], {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
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
      sourceFile: "src/app/page.tsx",
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
      sourceFile: "src/app/servicos/page.tsx",
      changeFrequency: "monthly",
      priority: 0.9,
      images: [img("EW1_1408.jpg"), img("EW1_1330.jpg"), img("EW1_0697.jpg")],
    },
    {
      path: "/contacto",
      sourceFile: "src/app/contacto/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
    },
    // Conversion page — the quote request form.
    {
      path: "/orcamento",
      sourceFile: "src/app/orcamento/page.tsx",
      changeFrequency: "monthly",
      priority: 0.9,
    },
    {
      path: "/sobre",
      sourceFile: "src/app/sobre/page.tsx",
      changeFrequency: "monthly",
      priority: 0.8,
      images: [img("JOAO_E_PEDRO_1Y1A3204.jpg"), img("DaniGui_Preview12.jpg")],
    },
    {
      path: "/galeria",
      sourceFile: "src/app/galeria/page.tsx",
      changeFrequency: "weekly",
      priority: 0.7,
      images: [
        img("DaniGui_Preview20.jpg"),
        img("stephanie-mizio-715.jpg"),
        img("JOAO_E_PEDRO_1Y1A3204.jpg"),
      ],
    },
    {
      path: "/clientes",
      sourceFile: "src/app/clientes/page.tsx",
      changeFrequency: "monthly",
      priority: 0.7,
      images: [img("EW1_1393.jpg")],
    },
  ];

  const services: RawEntry[] = SERVICES.map((s) => ({
    path: `/servicos/${s.slug}`,
    // All service content (copy, hero, gallery, FAQs) lives in this single
    // shared data file — there's no per-slug source file to point at.
    sourceFile: "src/app/servicos/services-data.ts",
    changeFrequency: "monthly",
    priority: 0.85,
    images: [s.hero.startsWith("http") ? s.hero : `${base}${s.hero}`],
  }));

  // Each language version gets its own <url> entry (not just an hreflang
  // annotation on the PT one) — Google's documented pattern for sitemaps
  // with alternate-language pages — with both entries listing the full
  // reciprocal set, including themselves.
  return [...core, ...services].flatMap((entry): MetadataRoute.Sitemap => {
    const ptUrl = `${base}${entry.path}`;
    const enUrl = entry.path === "/" ? `${base}/en` : `${base}/en${entry.path}`;
    const lastModified = lastModifiedFor(entry.sourceFile);
    const alternates = { languages: { "pt-PT": ptUrl, en: enUrl } };
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
