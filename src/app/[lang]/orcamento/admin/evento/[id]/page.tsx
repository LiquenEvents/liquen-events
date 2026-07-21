import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { ADMIN_COOKIE, readSession } from "@/lib/admin-auth";
import { normalizeLocale } from "@/lib/i18n";
import { getQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { getContractByProposal, getAcceptedContractByQuote } from "@/lib/contracts-store";
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

  // O contrato procura-se PELO PEDIDO (getAcceptedContractByQuote), não pela
  // proposta mais recente: se a equipa enviar uma nova proposta DEPOIS do aceite,
  // essa proposta não tem contrato e um lookup por ela perderia o cartão de
  // contrato e faria a fase regredir de `em_producao` para `sinal_pago`. Mantemos
  // o lookup por proposta como recurso (contratos antigos indexados só por ela).
  // As faturas são independentes, por isso vão em paralelo.
  const proposal = await getProposalByQuote(quote.id);
  const [contractByQuote, contractByProposal, invoices] = await Promise.all([
    getAcceptedContractByQuote(quote.id),
    proposal ? getContractByProposal(proposal.id) : Promise.resolve(null),
    listInvoicesForQuote(quote.id),
  ]);
  const contract = contractByQuote ?? contractByProposal;

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
