import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";
import { SERVICES } from "./servicos/services-data";

const base = SITE.url;

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();

  const core: MetadataRoute.Sitemap = [
    {
      url: base,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 1.0,
      images: [
        `${base}/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg`,
        `${base}/imagens/DaniGui_Preview20.jpg`,
        `${base}/imagens/EW1_1408.jpg`,
      ],
    },
    {
      url: `${base}/servicos`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
      images: [
        `${base}/imagens/EW1_1408.jpg`,
        `${base}/imagens/DaniGui_Preview18.jpg`,
        `${base}/imagens/DaniGui_JantarFesta_27.jpg`,
      ],
    },
    {
      url: `${base}/contacto`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      images: [`${base}/imagens/Natalia e Jonathan-315.jpg`],
    },
    {
      url: `${base}/sobre`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.8,
      images: [
        `${base}/imagens/JOAO_E_PEDRO_1Y1A3204.jpg`,
        `${base}/imagens/DaniGui_Preview12.jpg`,
        `${base}/imagens/M&F0497.jpg`,
      ],
    },
    {
      url: `${base}/galeria`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      images: [
        `${base}/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg`,
        `${base}/imagens/DaniGui_Preview20.jpg`,
        `${base}/imagens/EW1_1408.jpg`,
        `${base}/imagens/Natalia e Jonathan-167.jpg`,
        `${base}/imagens/M&F0497.jpg`,
      ],
    },
    {
      url: `${base}/clientes`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.7,
      images: [`${base}/imagens/EW1_1393.jpg`, `${base}/imagens/EW1_1408.jpg`],
    },
  ];

  const services: MetadataRoute.Sitemap = SERVICES.map((s) => ({
    url: `${base}/servicos/${s.slug}`,
    lastModified: now,
    changeFrequency: "monthly" as const,
    priority: 0.85,
    images: [`${base}${s.hero}`, ...s.gallery.slice(0, 3).map((img) => `${base}${img}`)],
  }));

  return [...core, ...services];
}
