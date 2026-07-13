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
  city: "Alentejo",
  region: "Alentejo",
  country: "PT",
  slogan: "Organizamos eventos, eternizamos memórias.",
  founded: "2018",
  // Avaliação agregada real (Google). Mostrada visivelmente no site (ver
  // RatingBadge) e espelhada no aggregateRating do schema — a marcação nunca
  // afirma mais do que é exibido. Atualizar aqui quando o nº/média mudarem.
  reviews: { rating: 5, count: 56 },
  instagram: "https://www.instagram.com/liquen.events",
  facebook: "https://www.facebook.com/liquen.events",
  ogImage: "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
} as const;

/** Cities/areas served — ordered by SEO priority (Alentejo first). */
export const AREAS_SERVED = [
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

/** Default keyword set, location-weighted toward Alentejo. */
export const SITE_KEYWORDS = [
  "wedding planner Alentejo",
  "casamentos Alentejo",
  "organização de casamentos Portugal",
  "eventos corporativos Lisboa",
  "empresa de eventos Alentejo",
  "organização de eventos Lisboa",
  "organização de eventos Portugal",
  "planeamento de eventos",
  "decoração de eventos Alentejo",
  "Líquen Events",
] as const;

/** Absolute URL helper for canonical/OG links. */
export function abs(path = ""): string {
  return `${SITE.url}${path}`;
}
