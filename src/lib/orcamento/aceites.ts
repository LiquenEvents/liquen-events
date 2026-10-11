import type { Contract } from "@/lib/contract-types";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { ROTULO_DO_ESTADO } from "@/lib/orcamento/estado-do-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PROPOSTAS ACEITES SÃO TODAS AS QUE FORAM GANHAS — NÃO SÓ AS QUE TÊM CONTRATO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «nas propostas aceites isto não está bem porque já
 * houve mais propostas aceites e não estão aqui. E aqui devem estar todas as
 * propostas que nós marcamos como ganhas.»
 *
 * O ecrã listava só a tabela `contracts`, e um contrato só nascia por UM dos
 * caminhos do «Ganho» (o PATCH do pedido, e só quando havia proposta). O
 * «Aceitar» das Propostas, o Acompanhamento, os pedidos ganhos sem proposta e
 * os ganhos de antes desta regra ficavam fora — o negócio estava ganho em todo
 * o lado menos aqui.
 *
 * Agora a lista é a UNIÃO: cada contrato, e cada pedido ganho ou proposta
 * aceite que ainda não tem contrato. Estes últimos aparecem como o que são —
 * «sem contrato» — e não como um contrato fingido: um contrato regista os
 * termos congelados, e esses só se congelam quando alguém o cria.
 *
 * O que conta como ganho é a mesma regra do `dossier.ts` (`contratoAceite`):
 * o pedido em «Ganho» (`aceite`) ou a proposta aceite. Arquivados não entram,
 * como em todas as outras contagens de ganhos (`conversoes-fecho.ts`).
 */

export type AceiteSemContrato = {
  tipo: "sem-contrato";
  /** Chave estável da linha: a proposta, ou o pedido quando não há proposta. */
  id: string;
  quoteId: string;
  proposalId?: string;
  clientName: string;
  clientEmail: string;
  /** Quando foi marcado como ganho, se se souber. */
  ganhoEm?: string;
  /** Quem o marcou, pelo histórico do pedido. */
  marcadoPor?: string;
};

export type AceiteComContrato = Contract & { tipo: "contrato" };

export type ItemDosAceites = AceiteComContrato | AceiteSemContrato;

const GANHO = ROTULO_DO_ESTADO.aceite;

/** A última vez que o histórico do pedido diz que ele passou a «Ganho». */
function entradaDoGanho(q: Quote) {
  const log = q.activityLog ?? [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === "status_change" && new RegExp(`→\\s*${GANHO}\\b`).test(e.summary)) return e;
  }
  return undefined;
}

/** A proposta aceite mais recente de um pedido, ou a mais recente de todas. */
function propostaDoPedido(propostas: Proposal[]): Proposal | undefined {
  const ordenadas = [...propostas].sort((a, b) =>
    (b.respondedAt ?? b.sentAt ?? b.createdAt ?? "").localeCompare(
      a.respondedAt ?? a.sentAt ?? a.createdAt ?? "",
    ),
  );
  return ordenadas.find((p) => p.status === "aceite") ?? ordenadas[0];
}

export function juntarAceites(
  contratos: Contract[],
  pedidos: Quote[],
  propostas: Proposal[],
): ItemDosAceites[] {
  const itens: ItemDosAceites[] = contratos.map((c) => ({ ...c, tipo: "contrato" }));
  const comContrato = {
    propostas: new Set(contratos.map((c) => c.proposalId)),
    pedidos: new Set(contratos.map((c) => c.quoteId)),
  };
  const pedidoPorId = new Map(pedidos.map((q) => [q.id, q]));
  const propostasPorPedido = new Map<string, Proposal[]>();
  for (const p of propostas) {
    if (!p.quoteId) continue;
    const lista = propostasPorPedido.get(p.quoteId) ?? [];
    lista.push(p);
    propostasPorPedido.set(p.quoteId, lista);
  }

  // Os pedidos que contam: os que estão em «Ganho», e os que têm uma proposta
  // aceite. Um conjunto, para o mesmo casamento nunca aparecer duas vezes.
  const ganhos = new Set<string>();
  for (const q of pedidos) if (q.status === "aceite") ganhos.add(q.id);
  for (const p of propostas) if (p.status === "aceite" && p.quoteId) ganhos.add(p.quoteId);

  for (const quoteId of ganhos) {
    if (comContrato.pedidos.has(quoteId)) continue;
    const q = pedidoPorId.get(quoteId);
    if (q?.archived) continue;
    const proposta = propostaDoPedido(propostasPorPedido.get(quoteId) ?? []);
    if (proposta && comContrato.propostas.has(proposta.id)) continue;
    // Uma proposta aceite cujo pedido já não existe: nada a mostrar nem a abrir.
    if (!q && !proposta) continue;
    const entrada = q ? entradaDoGanho(q) : undefined;
    itens.push({
      tipo: "sem-contrato",
      id: proposta?.id ?? quoteId,
      quoteId,
      ...(proposta ? { proposalId: proposta.id } : {}),
      clientName: proposta?.clientName || q?.name || "—",
      clientEmail: proposta?.clientEmail || q?.email || "",
      ...((proposta?.status === "aceite" && proposta.respondedAt) || entrada?.at
        ? {
            ganhoEm:
              (proposta?.status === "aceite" ? proposta.respondedAt : undefined) ?? entrada?.at,
          }
        : {}),
      ...(entrada?.actor ? { marcadoPor: entrada.actor } : {}),
    });
  }

  // Mais recente primeiro: o contrato pela criação, o resto por quando ganhou.
  const quando = (i: ItemDosAceites) => (i.tipo === "contrato" ? i.createdAt : (i.ganhoEm ?? ""));
  return itens.sort((a, b) => quando(b).localeCompare(quando(a)));
}
