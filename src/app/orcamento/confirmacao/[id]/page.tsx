import type { Metadata } from "next";
import ConfirmacaoClient from "./ConfirmacaoClient";

// Per-quote page (carries a reference + the client's event details) — keep it
// out of search indexes.
export const metadata: Metadata = {
  title: "Pedido Recebido",
  robots: { index: false, follow: false },
};

export default async function ConfirmacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ConfirmacaoClient id={id} />;
}
