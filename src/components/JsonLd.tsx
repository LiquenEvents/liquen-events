import { SITE } from "@/lib/site";
import { jsonLd } from "@/lib/jsonld";

/** Renders an arbitrary JSON-LD object as a script tag. */
export function JsonLd({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd(data) }}
    />
  );
}

/** Breadcrumb trail structured data. Pass [{name, path}] from home onward. */
export function BreadcrumbJsonLd({ items }: { items: { name: string; path: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { name: "Início", path: "/" },
      ...items,
    ].map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: `${SITE.url}${item.path === "/" ? "" : item.path}`,
    })),
  };
  return <JsonLd data={data} />;
}

/** FAQ structured data — can surface as expandable Q&A in Google. */
export function FaqJsonLd({ faqs }: { faqs: { q: string; a: string }[] }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
  return <JsonLd data={data} />;
}

/** A single Service offered, tied to the organization and its service area. */
export function ServiceJsonLd({
  name,
  description,
  path,
}: {
  name: string;
  description: string;
  path: string;
}) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Service",
    name,
    description,
    serviceType: name,
    url: `${SITE.url}${path}`,
    provider: { "@id": `${SITE.url}/#organization` },
    areaServed: ["Évora", "Lisboa", "Alentejo", "Portugal"].map((n) => ({
      "@type": "City",
      name: n,
    })),
  };
  return <JsonLd data={data} />;
}
