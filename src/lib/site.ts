/**
 * Single source of truth for site-wide SEO/identity values.
 * Keeping this centralized ensures the canonical domain, names and
 * keywords stay consistent across metadata, sitemap, robots and JSON-LD.
 */
export const SITE = {
  name: "Líquen Events",
  legalName: "Líquen Events",
  url: "https://liquen-events.com",
  domain: "liquen-events.com",
  locale: "pt_PT",
  email: "liquen.alentejo@gmail.com",
  phone: "+351919259820",
  phoneDisplay: "+351 919 259 820",
  // Registered address. Used ONLY where an address of record is required — the
  // schema.org PostalAddress (a LocalBusiness node needs one) and the contract
  // letterhead. It is deliberately NOT used in marketing copy, metadata or
  // keywords: the studio works all over the country and must not read as a
  // local, single-region vendor. Service area is national — see AREAS_SERVED.
  city: "Évora",
  region: "Alentejo",
  country: "PT",
  slogan: "Decoramos eventos, eternizamos memórias.",
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

/** Areas served — the studio decorates events all over the country, so the
 *  country itself leads and the cities below are illustrative of that national
 *  reach rather than a home-region cluster. Deliberately NOT ordered around a
 *  single home city: the business is not positioned as a local vendor. */
export const AREAS_SERVED = [
  "Portugal",
  "Lisboa",
  "Porto",
  "Setúbal",
  "Cascais",
  "Sintra",
  "Comporta",
] as const;

/** Default keyword set. National only — no region-locked terms: the studio
 *  decorates events all over the country and must not be indexed as a
 *  single-region vendor. */
export const SITE_KEYWORDS = [
  "decoração de casamentos Portugal",
  "decoração de eventos Portugal",
  "coordenação de casamentos",
  "empresa de decoração de eventos",
  "decoração de eventos corporativos",
  "decoração de casamentos",
  "decoração de eventos de empresa",
  "empresa de eventos Portugal",
  "Líquen Events",
] as const;

/** schema.org `areaServed` array with each place correctly typed — Portugal is
 *  a Country, the rest Cities. Shared by the Organization node and per-Service
 *  JSON-LD so both declare the same nationwide service area. */
export function areaServedSchema(): { "@type": string; name: string }[] {
  const areaType = (name: string) => (name === "Portugal" ? "Country" : "City");
  return AREAS_SERVED.map((name) => ({ "@type": areaType(name), name }));
}

/** Absolute URL helper for canonical/OG links. */
export function abs(path = ""): string {
  return `${SITE.url}${path}`;
}
