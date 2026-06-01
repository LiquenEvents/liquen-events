/**
 * Single source of truth for site-wide SEO/identity values.
 * Keeping this centralized ensures the canonical domain, names and
 * keywords stay consistent across metadata, sitemap, robots and JSON-LD.
 */
export const SITE = {
  name: "Líquen Events",
  legalName: "Líquen Events",
  url: "https://www.liquen-events.com",
  domain: "liquen-events.com",
  locale: "pt_PT",
  email: "liquen.alentejo@gmail.com",
  phone: "+351919259820",
  phoneDisplay: "+351 919 259 820",
  city: "Évora",
  region: "Alentejo",
  country: "PT",
  slogan: "Organizamos eventos, eternizamos memórias.",
  founded: "2018",
  instagram: "https://www.instagram.com/liquen.events",
  facebook: "https://www.facebook.com/liquen.events",
  ogImage: "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
} as const;

/** Cities/areas served — ordered by SEO priority (Évora/Alentejo first). */
export const AREAS_SERVED = [
  "Évora",
  "Alentejo",
  "Lisboa",
  "Portugal",
  "Estremoz",
  "Beja",
  "Setúbal",
  "Cascais",
  "Sintra",
  "Comporta",
] as const;

/** Default keyword set, location-weighted toward Évora/Alentejo. */
export const SITE_KEYWORDS = [
  "organização de eventos Évora",
  "empresa de eventos Évora",
  "wedding planner Évora",
  "wedding planner Alentejo",
  "casamentos Alentejo",
  "casamentos Évora",
  "organização de casamentos Portugal",
  "eventos corporativos Évora",
  "eventos corporativos Lisboa",
  "empresa de eventos Alentejo",
  "organização de eventos Lisboa",
  "organização de eventos Portugal",
  "planeamento de eventos",
  "decoração de eventos Alentejo",
  "eventos de empresa Évora",
  "Líquen Events",
] as const;

/** Absolute URL helper for canonical/OG links. */
export function abs(path = ""): string {
  return `${SITE.url}${path}`;
}
