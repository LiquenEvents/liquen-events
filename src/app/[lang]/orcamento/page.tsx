import type { Metadata } from "next";
import OrcamentoForm from "./OrcamentoForm";
import { pageMetadata } from "@/lib/page-metadata";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  const t = getDictionary(locale);
  return pageMetadata({
    locale,
    title: t.meta.orcamentoTitle,
    description: t.meta.orcamentoDescription,
    path: "/orcamento",
    image: "/imagens/EW1_1404.jpg",
    ogLocale: t.meta.ogLocale,
  });
}

export default function OrcamentoPage() {
  return <OrcamentoForm />;
}
