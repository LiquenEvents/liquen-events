import type { Quote } from "./types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { contractedAmounts } from "./dossier";
import { convidadosDoDoc } from "./escala";
import { localizar } from "@/lib/geo/portugal";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ESTE VALOR É NORMAL PARA UM CASAMENTO ASSIM?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Não é uma opinião sobre preço — é uma defesa contra a distração. Escrever
 * 3.000 onde se queria escrever 13.000 é um erro de um dígito, e um erro de um
 * dígito numa proposta que segue por email não se corrige: corrige-se a
 * conversa toda que vem a seguir.
 *
 * ── DE ONDE VÊM OS NÚMEROS ─────────────────────────────────────────────────
 * Do que ela já cobrou. Nada de tabelas inventadas: só propostas com valor
 * fechado (`quotedPrice`) ou negócio ganho, em eventos de dimensão parecida —
 * e, quando há material que chegue, da mesma região.
 *
 * ── QUANDO NÃO SE DIZ NADA ─────────────────────────────────────────────────
 * Com menos de {@link MINIMO_PARA_COMPARAR} casos comparáveis, cala-se. Uma
 * "média" de dois casamentos não é um padrão, é uma coincidência — e um aviso
 * assente numa coincidência ensina-se a ignorar em duas semanas.
 */

/** Abaixo disto não há padrão nenhum, há acaso. */
export const MINIMO_PARA_COMPARAR = 5;

/** Quanto pode variar o número de convidados para ainda ser "parecido". */
export const TOLERANCIA_PAX = 0.35;

export interface Padrao {
  /** O intervalo habitual: percentis 25 e 75 do que ela já cobrou. */
  min: number;
  max: number;
  mediana: number;
  /** Quantos eventos entraram na conta. */
  casos: number;
  /** A comparação foi afinada por região, ou é nacional? */
  regiao: string | null;
}

/**
 * O valor fechado de um pedido: o preço cotado, senão a estimativa — SEMPRE COM
 * IVA.
 *
 * ── PORQUE É QUE ISTO NÃO LÊ O `quotedPrice` DIRECTAMENTE ──────────────────
 * Porque os dois sítios onde o valor pode estar guardado NÃO estão na mesma
 * unidade: o `quotedPrice` é o campo "Preço final (SEM IVA)" do estúdio e o
 * `priceBreakdown.total` já vem com IVA. Lidos em bruto, o mesmo casamento
 * valia 10.000 € ou 12.300 € consoante o ramo, e um intervalo construído com os
 * dois misturava as duas moedas.
 *
 * E o número com que este intervalo é confrontado é BRUTO: tanto a Conferência
 * como o Painel Interno passam o total com IVA da proposta, que é o que está no
 * ecrã. Enquanto o padrão foi líquido, dez casamentos cobrados a 10.000 € davam
 * um habitual de 10.000 a 10.000 e a proposta seguinte, cotada exactamente ao
 * mesmo preço, aparecia "acima" — todas as vezes.
 *
 * `contractedAmounts` é o ajudante canónico que sabe converter cada ramo; a
 * estimativa fica como rede para os pedidos cujo `quotedPrice` está a zero.
 */
function valorDe(q: Quote): number | null {
  const { gross } = contractedAmounts(q);
  if (gross > 0) return gross;
  const t = q.priceBreakdown?.total;
  return typeof t === "number" && t > 0 ? t : null;
}

/** Só o que representa um preço REAL: cotado, ganho, ou perdido depois de cotado. */
function jaTevePreco(q: Quote): boolean {
  return q.status === "cotado" || q.status === "aceite" || q.status === "rejeitado";
}

function percentil(ordenados: number[], p: number): number {
  if (ordenados.length === 0) return 0;
  const i = (ordenados.length - 1) * p;
  const baixo = Math.floor(i);
  const alto = Math.ceil(i);
  if (baixo === alto) return ordenados[baixo];
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (i - baixo);
}

/**
 * O intervalo habitual para um casamento como este.
 *
 * Tenta primeiro com a região; se não houver casos que cheguem, alarga a todo
 * o país e diz que o fez (`regiao: null`). Alargar em silêncio faria um aviso
 * sobre o Algarve com números do Alentejo.
 */
export function padraoPara(
  alvo: { guests?: number; location?: string | null },
  historico: Quote[],
): Padrao | null {
  const pax = alvo.guests;
  if (!pax || pax <= 0) return null;

  const minPax = pax * (1 - TOLERANCIA_PAX);
  const maxPax = pax * (1 + TOLERANCIA_PAX);
  const regiaoAlvo = localizar(alvo.location)?.lugar.nome ?? null;

  const comparaveis = historico.filter(
    (q) =>
      !q.archived &&
      jaTevePreco(q) &&
      typeof q.guests === "number" &&
      q.guests >= minPax &&
      q.guests <= maxPax &&
      valorDe(q) !== null,
  );

  const daRegiao = regiaoAlvo
    ? comparaveis.filter((q) => localizar(q.location)?.lugar.nome === regiaoAlvo)
    : [];

  const usar = daRegiao.length >= MINIMO_PARA_COMPARAR ? daRegiao : comparaveis;
  if (usar.length < MINIMO_PARA_COMPARAR) return null;

  const valores = usar.map((q) => valorDe(q)!).sort((a, b) => a - b);
  return {
    min: Math.round(percentil(valores, 0.25)),
    max: Math.round(percentil(valores, 0.75)),
    mediana: Math.round(percentil(valores, 0.5)),
    casos: valores.length,
    regiao: usar === daRegiao ? regiaoAlvo : null,
  };
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PARA QUANTAS PESSOAS É QUE ESTE PREÇO É
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O DOCUMENTO manda; o pedido é a rede.
 *
 * ── O defeito que isto corrige ─────────────────────────────────────────────
 * Os dois sítios que perguntam «este valor é normal para um casamento assim?»
 * — a Conferência e o Painel Interno — construíam o intervalo habitual com o
 * `quote.guests`, sempre, e nunca olhavam para o `doc.guests`. Se ela corrigir
 * os convidados NA PROPOSTA (porque o casal mudou de ideias, que é o caso
 * normal entre o formulário e a proposta), o intervalo continuava a ser o de
 * 120 pax enquanto a proposta era para 80: uma proposta de 80 pessoas cobrada
 * a preço de 80 aparecia «abaixo do habitual», todas as vezes — e uma cobrada
 * a preço de 120 passava sem uma palavra.
 *
 * A Conferência até já dizia que os dois números divergem («A proposta é para
 * "80 pax" e o pedido pedia 120»); o que não acompanhava era o preço.
 *
 * ── E o texto que se lê ao lado tem de usar ESTE número ────────────────────
 * Escrever «120 pax costuma ficar entre…» debaixo de uma proposta para 80 é
 * pior do que não comparar: parece um erro do programa, e quem o lê deixa de
 * acreditar no resto da lista.
 *
 * `convidadosDoDoc` é o MESMO leitor que a escala do orçamento usa para saber
 * por quantas pessoas multiplica o catering — o número que se usa para pôr um
 * preço é o mesmo que se usa para o julgar.
 */
export function paxDaProposta(
  doc: Pick<ProposalDoc, "guests"> | null | undefined,
  quote: Pick<Quote, "guests">,
): number | undefined {
  const noDoc = doc ? convidadosDoDoc(doc) : 0;
  if (noDoc > 0) return noDoc;
  return typeof quote.guests === "number" && quote.guests > 0 ? quote.guests : undefined;
}

export type ForaDoPadrao = { lado: "abaixo" | "acima"; padrao: Padrao } | null;

/**
 * Este total está fora do habitual?
 *
 * `null` quando está dentro, ou quando não há padrão com que comparar. O aviso
 * é discreto de propósito: ela cobra o que decide cobrar, e um casamento pode
 * ser mais barato por mil razões legítimas. O que isto apanha é o zero a mais
 * e o zero a menos.
 */
export function foraDoPadrao(total: number, padrao: Padrao | null): ForaDoPadrao {
  if (!padrao || total <= 0) return null;
  if (total < padrao.min) return { lado: "abaixo", padrao };
  if (total > padrao.max) return { lado: "acima", padrao };
  return null;
}
