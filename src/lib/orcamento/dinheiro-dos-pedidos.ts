/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DINHEIRO DOS PEDIDOS — UMA CONTA SÓ, PARA TODOS OS ECRÃS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (14/10), com duas capturas lado a lado: «num sítio diz uma coisa
 * noutro diz outra». A Visão Geral dizia Ganho 28 265 € e À espera 41 447 €; as
 * Propostas diziam Valor já ganho 20 824 € e Valor enviado 66 773 €.
 *
 * Eram duas contas diferentes, e as duas tinham uma razão:
 *   · a Visão Geral (e as Estatísticas, o Kanban e os Clientes) somava os
 *     PEDIDOS pelo estado que ela lhes deu, ao `quotedPrice` vezes a taxa da
 *     estimativa;
 *   · as Propostas somavam as PROPOSTAS pelo estado delas, ao `total` da mais
 *     recente por criação — e o «enviado» juntava as aceites, portanto já
 *     trazia o que fora ganho.
 * Marcar «Ganho» no pedido nem sempre passa a proposta a aceite, e o valor
 * confirmado ao marcar Ganho só muda o `quotedPrice` — por isso as duas contas
 * afastavam-se a cada negócio fechado.
 *
 * A escolha dela: **manda o estado que se dá ao pedido.** Esta é a conta, e
 * todos os ecrãs que mostram «Ganho» ou «À espera» passam a sair daqui.
 *
 * ── O VALOR DE UM PEDIDO ───────────────────────────────────────────────────
 *   · o líquido é o `quotedPrice` — o «Preço final (sem IVA)», que o envio da
 *     proposta acerta e que o valor confirmado ao marcar Ganho substitui;
 *   · a taxa de IVA é a da última proposta ENVIADA desse pedido (total sobre
 *     subtotal: é a taxa que o cliente viu), e só sem proposta a da estimativa
 *     (`effectiveVatRate`);
 *   · sem `quotedPrice`, vale o total da última proposta enviada — um pedido
 *     com proposta seguida não vale zero só porque o campo ficou por escrever.
 *
 * Puro e sem `server-only`: corre no browser, nos ecrãs.
 */

import type { Proposal, Quote } from "./types";
import { effectiveVatRate } from "./dossier";
import { round2 } from "@/lib/money";

/** O que estas contas lêem de uma proposta — a forma leve (`?semDoc=1`) chega. */
export type PropostaParaContas = Pick<
  Proposal,
  "quoteId" | "status" | "total" | "subtotal" | "vatRate" | "createdAt" | "sentAt"
>;

export interface ValorDoPedido {
  /** Sem IVA. */
  liquido: number;
  /** Com IVA — o que o cliente paga, e o que os ecrãs mostram. */
  comIva: number;
}

/** As propostas por pedido, para não varrer a lista inteira por cada pedido. */
export function propostasPorPedido(
  propostas: readonly PropostaParaContas[] | undefined,
): Map<string, PropostaParaContas[]> {
  const m = new Map<string, PropostaParaContas[]>();
  for (const p of propostas ?? []) {
    if (!p.quoteId) continue;
    const l = m.get(p.quoteId);
    if (l) l.push(p);
    else m.set(p.quoteId, [p]);
  }
  return m;
}

/**
 * A última proposta que SEGUIU, pela data do envio — e não pela de criação: uma
 * versão criada e nunca enviada não é o que o cliente tem na mão.
 */
export function ultimaEnviada(
  propostas: readonly PropostaParaContas[] | undefined,
): PropostaParaContas | undefined {
  let melhor: PropostaParaContas | undefined;
  let quando = -Infinity;
  for (const p of propostas ?? []) {
    if (p.status === "rascunho") continue;
    const t = Date.parse(p.sentAt ?? p.createdAt);
    const tt = Number.isNaN(t) ? -Infinity : t;
    if (!melhor || tt >= quando) {
      melhor = p;
      quando = tt;
    }
  }
  return melhor;
}

/** A taxa que a proposta aplicou — a que o cliente viu escrita. */
function taxaDaProposta(p: PropostaParaContas): number | undefined {
  if (p.subtotal > 0 && p.total > 0) return p.total / p.subtotal - 1;
  if (typeof p.vatRate === "number" && p.vatRate >= 0 && p.total > 0) return p.vatRate;
  return undefined;
}

/**
 * O valor de UM pedido, com e sem IVA. `propostas` são as DESTE pedido (ou
 * nenhuma); sem elas, a conta é a de sempre — `quotedPrice` à taxa da
 * estimativa.
 */
export function valorDoPedido(
  q: Pick<Quote, "quotedPrice" | "priceBreakdown">,
  propostas?: readonly PropostaParaContas[],
): ValorDoPedido {
  const enviada = ultimaEnviada(propostas);
  const taxaEnviada = enviada ? taxaDaProposta(enviada) : undefined;
  if (typeof q.quotedPrice === "number" && Number.isFinite(q.quotedPrice)) {
    const liquido = round2(q.quotedPrice);
    const taxa = taxaEnviada ?? effectiveVatRate(q as Quote);
    return { liquido, comIva: round2(liquido * (1 + taxa)) };
  }
  if (enviada && enviada.total > 0) {
    const comIva = round2(enviada.total);
    const liquido =
      enviada.subtotal > 0 ? round2(enviada.subtotal) : round2(comIva / (1 + (taxaEnviada ?? 0)));
    return { liquido, comIva };
  }
  return { liquido: 0, comIva: 0 };
}

export interface ContasDosPedidos {
  /** Pedidos em «Ganho» (`aceite`). */
  ganho: { valor: number; n: number; comValor: number };
  /** Pedidos em «Proposta enviada» (`cotado`) — à espera de resposta. */
  aEspera: { valor: number; n: number };
  /** Pedidos em «Perdido» (`rejeitado`). */
  perdidos: number;
  /**
   * Ganhos sobre tudo o que teve resposta ou a espera (ganhos + à espera +
   * perdidos), em percentagem inteira. 0 quando não há nenhum.
   */
  taxaDeFecho: number;
}

/**
 * As contas que os ecrãs mostram, sobre os pedidos NÃO arquivados. Um pedido
 * arquivado saiu da lista dela — contá-lo no Ganho de um ecrã e não noutro foi
 * metade do desencontro.
 */
export function contasDosPedidos(
  quotes: readonly Quote[],
  propostas?: readonly PropostaParaContas[],
): ContasDosPedidos {
  const porPedido = propostasPorPedido(propostas);
  const contas: ContasDosPedidos = {
    ganho: { valor: 0, n: 0, comValor: 0 },
    aEspera: { valor: 0, n: 0 },
    perdidos: 0,
    taxaDeFecho: 0,
  };
  for (const q of quotes) {
    if (q.archived) continue;
    if (q.status === "aceite") {
      const v = valorDoPedido(q, porPedido.get(q.id)).comIva;
      contas.ganho.valor += v;
      contas.ganho.n++;
      if (v > 0) contas.ganho.comValor++;
    } else if (q.status === "cotado") {
      contas.aEspera.valor += valorDoPedido(q, porPedido.get(q.id)).comIva;
      contas.aEspera.n++;
    } else if (q.status === "rejeitado") {
      contas.perdidos++;
    }
  }
  contas.ganho.valor = round2(contas.ganho.valor);
  contas.aEspera.valor = round2(contas.aEspera.valor);
  const base = contas.ganho.n + contas.aEspera.n + contas.perdidos;
  contas.taxaDeFecho = base > 0 ? Math.round((contas.ganho.n / base) * 100) : 0;
  return contas;
}
