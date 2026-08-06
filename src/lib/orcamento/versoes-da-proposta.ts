import type { ProposalDoc } from "@/lib/proposal-doc";
import { precosDe } from "@/lib/proposal-budget";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VERSÃO BASE E A VERSÃO COM EXTRAS, NA MESMA PROPOSTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O casal pede "uma coisa mais simples e outra com tudo", e o que se fazia era
 * duas propostas. Duas propostas são dois documentos a divergir: corrige-se a
 * data numa e não na outra, sobe-se um preço numa e não na outra, e ao fim de
 * duas semanas ninguém sabe qual é a que vale.
 *
 * Aqui é UMA proposta com linhas assinaladas como extra. Tudo o resto — a data,
 * o local, os serviços, as condições — existe uma vez só, porque é uma vez só
 * que é verdade.
 *
 * ── UM NÚMERO ESCRITO, O OUTRO DERIVADO ────────────────────────────────────
 * O `totalAmount` continua a ser o único número escrito à mão, e continua a
 * querer dizer a proposta INTEIRA — é o que as facturas, o contrato e o dossier
 * já lêem, e mudar-lhe o significado era mexer no dinheiro de todo o sistema
 * por causa de um ecrã.
 *
 * A versão base é a subtracção: total menos os extras assinalados. Assim os
 * dois números não podem discordar, porque só há um a ser escrito. O caminho
 * contrário — dois totais escritos, um por versão — dava, no dia em que ela
 * corrigisse só um, uma proposta que se contradizia a si própria em PDF.
 *
 * ── SEM EXTRAS, NADA DISTO EXISTE ──────────────────────────────────────────
 * Uma proposta sem linhas assinaladas é exactamente a proposta de antes: sem
 * segundo total, sem legenda, sem uma palavra a mais no PDF. Isto só aparece
 * quando alguém o pediu ao assinalar uma linha.
 */

/** Qual das duas versões o cliente ficou. */
export type VersaoEscolhida = "base" | "extras";

/** As linhas assinaladas como extra, normalizadas ao tamanho das linhas. */
export function opcionaisDe(doc: Pick<ProposalDoc, "budgetItems" | "budgetOpcional">): boolean[] {
  const n = doc.budgetItems?.length ?? 0;
  const guardado = doc.budgetOpcional ?? [];
  // O mesmo cuidado dos outros arrays paralelos: um documento antigo não tem
  // este array, e um a que se acrescentou uma linha tem-no mais curto. Em
  // nenhum dos casos pode o índice 3 ler a marca da linha 4.
  return Array.from({ length: n }, (_, i) => guardado[i] === true);
}

export interface Totais {
  /** O que a proposta inteira vale — o número escrito. */
  comExtras: number;
  /** O que vale sem as linhas assinaladas. */
  base: number;
  /** Quanto valem os extras, somados. */
  extras: number;
  /** Quantas linhas estão assinaladas. */
  linhasExtra: number;
  /**
   * Há extras assinalados SEM preço?
   *
   * Importa porque a subtracção fica a mentir: uma linha extra sem preço não
   * baixa a versão base, e a base sai igual ao total. Dizer isto é melhor do
   * que mostrar dois números iguais e deixar a pessoa a pensar que se enganou.
   */
  extrasSemPreco: number;
}

/**
 * Os dois totais, a partir do total escrito e das linhas assinaladas.
 *
 * `null` quando não há extras nenhuns — e nesse caso não há duas versões, há
 * uma proposta como as de sempre.
 */
export function totaisDasVersoes(
  doc: Pick<ProposalDoc, "budgetItems" | "budgetAmounts" | "budgetOpcional">,
  totalEscrito: number,
): Totais | null {
  const marcas = opcionaisDe(doc);
  const linhasExtra = marcas.filter(Boolean).length;
  if (linhasExtra === 0) return null;

  const precos = precosDe(doc);
  let extras = 0;
  let extrasSemPreco = 0;
  marcas.forEach((extra, i) => {
    if (!extra) return;
    const p = precos[i];
    if (p === null) extrasSemPreco += 1;
    else extras += p;
  });
  extras = Math.round(extras * 100) / 100;

  const comExtras = Math.round((totalEscrito || 0) * 100) / 100;
  // A base nunca desce abaixo de zero: extras somados a mais do que o total é
  // um engano de quem escreveu, e um total negativo em PDF seria pior do que o
  // engano. O aviso de desalinhamento (proposal-budget) já apanha o caso.
  const base = Math.max(0, Math.round((comExtras - extras) * 100) / 100);

  return { comExtras, base, extras, linhasExtra, extrasSemPreco };
}

/**
 * As linhas assinaladas, pelo nome — para o PDF poder listá-las e o estúdio
 * poder dizer o que sai na versão base.
 */
export function nomesDosExtras(doc: Pick<ProposalDoc, "budgetItems" | "budgetOpcional">): string[] {
  const marcas = opcionaisDe(doc);
  return (doc.budgetItems ?? [])
    .map((item, i) => (marcas[i] ? (item ?? "").trim() : ""))
    .filter(Boolean);
}

/** Liga/desliga a marca de extra numa linha, sem tocar em mais nada. */
export function marcarExtra<T extends Pick<ProposalDoc, "budgetItems" | "budgetOpcional">>(
  doc: T,
  i: number,
  extra: boolean,
): T {
  return { ...doc, budgetOpcional: opcionaisDe(doc).map((v, j) => (j === i ? extra : v)) };
}
