/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUE EVENTO É ESTE — A PERGUNTA QUE O PDF NUNCA FAZIA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 13/10, com uma proposta para um restaurante no Halloween:
 * «nós apenas estamos a colocar as abas que queremos e os moodboards que
 * queremos, e continua lá a aparecer cocktail, casamento… nem todas as
 * propostas são para casamento». O PDF só sabia distinguir Decoração de
 * Organização; o resto era sempre um casamento — «Noivos», «Cerimónia», os
 * mood boards arrumados em Cerimónia/Cocktail/Jantar. E o estúdio escrevia
 * «Casamento» sozinho em qualquer pedido particular sem tipo.
 *
 * A resposta dela: os casamentos ficam como estão; o resto adapta-se ao que se
 * escreve (cada mood board é o seu capítulo, com o título que lhe deram).
 *
 * Esta é a ÚNICA regra que decide se uma proposta é de casamento. O PDF, o
 * plano das páginas e o estúdio lêem-na daqui — se cada um tivesse a sua, o
 * ecrã contava páginas que o PDF não imprime.
 */

import { eventTypeName } from "./orcamento/data";
import type { Quote } from "./orcamento/types";

const semAcentos = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

/** As palavras que dizem «casamento», em português e em inglês. */
const DE_CASAMENTO = /casament|wedding|matrimon|noivos|bride|groom/;

/**
 * É um casamento? Lê-se o «Tipo de evento» da proposta, que é texto livre.
 *
 * Vazio conta como NÃO: um tipo por escrever não pode pôr «Noivos» numa
 * proposta para um restaurante. As propostas de casamento já feitas dizem
 * todas «Casamento» (era o que o estúdio escrevia por omissão), e por isso
 * continuam a sair exactamente como saíam.
 */
export function eCasamento(eventType: string | null | undefined): boolean {
  return DE_CASAMENTO.test(semAcentos(eventType ?? ""));
}

/**
 * O tipo de evento com que uma proposta nova abre, a partir do pedido.
 *
 * O nome do tipo, se o pedido o tem; senão o nome que o cliente deu ao evento
 * («Halloween no restaurante»); senão «Evento Corporativo» nas empresas; senão
 * VAZIO, para ela escrever. Nunca «Casamento» por omissão — era isso que fazia
 * o «Outro» do formulário abrir como um casamento.
 */
export function tipoDoEventoDoPedido(
  q: Pick<Quote, "eventType" | "category"> & { eventName?: string | null },
): string {
  return (
    eventTypeName(q.eventType) ||
    (q.eventName ?? "").trim() ||
    (q.category === "empresas" ? "Evento Corporativo" : "")
  );
}

/** O pedido é um casamento? Pelo tipo que o cliente escolheu no formulário. */
export function pedidoECasamento(q: Pick<Quote, "eventType">): boolean {
  return q.eventType === "casamentos";
}

/** As sugestões do campo «Tipo de evento» — escolhe-se uma ou escreve-se outra. */
export const SUGESTOES_DE_TIPO: readonly string[] = [
  "Casamento",
  "Festa",
  "Jantar",
  "Aniversário",
  "Batizado",
  "Decoração de restaurante",
  "Evento corporativo",
  "Jantar de empresa",
];
