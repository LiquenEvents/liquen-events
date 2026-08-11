import type { Metadata } from "next";
import { cookies } from "next/headers";
import type { QuoteSummary } from "@/lib/orcamento/types";
import AdminClient from "./AdminClient";
import AdminLogin from "./AdminLogin";
import { ToastProvider } from "./Toast";
import { ADMIN_COOKIE, ADMIN_NAME_COOKIE, readSession } from "@/lib/admin-auth";
import { listQuoteSummaries } from "@/lib/quotes-store";

// Kept out of robots.txt (crawling) *and* given noindex here (indexing) —
// disallow alone only stops crawling; a stray external link could still get
// the bare URL indexed with no way for Google to see this tag.
export const metadata: Metadata = {
  title: "Admin — Líquen Events",
  robots: { index: false, follow: false },
};

/**
 * A lista vai em RESUMO. O pedido inteiro é grande (150 convidados, checklist,
 * plano de produção, cronograma) e tudo isso era serializado para dentro deste
 * HTML, 300 vezes, antes de haver um pixel desenhado. O que a lista, os
 * filtros e os painéis de conjunto lêem continua cá todo; o resto vai buscar-se
 * quando um pedido é ABERTO. Ver `resumirQuote` em quotes-store.
 */
async function getQuotes(): Promise<QuoteSummary[]> {
  try {
    return await listQuoteSummaries();
  } catch {
    return [];
  }
}

export default async function AdminPage() {
  const store = await cookies();
  const session = readSession(store.get(ADMIN_COOKIE)?.value);

  if (!session) {
    return <AdminLogin />;
  }

  const quotes = await getQuotes();
  // Trust the signed session name first; fall back to the display cookie.
  const userName =
    session.name || store.get(ADMIN_NAME_COOKIE)?.value || process.env.ADMIN_NAME || "Equipa";
  return (
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName={userName} />
    </ToastProvider>
  );
}
