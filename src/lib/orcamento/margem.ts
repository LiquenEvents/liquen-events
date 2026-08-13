import type { ProposalDoc } from "@/lib/proposal-doc";
import { normalizarValor, precosDe } from "@/lib/proposal-budget";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUANTO É QUE ISTO DEIXA — SÓ PARA OS OLHOS DELA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O estúdio sabia o que se cobra e não sabia o que se gasta. Uma proposta de
 * 12.000 € pode ser um bom negócio ou trabalho de graça, e a diferença estava
 * numa folha de cálculo à parte — quando estava em algum lado.
 *
 * ── ISTO NUNCA CHEGA AO CLIENTE ────────────────────────────────────────────
 * Nem no PDF, nem no email, nem no portal. Um custo interno visível numa
 * proposta acaba a negociação antes de ela começar. O documento leva os
 * números (`budgetCosts`) porque é onde as linhas vivem, e há um teste no
 * desenhador do PDF a garantir que de lá não saem.
 *
 * ── PARCIAL É ÚTIL ─────────────────────────────────────────────────────────
 * O custo é opcional linha a linha. Preencher duas linhas em dez já responde à
 * pergunta "as flores estão a pagar-se?"; exigir as dez garantia que não se
 * preenchia nenhuma. Quando é parcial, a margem total diz-se PARCIAL — porque
 * uma margem calculada sobre metade dos custos, apresentada como se fosse a
 * margem, seria uma mentira otimista.
 */

/** Os custos, sempre com o mesmo comprimento que as linhas. */
export function custosDe(doc: Pick<ProposalDoc, "budgetItems" | "budgetCosts">): (number | null)[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardados = doc.budgetCosts ?? [];
  return Array.from({ length: n }, (_, i) => {
    const v = guardados[i];
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  });
}

export interface MargemDaLinha {
  /** Índice da linha em `budgetItems`. */
  i: number;
  preco: number | null;
  custo: number | null;
  /** Euros que sobram. `null` quando falta o preço ou o custo. */
  margem: number | null;
  /** Percentagem sobre o PREÇO (não sobre o custo). `null` como acima. */
  percentagem: number | null;
}

const cent = (n: number) => Math.round(n * 100) / 100;

/**
 * A margem de cada linha.
 *
 * A percentagem é sobre o preço, não sobre o custo: é a leitura de quanto de
 * cada euro cobrado fica cá dentro, que é a pergunta que se faz ao decidir se
 * se baixa o preço. (Sobre o custo daria "markup", outro número, maior, e
 * confundi-los é a forma clássica de descontar até ao prejuízo.)
 */
export function margensPorLinha(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetCosts">,
): MargemDaLinha[] {
  const precos = precosDe(doc);
  const custos = custosDe(doc);
  return (doc.budgetItems ?? []).map((_, i) => {
    const preco = precos[i];
    const custo = custos[i];
    if (preco === null || custo === null) {
      return { i, preco, custo, margem: null, percentagem: null };
    }
    const margem = cent(preco - custo);
    return {
      i,
      preco,
      custo,
      margem,
      // Preço zero com custo: a percentagem seria infinita. Diz-se -100%, que
      // é o que de facto acontece — perde-se o custo todo.
      percentagem: preco === 0 ? (custo === 0 ? 0 : -100) : cent((margem / preco) * 100),
    };
  });
}

export interface MargemTotal {
  /** Soma dos preços das linhas que TÊM custo — a base comparável. */
  precoComparavel: number;
  custo: number;
  margem: number;
  percentagem: number;
  /** Quantas linhas entraram na conta, e quantas há ao todo. */
  linhasComCusto: number;
  linhasTotais: number;
  /** Faltam custos: o número está certo para o que cobre, e só para isso. */
  parcial: boolean;
}

/**
 * A margem do conjunto — calculada SÓ sobre as linhas que têm custo.
 *
 * Somar o preço de todas as linhas e dividir pelos custos de algumas daria uma
 * margem inventada, sempre generosa. Aqui o denominador é o preço das linhas
 * que também têm custo; o que falta fica de fora e é declarado em `parcial`.
 *
 * `null` quando não há uma única linha com preço e custo — não há nada a dizer.
 */
export function margemTotal(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetCosts" | "budgetExtras">,
): MargemTotal | null {
  const linhas = margensPorLinha(doc);
  const comAmbos = linhas.filter((l) => l.margem !== null);
  if (comAmbos.length === 0) return null;

  const precoComparavel = cent(comAmbos.reduce((s, l) => s + (l.preco ?? 0), 0));
  const custo = cent(comAmbos.reduce((s, l) => s + (l.custo ?? 0), 0));
  const margem = cent(precoComparavel - custo);
  const linhasTotais = doc.budgetItems?.length ?? 0;

  return {
    precoComparavel,
    custo,
    margem,
    percentagem:
      precoComparavel === 0 ? (custo === 0 ? 0 : -100) : cent((margem / precoComparavel) * 100),
    linhasComCusto: comAmbos.length,
    linhasTotais,
    parcial: comAmbos.length < linhasTotais,
  };
}

/** O limite por omissão, quando ela ainda não definiu nenhum. */
export const MARGEM_MINIMA_OMISSAO = 35;

/**
 * A margem está abaixo do limite?
 *
 * Devolve `null` quando não há margem para avaliar — e nesse caso não se diz
 * nada, em vez de se dizer que está tudo bem.
 */
export function abaixoDoLimite(
  m: MargemTotal | null,
  limite = MARGEM_MINIMA_OMISSAO,
): boolean | null {
  if (!m) return null;
  return m.percentagem < limite;
}

/** Texto livre → número, com as mesmas regras do resto do orçamento. */
export const custoDeTexto = normalizarValor;
