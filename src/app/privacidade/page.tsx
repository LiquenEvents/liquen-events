import type { Metadata } from "next";
import LegalDocView from "../legal/LegalDocView";
import { getLegal } from "../legal/legal-content";
import { BreadcrumbJsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/page-metadata";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const { privacy } = getLegal(locale);
  return pageMetadata({
    title: privacy.title,
    description:
      locale === "en"
        ? "How Líquen Events collects, uses and protects your personal data, under the GDPR."
        : "Como a Líquen Events recolhe, usa e protege os seus dados pessoais, ao abrigo do RGPD.",
    path: "/privacidade",
    ogLocale: t.meta.ogLocale,
  });
}

export default async function PrivacidadePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const { privacy } = getLegal(locale);
  return (
    <>
      <BreadcrumbJsonLd
        homeName={t.nav.inicio}
        items={[{ name: privacy.title, path: "/privacidade" }]}
      />
      <LegalDocView doc={privacy} />
    </>
  );
}
