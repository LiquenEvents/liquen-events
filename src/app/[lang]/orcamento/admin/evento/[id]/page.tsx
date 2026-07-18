import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, readSession } from "@/lib/admin-auth";
import { normalizeLocale } from "@/lib/i18n";
import { getQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { getContractByProposal } from "@/lib/contracts-store";
import { listInvoicesForQuote } from "@/lib/invoices-store";
import { createPortalToken } from "@/lib/portal-token";
import type { DossierData } from "@/lib/orcamento/dossier";
import DossierClient from "./DossierClient";

/**
 * Dossier do Evento — cockpit de página inteira para UM evento. Este é o único
 * componente SERVIDOR da rota: agrega tudo (pedido, proposta, contrato, faturas)
 * a partir dos stores server-only e entrega ao cliente APENAS dados
 * serializáveis, exactamente como `portal/[token]/page.tsx`. Nenhum store
 * atravessa a fronteira — o `DossierClient` e os seus filhos só veem props.
 *
 * Atrás de autenticação, por isso indexar não é preocupação; ainda assim fica
 * `noindex` por segurança, tal como as outras superfícies de administração.
 */
export const metadata: Metadata = {
  title: "Dossier do Evento — Líquen Events",
  robots: { index: false, follow: false },
};

export default async function EventoDossierPage({
  params,
}: {
  params: Promise<{ lang: string; id: string }>;
}) {
  const { lang, id } = await params;
  const locale = normalizeLocale(lang);

  // Mesma barreira que a página de administração: sem sessão válida → login.
  // A página admin renderiza <AdminLogin/> na raiz; aqui reencaminhamos para
  // essa raiz (onde o login vive) para não duplicar o formulário.
  const store = await cookies();
  const session = readSession(store.get(ADMIN_COOKIE)?.value);
  if (!session) redirect(`/${lang}/orcamento/admin`);

  const quote = await getQuote(id);
  if (!quote) notFound();

  // A proposta tem de vir primeiro — a procura do contrato indexa por ela.
  // As faturas são independentes, por isso vão em paralelo com o contrato.
  const proposal = await getProposalByQuote(quote.id);
  const [contract, invoices] = await Promise.all([
    proposal ? getContractByProposal(proposal.id) : Promise.resolve(null),
    listInvoicesForQuote(quote.id),
  ]);

  // Link privado do portal do cliente — cunhado aqui (servidor) e passado como
  // string; o cliente nunca importa `portal-token` (server-only).
  const portalUrl = `/${locale}/portal/${createPortalToken(quote.id)}`;

  // Fronteira serializável: reduzimos contrato e faturas aos campos que o
  // Dossier mostra (sem instâncias, sem funções).
  const data: DossierData = {
    quote,
    proposal: proposal ?? null,
    contract: contract
      ? {
          status: contract.status,
          acceptedAt: contract.acceptedAt,
          acceptedName: contract.acceptedName,
          termsVersion: contract.termsVersion,
        }
      : null,
    invoices: invoices.map((i) => ({
      id: i.id,
      number: i.number,
      kind: i.kind,
      amount: i.amount,
      status: i.status,
      issuedAt: i.issuedAt,
      dueAt: i.dueAt,
      paidAt: i.paidAt,
    })),
  };

  return (
    <DossierClient
      data={data}
      portalUrl={portalUrl}
      lang={locale}
      userName={session.name || "Equipa"}
    />
  );
}
