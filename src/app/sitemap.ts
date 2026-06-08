import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { SERVICES } from "./servicos/services-data";

const base = SITE.url;

// Absolute URL for an image in /public/imagens (ASCII names only — see the
// project notes on the optimizer 400ing on accented/space filenames).
const img = (file: string) => `${base}/imagens/${file}`;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
      images: [
        img("JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg"),
        img("DaniGui_Adois_61.jpg"),
        img("JOAO_E_PEDRO_1Y1A3450.jpg"),
      ],
    },
    {
      url: `${base}/servicos`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
      images: [img("EW1_1408.jpg"), img("EW1_1330.jpg"), img("EW1_0697.jpg")],
    },
    { url: `${base}/contacto`, lastModified: now, changeFrequency: "monthly", priority: 0.8 },
    {
      url: `${base}/sobre`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      images: [img("JOAO_E_PEDRO_1Y1A3204.jpg"), img("DaniGui_Preview12.jpg")],
    },
    {
      url: `${base}/galeria`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      images: [
        img("DaniGui_Preview20.jpg"),
        img("stephanie-mizio-715.jpg"),
        img("JOAO_E_PEDRO_1Y1A3204.jpg"),
      ],
    },
    {
      url: `${base}/clientes`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      images: [img("EW1_1393.jpg")],
    },
  ];

  const services: MetadataRoute.Sitemap = SERVICES.map((s) => ({
    url: `${base}/servicos/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly",
    priority: 0.85,
    images: [s.hero.startsWith("http") ? s.hero : `${base}${s.hero}`],
  }));

  // Declare the reciprocal PT/EN hreflang pair for every URL so search engines
  // discover and index the English mirror (/en/*).
  return [...core, ...services].map((entry) => {
    const path = entry.url.replace(base, "") || "/";
    const en = path === "/" ? `${base}/en` : `${base}/en${path}`;
    return { ...entry, alternates: { languages: { "pt-PT": entry.url, en } } };
  });
}
