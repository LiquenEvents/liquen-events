import type { ProposalDoc } from "./proposal-doc";
import { ordemDeSaida } from "./proposal-ordem";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS QUE A PROPOSTA VAI TER, PELA ORDEM EM QUE SAEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O defeito que isto existe para fechar ─────────────────────────────────
 *
 * Palavras dela: «"Todas" mostra 7 páginas quando o PDF tem cerca de 14 — a
 * contagem tem de bater certo».
 *
 * E não batia porque não eram a mesma coisa. A «Vista de conjunto» recebia um
 * único dado — os mood boards — e mostrava-os todos; o PDF tem os mood boards
 * MAIS a capa, a apresentação, os serviços, o orçamento, as condições, as
 * observações e a contracapa. Não era um contador partido: era um reordenador
 * de páginas de inspiração com o nome de «Todas».
 *
 * O preço disso é o que ela diz a seguir, e é o que interessa: «uma
 * pré-visualização parcial dá falsa confiança». Foi nas páginas que ela NÃO
 * via que estavam os erros que chegaram a clientes.
 *
 * ── Secções, e não folhas ─────────────────────────────────────────────────
 *
 * Uma lista de FOLHAS exactas não se pode calcular sem desenhar o PDF: os
 * serviços, o orçamento e as condições transbordam conforme o texto que lá
 * está, e o transbordo decide-se com a fonte, a medida e a altura da folha.
 * Prometer «página 9 de 14» e depois sair 15 é voltar ao mesmo defeito com
 * outro número.
 *
 * O que se enumera aqui são as SECÇÕES, que são exactas — cada uma existe ou
 * não existe, e a ordem é a do gerador. Quantas folhas cada uma ocupa em média
 * está no `FOLHAS_TIPICAS`, MEDIDO, e é o que dá o «cerca de».
 *
 * ── Porque é que a ordem não é uma lista escrita à mão ────────────────────
 *
 * Os mood boards saem pela `ordemDeSaida` — a mesma função que o gerador do
 * PDF usa, e que respeita os capítulos dos serviços. Escrever aqui uma segunda
 * ordem era garantir que um dia divergiam, e a divergência apareceria como
 * «a miniatura 3 abre a página 5».
 */

export type EspecieDePagina =
  | "capa"
  | "apresentacao"
  | "cronograma"
  | "moodboard"
  | "orcamento"
  | "condicoes"
  | "observacoes"
  | "contracapa";

export interface PaginaDaProposta {
  especie: EspecieDePagina;
  /** Como se lhe chama no índice e por baixo da miniatura. */
  titulo: string;
  /** O índice REAL no `doc.moodBoards` — só nas páginas de inspiração. */
  bi?: number;
  /**
   * A secção do formulário que produz esta página.
   *
   * É o que permite o que ela pediu: «clicar numa miniatura salta para a
   * secção do formulário que a produz. Hoje vê-se um problema na página 5 e
   * tem de se procurar onde ele nasce.» Os ids são os mesmos do
   * `estadoDasSeccoes`, para o salto usar o índice que já existe.
   */
  seccao: string;
}

/**
 * Quantas FOLHAS cada secção costuma ocupar.
 *
 * MEDIDO, e não estimado: geraram-se PDFs de propostas com 0, 1 e 3 mood
 * boards e contaram-se as folhas — 7, 8 e 10. Sete fixas, mais uma por página
 * de inspiração. Estes números são a repartição dessas sete pelas secções que
 * as ocupam.
 *
 * Um texto muito longo (condições reescritas à mão, uma lista de serviços
 * enorme) empurra uma secção para a folha seguinte, e é por isso que o que se
 * mostra a partir daqui diz «cerca de». É um piso honesto, não uma promessa.
 */
const FOLHAS_TIPICAS: Record<EspecieDePagina, number> = {
  capa: 1,
  apresentacao: 2,
  cronograma: 1,
  moodboard: 1,
  orcamento: 1,
  condicoes: 1,
  observacoes: 1,
  contracapa: 1,
};

const temTexto = (v: unknown) => typeof v === "string" && v.trim() !== "";

/**
 * As fases do cronograma que chegam a ter página.
 *
 * A mesma regra do gerador, e escrita lá com a razão: «uma fase sem tarefas é
 * um título sozinho», e um cronograma inteiro em branco abria uma folha só com
 * o cabeçalho.
 */
function fasesComTarefas(doc: Pick<ProposalDoc, "cronograma">) {
  return (doc.cronograma ?? []).filter((fase) =>
    (fase.items ?? []).some((it) => temTexto(it ?? "")),
  );
}

/**
 * As páginas de inspiração que chegam a sair, pela ordem em que saem.
 *
 * Um board sem fotografias não produz folha nenhuma — o gerador salta-o de
 * propósito, para nunca mostrar a um cliente uma página vazia. (Desde o P0,
 * um board com título e sem fotos também trava o envio: é um erro a corrigir,
 * não uma página a desenhar.)
 */
export function boardsQueSaem(doc: ProposalDoc): number[] {
  const boards = doc.moodBoards ?? [];
  return ordemDeSaida(doc, boards, (b) => b.title ?? "").filter(
    (bi) => (boards[bi]?.images ?? []).length > 0,
  );
}

/** As secções do documento, pela ordem em que o PDF as desenha. */
export function paginasDaProposta(doc: ProposalDoc): PaginaDaProposta[] {
  const org = doc.template === "organizacao";
  const paginas: PaginaDaProposta[] = [
    { especie: "capa", titulo: "Capa", seccao: "capas" },
    { especie: "apresentacao", titulo: "Apresentação e serviços", seccao: "servicos" },
  ];

  if (fasesComTarefas(doc).length > 0) {
    paginas.push({ especie: "cronograma", titulo: "Cronograma", seccao: "cronograma" });
  }

  for (const bi of boardsQueSaem(doc)) {
    paginas.push({
      especie: "moodboard",
      titulo: (doc.moodBoards[bi]?.title ?? "").trim() || `Inspiração ${bi + 1}`,
      bi,
      seccao: "moodboards",
    });
  }

  paginas.push(
    { especie: "orcamento", titulo: "Orçamento", seccao: "orcamento" },
    { especie: "condicoes", titulo: "Condições gerais", seccao: "total" },
    { especie: "observacoes", titulo: "Observações e contactos", seccao: "total" },
    { especie: "contracapa", titulo: "Contracapa", seccao: "capas" },
  );

  // A capa e a contracapa espelham-se, e as duas vivem das mesmas fotografias:
  // por isso a secção é a mesma. O `org` fica lido para o dia em que o modelo
  // de organização deixar de partilhar esta espinha.
  void org;

  return paginas;
}

/**
 * Quantas FOLHAS a proposta deve ter, aproximadamente.
 *
 * É este número que aparece no «PDF com cerca de N páginas» — e é o mesmo que
 * a vista de conjunto tem de contar, senão voltamos a ter dois números sobre o
 * mesmo documento.
 */
export function folhasAproximadas(doc: ProposalDoc): number {
  return paginasDaProposta(doc).reduce((n, p) => n + FOLHAS_TIPICAS[p.especie], 0);
}
