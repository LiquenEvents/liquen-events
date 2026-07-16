import { SITE, areaServedSchema, abs } from "@/lib/site";
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
 * "wedding coordinator Alentejo", "coordenação de casamentos", etc., and earn rich results.
 *
 * Locale-aware: the /en mirror shows English copy, so the description/service
 * names are emitted in the active language too. Note we deliberately do NOT
 * emit self-serving aggregateRating/review on the Organization node (Google
 * disallows it for these types) — see the note by hasOfferCatalog.
 */
export default function StructuredData({ locale }: { locale: Locale }) {
  const t = getDictionary(locale);
  const orgId = `${SITE.url}/#organization`;
  const siteId = `${SITE.url}/#website`;

  const graph = [
    {
      // EventPlanner is the schema.org LocalBusiness subtype that matches the
      // business exactly — more specific than the generic ProfessionalService.
      "@type": ["Organization", "LocalBusiness", "EventPlanner"],
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
      founder: { "@type": "Person", name: "Catarina Gaspar", jobTitle: "Founder & CEO" },
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
      hasMap: SITE.googleBusiness,
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
          opens: "09:00",
          closes: "20:00",
        },
      ],
      areaServed: areaServedSchema(),
      knowsLanguage: ["pt-PT", "en"],
      sameAs: [SITE.instagram, SITE.facebook, SITE.googleBusiness],
      contactPoint: {
        "@type": "ContactPoint",
        telephone: SITE.phone,
        email: SITE.email,
        contactType: "customer service",
        areaServed: "PT",
        availableLanguage: ["Portuguese", "English"],
      },
      // NB: no aggregateRating / review here. Google disallows *self-serving*
      // review markup on Organization/LocalBusiness (and subtypes like
      // ProfessionalService) — it earns no star rich result and risks a
      // "spammy structured markup" manual action. The real 5.0/56 Google rating
      // still shows VISIBLY on the site via <RatingBadge>; the trustworthy way
      // to surface stars in search is the third-party Google Business profile,
      // not self-declared JSON-LD.
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

  // suppressHydrationWarning: the JSON is deterministic (same on server and
  // client), but React 19's handling of inline <script> during hydration of
  // statically-prerendered pages can otherwise flag a spurious mismatch on the
  // dangerouslySetInnerHTML payload.
  return (
    <script
      type="application/ld+json"
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}
