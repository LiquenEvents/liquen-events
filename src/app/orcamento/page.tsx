import type { Metadata } from "next";
import OrcamentoForm from "./OrcamentoForm";
import { pageMetadata } from "@/lib/page-metadata";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return pageMetadata({
    title: t.meta.orcamentoTitle,
    description: t.meta.orcamentoDescription,
    path: "/orcamento",
    ogLocale: t.meta.ogLocale,
  });
}

export default function OrcamentoPage() {
  return <OrcamentoForm />;
}
