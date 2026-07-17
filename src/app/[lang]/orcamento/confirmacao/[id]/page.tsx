import type { Metadata } from "next";
import ConfirmacaoClient from "./ConfirmacaoClient";
import { getDictionary, normalizeLocale } from "@/lib/i18n";

// Per-quote page (carries a reference + the client's event details) — keep it
// out of search indexes.
export const metadata: Metadata = {
  title: "Pedido Recebido",
  robots: { index: false, follow: false },
};

export default async function ConfirmacaoPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const t = getDictionary(normalizeLocale(lang));
  // The confirmacao namespace is passed as a prop (not via the site-wide chrome
  // context) so it only ships on this route.
  return <ConfirmacaoClient id={id} confirmacao={t.confirmacao} />;
}
