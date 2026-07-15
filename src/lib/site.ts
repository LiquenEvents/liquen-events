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
  // Physical base — a specific municipality (not just the region) sharpens the
  // LocalBusiness signal for "… em Évora" searches. Service area stays national
  // (see AREAS_SERVED + areaServed in StructuredData).
  city: "Évora",
  region: "Alentejo",
  country: "PT",
  slogan: "Organizamos eventos, eternizamos memórias.",
  founded: "2018",
  // Avaliação real do Google. Só a MÉDIA (rating) é mostrada visivelmente no
  // site (ver RatingBadge) — a CONTAGEM (count) NÃO é apresentada, para o site
  // nunca contradizer o número que aparece no Perfil de Empresa Google. NÃO é
  // emitida como aggregateRating no schema — o Google desaconselha marcação de
  // review auto-declarada em Organization/LocalBusiness (sem estrela rich
  // result e risco de ação manual); as estrelas em pesquisa vêm do Perfil de
  // Empresa Google. count fica aqui só como referência interna do nº real.
  reviews: { rating: 5, count: 56 },
  instagram: "https://www.instagram.com/liquen.events",
  facebook: "https://www.facebook.com/liquen.events",
  // Google Business Profile (share link) — powers local pack/Maps ranking and
  // lets Google reconcile the site with the profile (sameAs + hasMap).
  googleBusiness: "https://share.google/4Qcuop16TDkYaowsU",
  // Branded 1200×630 social-share card (public/og-liquen.jpg) — the white
  // wordmark on a darkened signature venue photo. Regenerate via
  // `node scripts/gen-og.mjs`. Not in image-dims.json, so page-metadata falls
  // back to the correct OG-standard 1200×630.
  ogImage: "/og-liquen.jpg",
} as const;

/** Cities/areas served — ordered by SEO priority (home city Évora first,
 *  then the region and the rest of the country). */
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

/** Default keyword set, location-weighted toward Alentejo. */
export const SITE_KEYWORDS = [
  "organização de eventos Évora",
  "casamentos Évora",
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

/** schema.org `areaServed` array with each place correctly typed — Portugal is
 *  a Country, the Alentejo an AdministrativeArea (region), the rest Cities.
 *  Shared by the Organization node and per-Service JSON-LD so both stay
 *  consistent and Évora-first. */
export function areaServedSchema(): { "@type": string; name: string }[] {
  const areaType = (name: string) =>
    name === "Portugal" ? "Country" : name === "Alentejo" ? "AdministrativeArea" : "City";
  return AREAS_SERVED.map((name) => ({ "@type": areaType(name), name }));
}

/** Absolute URL helper for canonical/OG links. */
export function abs(path = ""): string {
  return `${SITE.url}${path}`;
}
