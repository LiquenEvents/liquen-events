/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS COMPOSIÇÕES DOS TEMAS — ESCOLHIDAS PELO NÚMERO DE FOTOGRAFIAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O quadro do documento dela, tal e qual:
 *
 *   0       uma página só de texto, sem caixas vazias
 *   1       uma fotografia a página inteira, título em baixo à esquerda
 *   2 ou 3  uma só fila a toda a altura: o mosaico de texto e as fotografias
 *   4       duas filas em «tijolo»: o mosaico e duas em cima, duas em baixo
 *   5       cinco ao alto, lado a lado, desalinhadas em altura
 *   6+      mosaico de ponta a ponta em duas filas de altura igual; uma leva
 *           o mosaico de texto e ~40% das fotografias, a outra o resto
 *   > 12    reparte por duas páginas (a segunda diz «Mais ideias…»)
 *
 * Tudo em píxeis do exemplo (1123 × 794), com 4 px de intervalo. Dentro de uma
 * fila cada fotografia cresce em largura NA PROPORÇÃO DO SEU FORMATO — é o
 * `flex: <aspecto>` do exemplo —, por isso cada célula tem quase a forma da
 * sua fotografia: o recorte é mínimo e nada fica deformado nem vazio.
 *
 * O mosaico de texto alterna de lado: nos temas ímpares fica em cima à
 * esquerda, nos pares em baixo à direita (na fila de 2–3 fotografias, à
 * esquerda ou à direita). O tijolo de quatro fica sempre em cima à esquerda.
 *
 * Este ficheiro não sabe nada de PDF: recebe formas e devolve caixas, para se
 * poder testar sem desenhar.
 */

export interface Caixa {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Largura e altura da folha do exemplo. */
const W = 1123;
const H = 794;
/** O intervalo entre células. */
export const VAO = 4;
/** A largura fixa do mosaico de texto. */
export const LARGURA_DO_MOSAICO = 330;
/** O máximo de fotografias numa página de tema. */
export const MAXIMO_POR_PAGINA = 12;

export type Composicao =
  | { tipo: "texto" }
  | { tipo: "inteira"; celulas: Caixa[] }
  | { tipo: "fila"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "tijolo"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "desalinhadas"; celulas: Caixa[] }
  | { tipo: "mosaico"; mosaico: Caixa; celulas: Caixa[] };

/**
 * Formas muito extremas (uma panorâmica 4:1, uma tira 1:4) dariam células que
 * são uma risca; ficam presas a um intervalo que ainda se lê como fotografia.
 */
const aspectoUtil = (a: number) =>
  Math.min(2.2, Math.max(0.45, Number.isFinite(a) && a > 0 ? a : 1));

/**
 * Uma fila de fotografias a ocupar `w` de largura, cada uma com largura
 * proporcional ao seu aspecto. A última célula leva o arredondamento, para a
 * fila acabar exactamente na borda.
 */
export function fila(
  aspectos: readonly number[],
  x: number,
  y: number,
  w: number,
  h: number,
): Caixa[] {
  if (!aspectos.length) return [];
  const pesos = aspectos.map(aspectoUtil);
  const soma = pesos.reduce((s, p) => s + p, 0);
  const livre = w - VAO * (aspectos.length - 1);
  const caixas: Caixa[] = [];
  let cx = x;
  pesos.forEach((p, i) => {
    const ultima = i === pesos.length - 1;
    const cw = ultima ? x + w - cx : Math.round((livre * p) / soma);
    caixas.push({ x: cx, y, w: cw, h });
    cx += cw + VAO;
  });
  return caixas;
}

/**
 * Quantas páginas leva um tema, e quantas fotografias em cada uma.
 *
 * Até doze, uma. Acima disso reparte-se o mais por igual possível — 13 dá
 * 7 + 6 e não 12 + 1, que seria uma página com uma fotografia só a fazer de
 * «Mais ideias».
 */
export function repartir(n: number): number[] {
  if (n <= MAXIMO_POR_PAGINA) return [n];
  const paginas = Math.ceil(n / MAXIMO_POR_PAGINA);
  const base = Math.floor(n / paginas);
  const resto = n % paginas;
  return Array.from({ length: paginas }, (_, i) => base + (i < resto ? 1 : 0));
}

/**
 * A composição de uma página de tema.
 *
 * `aspectos` vem pela ordem em que ela arrumou as fotografias (com a
 * «principal» à frente — `ordemDasFotos`), e as células saem pela mesma
 * ordem: a célula `i` é a da fotografia `i`.
 *
 * `par` é a vez do tema na proposta (1.º, 2.º…): os pares levam o mosaico de
 * texto em baixo à direita.
 */
export function composicao(aspectos: readonly number[], vezPar: boolean): Composicao {
  let par = vezPar;
  const n = aspectos.length;
  const alturaFila = (H - VAO) / 2;
  if (n === 0) return { tipo: "texto" };
  if (n === 1) return { tipo: "inteira", celulas: [{ x: 0, y: 0, w: W, h: H }] };

  if (n <= 3) {
    // Uma fila a toda a altura; o mosaico do lado da vez.
    const larguraFotos = W - LARGURA_DO_MOSAICO - VAO;
    const mosaico = { x: par ? W - LARGURA_DO_MOSAICO : 0, y: 0, w: LARGURA_DO_MOSAICO, h: H };
    const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
    return { tipo: "fila", mosaico, celulas: fila(aspectos, x0, 0, larguraFotos, H) };
  }

  if (n === 5) {
    // As cinco ao alto, desalinhadas — as alturas do exemplo (40, 96, 10, 120,
    // 60), da esquerda para a direita, a partir da margem de 98.
    const desvios = [40, 96, 10, 120, 60];
    return {
      tipo: "desalinhadas",
      celulas: desvios.map((d, i) => ({ x: 98 + i * (174 + 14), y: d, w: 174, h: 270 })),
    };
  }

  // 4, e 6 a 12: duas filas de altura igual, o mosaico numa delas.
  // O tijolo (4) tem o mosaico sempre em cima à esquerda, como nas duas páginas
  // de quatro fotografias do exemplo; só o mosaico de ponta a ponta alterna.
  if (n === 4) par = false;
  // No tijolo (4) a fila do mosaico leva duas; no mosaico, ~40% das fotos.
  const naFilaDoMosaico = n === 4 ? 2 : Math.max(1, Math.min(n - 1, Math.round(n * 0.4)));
  const comMosaico = par ? aspectos.slice(n - naFilaDoMosaico) : aspectos.slice(0, naFilaDoMosaico);
  const semMosaico = par ? aspectos.slice(0, n - naFilaDoMosaico) : aspectos.slice(naFilaDoMosaico);
  const yMosaico = par ? alturaFila + VAO : 0;
  const ySem = par ? 0 : alturaFila + VAO;
  const mosaico = {
    x: par ? W - LARGURA_DO_MOSAICO : 0,
    y: yMosaico,
    w: LARGURA_DO_MOSAICO,
    h: alturaFila,
  };
  const larguraAoLado = W - LARGURA_DO_MOSAICO - VAO;
  const celulasComMosaico = fila(
    comMosaico,
    par ? 0 : LARGURA_DO_MOSAICO + VAO,
    yMosaico,
    larguraAoLado,
    alturaFila,
  );
  const celulasSem = fila(semMosaico, 0, ySem, W, alturaFila);
  // De volta à ordem das fotografias.
  const celulas = par
    ? [...celulasSem, ...celulasComMosaico]
    : [...celulasComMosaico, ...celulasSem];
  return { tipo: n === 4 ? "tijolo" : "mosaico", mosaico, celulas };
}
