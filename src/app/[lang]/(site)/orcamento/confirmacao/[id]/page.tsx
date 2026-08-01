import type { Metadata } from "next";
import ConfirmacaoClient from "./ConfirmacaoClient";
import { CONFIRMACAO_PHOTOS, type ConfirmacaoPhotoKey } from "./photos";
import { getDictionary, normalizeLocale } from "@/lib/i18n";
import { blurFor } from "@/lib/blur";

// Per-quote page (carries a reference + the client's event details) — keep it
// out of search indexes. Title is localized so an EN visitor on <html lang="en">
// doesn't get a Portuguese document title announced.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const locale = normalizeLocale((await params).lang);
  return {
    title: locale === "en" ? "Request Received" : "Pedido Recebido",
    robots: { index: false, follow: false },
  };
}

export default async function ConfirmacaoPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const t = getDictionary(normalizeLocale(lang));
  // The confirmacao namespace is passed as a prop (not via the site-wide chrome
  // context) so it only ships on this route. eventTypeLabels comes along so the
  // echoed event type is shown in the visitor's language rather than the
  // Portuguese label baked into the pricing taxonomy.
  // Blur placeholders are resolved here: blurFor() pulls in the whole blur map,
  // which has no business shipping to the browser for four known images.
  const blur = Object.fromEntries(
    Object.entries(CONFIRMACAO_PHOTOS).map(([key, src]) => [key, blurFor(src).blurDataURL]),
  ) as Record<ConfirmacaoPhotoKey, string>;

  return (
    <ConfirmacaoClient
      id={id}
      confirmacao={t.confirmacao}
      eventTypeLabels={t.orcamento.eventTypeLabels}
      blur={blur}
    />
  );
}
