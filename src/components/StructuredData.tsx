import { SITE, AREAS_SERVED, abs } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";

/**
 * Rich schema.org structured data (JSON-LD).
 *
 * Emits an @graph with:
 *  - Organization / LocalBusiness (EventPlanning) with geo + areas served
 *  - WebSite (enables sitelinks search box potential)
 *  - Service catalog (weddings, corporate, social) for service-intent queries
 *  - AggregateRating from real client testimonials
 *
 * This is what helps the site surface for "empresa de eventos Évora",
 * "wedding planner Alentejo", etc., and earn rich results.
 */
export default function StructuredData() {
  const orgId = `${SITE.url}/#organization`;
  const siteId = `${SITE.url}/#website`;

  const graph = [
    {
      "@type": ["Organization", "LocalBusiness", "ProfessionalService"],
      "@id": orgId,
      name: SITE.name,
      legalName: SITE.legalName,
      url: SITE.url,
      email: SITE.email,
      telephone: SITE.phone,
      image: abs(SITE.ogImage),
      logo: abs("/logo-liquen.png"),
      description:
        "Empresa de organização de eventos com sede em Évora. Casamentos, eventos corporativos e celebrações em todo o Alentejo, Lisboa e Portugal.",
      slogan: SITE.slogan,
      foundingDate: SITE.founded,
      priceRange: "€€€",
      address: {
        "@type": "PostalAddress",
        addressLocality: SITE.city,
        addressRegion: SITE.region,
        addressCountry: SITE.country,
      },
      areaServed: AREAS_SERVED.map((name) => ({ "@type": "City", name })),
      knowsLanguage: ["pt-PT", "en"],
      sameAs: [SITE.instagram, SITE.facebook],
      contactPoint: {
        "@type": "ContactPoint",
        telephone: SITE.phone,
        email: SITE.email,
        contactType: "customer service",
        areaServed: "PT",
        availableLanguage: ["Portuguese", "English"],
      },
      aggregateRating: {
        "@type": "AggregateRating",
        ratingValue: "5",
        reviewCount: "16",
        bestRating: "5",
      },
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Serviços de organização de eventos",
        itemListElement: [
          "Organização de casamentos",
          "Eventos corporativos e conferências",
          "Festas e celebrações privadas",
          "Eventos culturais e institucionais",
        ].map((service) => ({
          "@type": "Offer",
          itemOffered: { "@type": "Service", name: service, areaServed: "PT" },
        })),
      },
    },
    {
      "@type": "WebSite",
      "@id": siteId,
      url: SITE.url,
      name: SITE.name,
      inLanguage: "pt-PT",
      publisher: { "@id": orgId },
    },
  ];

  const data = { "@context": "https://schema.org", "@graph": graph };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
