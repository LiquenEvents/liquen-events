import { SITE, AREAS_SERVED, abs } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";
import { getDictionary, htmlLang, type Locale } from "@/lib/i18n";

/**
 * Rich schema.org structured data (JSON-LD).
 *
 * Emits an @graph with:
 *  - Organization / LocalBusiness (EventPlanning) with geo + areas served
 *  - WebSite (enables sitelinks search box potential)
 *  - Service catalog (weddings, corporate, social) for service-intent queries
 *
 * This is what helps the site surface for "empresa de eventos Alentejo",
 * "wedding planner Alentejo", etc., and earn rich results.
 *
 * Locale-aware: the /en mirror shows English testimonials/copy, so the
 * markup must describe that same content in English too — otherwise the
 * `review` entries here wouldn't match what's actually rendered on the page,
 * which risks losing rich-result eligibility (Google requires structured
 * data to reflect real, visible page content).
 */
export default function StructuredData({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
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
      description: t.meta.homeDescription,
      slogan: SITE.slogan,
      foundingDate: SITE.founded,
      priceRange: "€€€",
      address: {
        "@type": "PostalAddress",
        addressLocality: SITE.city,
        addressRegion: SITE.region,
        addressCountry: SITE.country,
      },
      // Approximate geo (Alentejo) — helps local-pack / map relevance.
      geo: {
        "@type": "GeoCoordinates",
        latitude: 38.5714,
        longitude: -7.9135,
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "09:00",
          closes: "18:00",
        },
      ],
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
      // NB: no `aggregateRating` here. Google only honours review snippets that
      // are backed by genuine, visible reviews on the page; a self-serving
      // rating on an Organization/LocalBusiness is ignored and risks a manual
      // action. Add it back via real `Review` items (e.g. Google Business
      // Profile) when those are available.
      // These reviews mirror the testimonials VISIBLE on the site (home,
      // /clientes, /contacto) — same source (the active locale's dictionary)
      // so the markup always matches what's actually rendered. No
      // reviewRating: the site shows quotes, not star scores, and markup must
      // never claim more than the page displays.
      review: t.testimonials.map((item) => ({
        "@type": "Review",
        author: { "@type": "Person", name: item.name },
        name: item.role,
        reviewBody: item.quote,
        itemReviewed: { "@id": orgId },
      })),
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: t.jsonld.hasOfferCatalogName,
        itemListElement: t.jsonld.services.map((service) => ({
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
      inLanguage: htmlLang(locale),
      publisher: { "@id": orgId },
    },
  ];

  const data = { "@context": "https://schema.org", "@graph": graph };

  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
