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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE O «AUTOMÁTICO» ESCOLHEU AQUILO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «O seletor mostra "Automático (fila única)" nuns boards e
 * "Automático (mosaico)" noutros, sem explicar porquê.»
 *
 * A regra é `layoutSugerido`, e é curta: depende só de QUANTAS fotos há. Dizer
 * isso em voz alta faz duas coisas — tira o mistério, e torna óbvio o remédio
 * quando a escolha não serve (tirar uma foto, acrescentar outra, ou escolher à
 * mão, que é para isso que as outras opções estão ao lado).
 *
 * Escrito aqui, ao lado da regra que descreve, para as duas não poderem
 * divergir sem que alguém tropece nas duas ao mesmo tempo.
 */
export function porqueEsteAutomatico(quantasFotos: number): string {
  const n = quantasFotos;
  if (n <= 0) return "Sem fotos ainda — a disposição escolhe-se com a primeira.";
  if (n === 1) return "Uma foto só: fica grande, ao lado do texto.";
  if (n <= 3) return `${n} fotos: uma em destaque e as outras ao lado.`;
  if (n === 5) return "5 fotos: cabem todas numa fila, sem nenhuma ficar pequena.";
  if (n === 4 || n === 6) return `${n} fotos: um mosaico, com a primeira maior.`;
  return `${n} fotos: filas, para nenhuma ficar do tamanho de um selo.`;
}

/**
 * A última fila fica desequilibrada?
 *
 * Palavras dela: «Aviso se um board tiver um número de fotos que deixe a última
 * fila desequilibrada, com sugestão de acrescentar ou remover uma.»
 *
 * Mede-se nas CAIXAS que a página vai mesmo desenhar, agrupando-as por linha
 * (mesmo topo, ao ponto). Uma última fila com uma foto só, quando as de cima
 * têm três ou quatro, lê-se como um esquecimento — e é a única assimetria que
 * se nota a olho numa página de inspiração.
 *
 * Devolve `null` quando está tudo bem, que é o caso normal.
 */
export function filaDesequilibrada(
  caixas: readonly { y: number; h: number }[],
): { naUltima: number; nasOutras: number; sugestao: "acrescentar" | "remover" } | null {
  if (caixas.length < 4) return null;
  // Agrupar por topo: as caixas de uma fila partilham o topo ao ponto.
  const filas = new Map<number, number>();
  for (const c of caixas) {
    const topo = Math.round((c.y + c.h) * 10) / 10;
    filas.set(topo, (filas.get(topo) ?? 0) + 1);
  }
  if (filas.size < 2) return null;
  // A última fila é a mais BAIXA na página (o y cresce para cima no PDF).
  const topos = [...filas.keys()].sort((a, b) => b - a);
  const naUltima = filas.get(topos[topos.length - 1]) ?? 0;
  const outras = topos.slice(0, -1).map((t) => filas.get(t) ?? 0);
  const nasOutras = Math.max(...outras);
  // Duas ou mais de diferença é que se nota. Uma a menos na última fila é o
  // aspecto normal de uma grelha e não merece aviso nenhum.
  if (nasOutras - naUltima < 2) return null;
  return {
    naUltima,
    nasOutras,
    // Acrescentar é quase sempre o gesto mais barato: há mais fotos na
    // biblioteca do que vontade de tirar uma que já foi escolhida.
    sugestao: "acrescentar",
  };
}
