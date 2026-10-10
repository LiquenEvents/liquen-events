import type { Proposal } from "@/lib/orcamento/types";
import { createContractIfAbsent, newContractId } from "@/lib/contracts-store";
import { idiomaDaProposta } from "@/lib/proposta-idioma";
import { TERMS_VERSION, termosPara, termsToPlainText } from "@/lib/contract-terms";
import { depositPercentOf, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO NASCE QUANDO A EQUIPA MARCA «GANHO» — POR ASSINAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Vivia dentro do PATCH do pedido (`api/orcamento/[id]`), e por isso só esse
 * caminho do «Ganho» criava contrato. O «Aceitar» das Propostas e o
 * Acompanhamento passam pelo PATCH da PROPOSTA, e o pedido ficava ganho sem
 * contrato — e fora das Propostas Aceites. Ela deu por isso: «já houve mais
 * propostas aceites e não estão aqui».
 *
 * Agora é uma função só, chamada pelos três: o PATCH do pedido, o PATCH da
 * proposta, e o botão «Criar contrato» das Propostas Aceites.
 *
 * `createContractIfAbsent` é o LOCK: marcar «Ganho» duas vezes, ou aceitar e
 * depois mover o pedido, não nasce dois contratos — a segunda chamada encontra
 * o primeiro pela `proposalId` e não faz nada.
 *
 * ── O QUE ESTE CONTRATO NÃO FINGE ─────────────────────────────────────────
 * Quem marca é a EQUIPA, a partir de um email, um telefonema ou um WhatsApp.
 * Não há aqui nem nome escrito, nem IP, nem o momento em que o casal disse que
 * sim. Por isso o contrato nasce `pendente` — por assinar — e SEM
 * `acceptedAt`/`acceptedName`/`acceptedIp`: inventá-los seria fingir um aceite
 * que este sistema não presenciou.
 *
 * Os termos vão CONGELADOS na versão actual, sobre a percentagem de sinal DESTA
 * proposta e na língua que ela levou. O selo do PDF e a versão só vão quando a
 * proposta os tem: um selo inventado a posteriori não provaria nada.
 */
export function nascerContratoDoGanho(quoteId: string, proposta: Proposal) {
  const idioma = idiomaDaProposta(proposta);
  return createContractIfAbsent({
    id: newContractId(),
    quoteId,
    proposalId: proposta.id,
    clientName: proposta.clientName,
    clientEmail: proposta.clientEmail,
    termsVersion: TERMS_VERSION,
    idioma,
    termsSnapshot: termsToPlainText(
      termosPara(depositPercentOf(proposta.doc as ProposalDoc | undefined), idioma),
    ),
    status: "pendente",
    createdAt: new Date().toISOString(),
    ...(proposta.pdfSha256 !== undefined ? { propostaPdfSha256: proposta.pdfSha256 } : {}),
    ...(proposta.pdfBytes !== undefined ? { propostaPdfBytes: proposta.pdfBytes } : {}),
    ...(proposta.versaoSelo !== undefined ? { propostaVersaoSelo: proposta.versaoSelo } : {}),
    ...(proposta.versaoNumero !== undefined ? { propostaVersaoNumero: proposta.versaoNumero } : {}),
  });
}
