import type { ProposalDoc } from "./proposal-doc";
import { detectVatMode, DEFAULT_VAT_RATE, type VatMode } from "./proposal-doc";
import { somaDosExtrasSemIva } from "./proposal-budget";
import { round2 } from "./money";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO DINHEIRO, EM DOIS SÍTIOS QUE CONTAM COISAS DIFERENTES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O PEDIDO guarda, no «Preço final (sem IVA)», o que o casal paga: os serviços
 * MAIS os adicionais (a deslocação da equipa, tipicamente). O campo do ESTÚDIO
 * chama-se «Valor (sem IVA)» e significa só os SERVIÇOS — os adicionais têm as
 * suas próprias linhas logo por baixo, e somá-los ao campo era contá-los duas
 * vezes na mesma folha.
 *
 * São dois números legítimos e diferentes. Sempre que um chega ao outro tem de
 * passar por uma destas duas funções.
 *
 * ── PORQUE É QUE ESTÃO NO MESMO FICHEIRO ─────────────────────────────────
 *
 * Porque são UMA conversão e a sua inversa, e estavam em sítios diferentes: a
 * ida no topo do módulo do estúdio, a volta dentro do componente, a fechar
 * sobre o `doc`. Nada as obrigava a concordar.
 *
 * E quando elas não concordam, o preço da proposta muda sozinho entre visitas.
 * Já aconteceu, e a escalada foi medida numa proposta real: 3.000 → 3.140 →
 * 3.280 → 3.420, com uma deslocação de 140 €. Uma soma a mais por cada vez que
 * ela abria a proposta. O que estava errado não era a conta: era haver duas.
 *
 * Aqui ficam juntas, com a invariante escrita e presa por teste — para uma
 * fazer a outra falhar quando alguém mexer só numa.
 */

/** O que estas contas precisam de saber do documento, e mais nada. */
export type ContextoDoPreco = Pick<
  ProposalDoc,
  "budgetExtras" | "budgetExtrasSomam" | "totalVatMode" | "totalText" | "totalEstimatedText"
> & { vatRate?: number };

/** O modo de IVA em vigor: explícito no documento, senão lido do texto livre
 *  (retrocompatibilidade com propostas antigas só com «3.000,00 € + IVA»). */
export function modoDeIva(doc: ContextoDoPreco): VatMode {
  return doc.totalVatMode ?? detectVatMode(doc.totalText || doc.totalEstimatedText);
}

/** O degrau: a soma dos adicionais que contam para o preço, sem IVA. */
export function degrauDosAdicionais(doc: ContextoDoPreco): number {
  if (!doc.budgetExtrasSomam) return 0;
  return somaDosExtrasSemIva(doc.budgetExtras, {
    mode: modoDeIva(doc),
    vatRate: doc.vatRate ?? DEFAULT_VAT_RATE,
  });
}

/**
 * PEDIDO → ESTÚDIO. Tira os adicionais, porque o campo do estúdio é só
 * serviços.
 *
 * `null` quando a conta não dá um valor que se possa mostrar — isto é, quando o
 * preço do pedido é MENOR do que os adicionais escritos.
 *
 * ── Porque é que devolve `null` e não zero ───────────────────────────────
 *
 * Devolvia zero, e zero é uma mentira com consequências. Um pedido de 100 € com
 * 140 € de deslocação dava um campo a dizer «0», e a gravação seguinte mandava
 * de volta 0 + 140 = 140 € — o preço do pedido passava de 100 para 140 sem
 * ninguém lhe ter tocado. A conta não é impossível por acaso: é um estado por
 * arrumar (o preço ainda não inclui a deslocação, ou os adicionais estão
 * escritos a mais), e a resposta certa a um estado por arrumar é dizê-lo, não
 * inventar um número redondo.
 *
 * Quem chama trata o `null` deixando o valor como está e mostrando o aviso de
 * desalinhamento, que já existe e já diz exactamente isto.
 */
export function baseParaOEstudio(precoDoPedido: number, doc: ContextoDoPreco): number | null {
  if (!(precoDoPedido > 0)) return null;
  const degrau = degrauDosAdicionais(doc);
  if (degrau === 0) return round2(precoDoPedido);
  const semExtras = round2(precoDoPedido - degrau);
  return semExtras > 0 ? semExtras : null;
}

/** ESTÚDIO → PEDIDO. Volta a somar os adicionais: é o que o casal paga. */
export function precoDoPedidoParaBase(base: number, doc: ContextoDoPreco): number {
  const degrau = degrauDosAdicionais(doc);
  return degrau === 0 ? round2(base) : round2(base + degrau);
}
