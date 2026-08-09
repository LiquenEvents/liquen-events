/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GEOMETRIA DA PROPOSTA — onde cada fotografia é desenhada
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas funções não desenham nada: dizem apenas ONDE, e com que tamanho, cada
 * fotografia vai ser posta na página. Vivem num módulo próprio, sem
 * `server-only`, porque há TRÊS sítios que precisam da mesma resposta:
 *
 *   · o gerador do PDF (`proposal-doc-pdf.ts`), que desenha;
 *   · o resolvedor (`proposal-doc-render.ts`), que precisa de saber o tamanho
 *     da caixa ANTES de descarregar seja o que for — é isso que lhe permite
 *     pedir a miniatura de 400 px para uma célula de 266 px em vez do original
 *     de 2200 px e 576 KB;
 *   · e o ESTÚDIO, no browser, que tem de lhe mostrar a foto com a forma que a
 *     foto vai ter no documento.
 *
 * Este terceiro é novo, e é o que obrigou a separar o módulo. O estúdio
 * pré-visualizava as capas em 4:3 e as células dos mood boards em quadrado — e
 * o PDF não desenha nenhuma foto em 4:3 nem nenhuma em quadrado. As capas são
 * tiras altíssimas (0,47:1) e as células do collage mudam de forma consoante o
 * número de fotos do board. Ela escolhia uma foto por aquilo que via, e recebia
 * outra coisa: a mesma fotografia, cortada noutro sítio.
 *
 * Ter a geometria em DOIS sítios seria pior do que não a ter: divergiriam, e o
 * sintoma seria uma fotografia mal cortada numa proposta, meses depois, sem
 * ninguém perceber porquê. Por isso é uma função só, e é esta que os três usam.
 */

// ── A4 ao baixo (paisagem), em pontos PDF ──
export const PAGINA_W = 841.89;
export const PAGINA_H = 595.28;
/** Margem da mancha — espaço editorial generoso, a página a respirar. */
export const PAGINA_M = 68;

/** Uma caixa na página, em pontos PDF. `y` é a base (o PDF conta de baixo). */
export interface CaixaPdf {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * As duas caixas da capa: duas fotos a toda a altura, a ladear o painel
 * escuro central. É a mesma geometria na capa e na contracapa, de propósito —
 * uma faz de eco da outra.
 */
export function caixasDaCapa(): CaixaPdf[] {
  const panelW = PAGINA_W * 0.34;
  const sideW = (PAGINA_W - panelW) / 2;
  return [
    { x: 0, y: 0, w: sideW, h: PAGINA_H },
    { x: sideW + panelW, y: 0, w: sideW, h: PAGINA_H },
  ];
}

/**
 * Onde é desenhada cada uma das `n` fotos de um mood board, pela ordem em que
 * aparecem no documento.
 *
 * `alturaAnotacao` é o espaço reservado em baixo para a descrição. Quem desenha
 * sabe-o ao certo (mediu as linhas); quem vai buscar as fotos não tem fontes
 * para o medir e passa o mínimo — o que dá as caixas MAIORES e, portanto, um
 * pedido de resolução por excesso. Errar para o lado de descarregar um ficheiro
 * grande de mais é invisível; errar para o outro é uma foto desfocada no PDF.
 */
export function caixasDoCollage(n: number, alturaAnotacao = 8): CaixaPdf[] {
  if (n <= 0) return [];
  const top = PAGINA_H - PAGINA_M - 112;
  const bottom = PAGINA_M + alturaAnotacao;
  const areaW = PAGINA_W - 2 * PAGINA_M;
  const areaH = top - bottom;
  const gap = 8;

  if (n === 1) return [{ x: PAGINA_M, y: bottom, w: areaW, h: areaH }];
  if (n === 2) {
    const cw = (areaW - gap) / 2;
    return [
      { x: PAGINA_M, y: bottom, w: cw, h: areaH },
      { x: PAGINA_M + cw + gap, y: bottom, w: cw, h: areaH },
    ];
  }
  // Disposição em destaque: uma foto grande à esquerda + as restantes numa
  // grelha à direita.
  const featW = areaW * 0.56;
  const caixas: CaixaPdf[] = [{ x: PAGINA_M, y: bottom, w: featW, h: areaH }];
  const restantes = n - 1;
  const rx = PAGINA_M + featW + gap;
  const rW = areaW - featW - gap;
  const rCols = restantes <= 2 ? 1 : 2;
  const rRows = Math.ceil(restantes / rCols);
  const cw = (rW - gap * (rCols - 1)) / rCols;
  const ch = (areaH - gap * (rRows - 1)) / rRows;
  for (let i = 0; i < restantes; i++) {
    const r = Math.floor(i / rCols);
    const c = i % rCols;
    caixas.push({ x: rx + c * (cw + gap), y: top - r * (ch + gap) - ch, w: cw, h: ch });
  }
  return caixas;
}

/**
 * O aspeto (largura ÷ altura) de uma caixa, arredondado ao milésimo — a forma
 * de o dar ao CSS (`aspect-ratio`) sem lhe passar as medidas em pontos.
 */
export function aspetoDaCaixa(c: CaixaPdf | undefined): number {
  if (!c || c.h <= 0) return 1;
  return Math.round((c.w / c.h) * 1000) / 1000;
}

/** O aspeto de uma tira da capa. Uma tira ALTA: ≈ 0,467, quase 1:2. */
export function aspetoDaCapa(): number {
  return aspetoDaCaixa(caixasDaCapa()[0]);
}

/**
 * O aspeto da célula `i` de um mood board com `n` fotos.
 *
 * Muda com `n` — a foto em destaque é larga, as da grelha da direita são
 * pequenas e mudam de forma quando se acrescenta mais uma. É por isso que a
 * pré-visualização tem de perguntar em vez de assumir.
 */
export function aspetoDoCollage(n: number, i: number): number {
  return aspetoDaCaixa(caixasDoCollage(n)[i]);
}
