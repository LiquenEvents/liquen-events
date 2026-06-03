import type { Metadata } from "next";
import OrcamentoForm from "./OrcamentoForm";
import { getLocale } from "@/lib/i18n/server";
import { getDictionary } from "@/lib/i18n";

export async function generateMetadata(): Promise<Metadata> {
  const t = getDictionary(await getLocale());
  return {
    title: t.meta.orcamentoTitle,
    description: t.meta.orcamentoDescription,
  };
}

export default function OrcamentoPage() {
  return <OrcamentoForm />;
}
