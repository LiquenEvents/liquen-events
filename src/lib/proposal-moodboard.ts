/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUAL É A FOTOGRAFIA QUE MANDA NA PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Nos layouts "Destaque" uma imagem fica maior, e hoje não se
 * controla qual. Marcar explicitamente a foto principal, com indicação visual.
 * Se não for marcada, o sistema escolhe e diz qual escolheu.»
 *
 * Duas das cinco disposições dão a UMA caixa muito mais área do que às outras —
 * o «destaque» por definição, e o «mosaico» porque a primeira célula é a maior
 * do arranjo. Nessas, a fotografia que calha à primeira posição é a que o casal
 * vê ao abrir a página. Até aqui, essa escolha era a ordem por que as fotos
 * foram carregadas.
 *
 * ── PORQUE É QUE ISTO NÃO REORDENA O ARRAY ────────────────────────────────
 * Marcar a principal podia ser «mover a foto para a primeira posição». Não é,
 * por duas razões. A ordem das fotos é dela e tem sentido próprio (é a ordem
 * das filas nas outras três disposições); e trocar de disposição deixaria de
 * ser reversível — o array já tinha sido mexido e não havia como voltar atrás.
 *
 * O que se guarda é uma MARCA. A permutação é feita na altura de desenhar, pelo
 * estúdio e pelo gerador, com a mesma função — que é o que garante que a
 * miniatura do ecrã e a página do PDF põem a mesma foto no mesmo sítio.
 *
 * ── E QUANDO NÃO ESTÁ MARCADA ─────────────────────────────────────────────
 * Continua a ser a primeira, como sempre foi. O ecrã é que passa a dizê-lo em
 * vez de o deixar por adivinhar.
 */

import type { LayoutDeMoodboard } from "./proposal-geometria";
import { layoutSugerido } from "./proposal-geometria";
import type { MoodBoard } from "./proposal-doc";

/**
 * Esta disposição dá a uma das fotos um lugar dominante?
 *
 * «Filas», «fila única» e «texto e imagem» distribuem a área por igual (ou
 * quase), e nessas «a foto principal» não quer dizer nada — marcá-la ali seria
 * prometer um destaque que a página não dá.
 */
export function temLugarDeDestaque(layout: LayoutDeMoodboard): boolean {
  return layout === "destaque" || layout === "mosaico";
}

/** A disposição em vigor: a escolhida, ou a que o número de fotos sugere. */
export function layoutDoBoard(board: Pick<MoodBoard, "layout" | "images">): LayoutDeMoodboard {
  return board.layout ?? layoutSugerido(board.images?.length ?? 0);
}

/**
 * O índice da foto principal EFECTIVA — a marcada, ou a primeira.
 *
 * Uma marca fora dos limites (fotos removidas depois de marcar) vale o mesmo
 * que marca nenhuma: o documento não pode apontar para uma foto que já não
 * existe, e um índice inválido desenharia uma página com um buraco.
 */
export function fotoPrincipalDe(board: Pick<MoodBoard, "principal" | "images">): number {
  const n = board.images?.length ?? 0;
  if (n === 0) return 0;
  const p = board.principal;
  if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p >= n) return 0;
  return p;
}

/** A marca aponta mesmo para uma foto que existe? */
export function temPrincipalMarcada(board: Pick<MoodBoard, "principal" | "images">): boolean {
  const p = board.principal;
  const n = board.images?.length ?? 0;
  return typeof p === "number" && Number.isInteger(p) && p >= 0 && p < n;
}

/**
 * A ordem por que as fotos deste board são DESENHADAS.
 *
 * Devolve índices do array `images`. Sem lugar de destaque, ou sem marca, é a
 * ordem escrita — e devolve-se na mesma a lista completa para quem chama não
 * ter de decidir entre dois caminhos.
 */
export function ordemDasFotos(board: Pick<MoodBoard, "images" | "layout" | "principal">): number[] {
  const n = board.images?.length ?? 0;
  const comoEstao = Array.from({ length: n }, (_, i) => i);
  if (n < 2) return comoEstao;
  if (!temLugarDeDestaque(layoutDoBoard(board))) return comoEstao;
  const p = fotoPrincipalDe(board);
  if (p === 0) return comoEstao;
  return [p, ...comoEstao.filter((i) => i !== p)];
}

/**
 * A marca depois de as fotos mexerem.
 *
 * Quem reordena, remove ou move uma foto para outro board tem de trazer a marca
 * atrás — senão «a principal» passa a ser a foto que calhou àquele índice, e o
 * documento muda de cara sem ninguém lhe ter tocado. `deParaOndeFoi` recebe o
 * índice antigo e devolve o novo, ou `null` quando a foto saiu do board.
 */
export function marcaDepoisDeMexer(
  board: Pick<MoodBoard, "principal" | "images">,
  deParaOndeFoi: (indiceAntigo: number) => number | null,
): number | undefined {
  if (!temPrincipalMarcada(board)) return undefined;
  const novo = deParaOndeFoi(board.principal as number);
  return novo === null || novo < 0 ? undefined : novo;
}
