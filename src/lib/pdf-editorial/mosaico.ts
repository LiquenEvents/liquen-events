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
 *
 * ── A DISPOSIÇÃO À ESCOLHA (15/10) ──────────────────────────────────────────
 * O quadro de cima é a AUTOMÁTICA. Ela pediu de volta o que o PDF antigo
 * tinha — escolher a disposição das fotografias de cada tema — «com o mesmo
 * design que está agora no PDF». As disposições de `DISPOSICOES` são esse
 * pedido: as quatro que lhe propus (uma fila, duas filas, soltas, destaque) e
 * as do PDF antigo refeitas nesta folha (três filas, grelha, texto e imagem).
 * Todas usam as mesmas peças — o mosaico de texto de 330 px, o intervalo de
 * 4 px, a largura de cada fotografia na proporção da sua forma.
 *
 * Cada uma aceita um intervalo de fotografias POR PÁGINA. Acima do máximo, o
 * tema reparte-se por mais páginas (`repartir(n, d)`, o MESMO para o PDF e para
 * o plano das miniaturas); uma página que fique abaixo do mínimo usa a
 * automática.
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
  | { tipo: "mosaico"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "filas"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "destaque"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "grelha"; mosaico: Caixa; celulas: Caixa[] }
  | { tipo: "texto-e-imagem"; mosaico: Caixa; celulas: Caixa[] };

/** As disposições que ela pode escolher num tema (sem escolha: a automática). */
export const DISPOSICOES = [
  "uma-fila",
  "duas-filas",
  "tres-filas",
  "soltas",
  "destaque",
  "grelha",
  "texto-e-imagem",
] as const;
export type Disposicao = (typeof DISPOSICOES)[number];

export const eDisposicao = (v: unknown): v is Disposicao =>
  typeof v === "string" && (DISPOSICOES as readonly string[]).includes(v);

/** Quantas fotografias cabem numa página de cada disposição. */
export const FOTOS_DA_DISPOSICAO: Record<Disposicao, { min: number; max: number }> = {
  "uma-fila": { min: 2, max: 5 },
  "duas-filas": { min: 3, max: 12 },
  "tres-filas": { min: 6, max: 12 },
  soltas: { min: 3, max: 6 },
  destaque: { min: 3, max: 7 },
  grelha: { min: 3, max: 10 },
  "texto-e-imagem": { min: 1, max: 4 },
};

/** Os nomes que ela lê no estúdio. */
export const NOME_DA_DISPOSICAO: Record<Disposicao, string> = {
  "uma-fila": "Uma fila",
  "duas-filas": "Duas filas",
  "tres-filas": "Três filas",
  soltas: "Soltas",
  destaque: "Destaque",
  grelha: "Grelha",
  "texto-e-imagem": "Texto e imagem",
};

/** A disposição gravada num tema, ou `null` (a automática) se não for válida. */
export const disposicaoDoTema = (b: { disposicao?: unknown } | null | undefined) =>
  eDisposicao(b?.disposicao) ? b.disposicao : null;

/** A disposição serve para `n` fotografias (numa página ou repartidas)? */
export const disposicaoServe = (d: Disposicao, n: number) => n >= FOTOS_DA_DISPOSICAO[d].min;

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
export function repartir(n: number, d?: Disposicao | null): number[] {
  const maximo = d && disposicaoServe(d, n) ? FOTOS_DA_DISPOSICAO[d].max : MAXIMO_POR_PAGINA;
  if (n <= maximo) return [n];
  const paginas = Math.ceil(n / maximo);
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
export function composicao(
  aspectos: readonly number[],
  vezPar: boolean,
  disposicao?: Disposicao | null,
): Composicao {
  const n = aspectos.length;
  const d =
    disposicao &&
    n >= FOTOS_DA_DISPOSICAO[disposicao].min &&
    n <= FOTOS_DA_DISPOSICAO[disposicao].max
      ? disposicao
      : null;
  if (d === "uma-fila") return umaFila(aspectos, vezPar);
  if (d === "duas-filas") return duasFilas(aspectos, vezPar);
  if (d === "tres-filas") return tresFilas(aspectos, vezPar);
  if (d === "soltas") return soltas(n);
  if (d === "destaque") return destaque(aspectos, vezPar);
  if (d === "grelha") return grelha(n, vezPar);
  if (d === "texto-e-imagem") return textoEImagem(n, vezPar);

  if (n === 0) return { tipo: "texto" };
  if (n === 1) return { tipo: "inteira", celulas: [{ x: 0, y: 0, w: W, h: H }] };
  if (n <= 3) return umaFila(aspectos, vezPar);
  if (n === 5) return soltas(5);
  return duasFilas(aspectos, vezPar);
}

/** A largura que sobra ao lado do mosaico de texto. */
const AO_LADO = W - LARGURA_DO_MOSAICO - VAO;

/** O mosaico de texto a toda a altura, do lado da vez. */
const mosaicoAlto = (par: boolean, largura = LARGURA_DO_MOSAICO): Caixa => ({
  x: par ? W - largura : 0,
  y: 0,
  w: largura,
  h: H,
});

/** Uma fila a toda a altura; o mosaico do lado da vez. */
function umaFila(aspectos: readonly number[], par: boolean): Composicao {
  const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  return { tipo: "fila", mosaico: mosaicoAlto(par), celulas: fila(aspectos, x0, 0, AO_LADO, H) };
}

/**
 * Soltas: ao alto, lado a lado, desalinhadas em altura. Com cinco são as do
 * exemplo, tal e qual — 174 × 270 a partir da margem de 98, com as alturas
 * (40, 96, 10, 120, 60); com outro número, a mesma forma e o mesmo vão,
 * centradas, sem passar de 220 de largura.
 */
function soltas(n: number): Composicao {
  const desvios = [40, 96, 10, 120, 60, 30];
  const margem = 98;
  const vao = 14;
  const util = W - 2 * margem;
  const w = Math.min(220, Math.floor((util - vao * (n - 1)) / n));
  const h = Math.round((w * 270) / 174);
  const x0 = margem + Math.floor((util - (n * w + vao * (n - 1))) / 2);
  return {
    tipo: "desalinhadas",
    celulas: Array.from({ length: n }, (_, i) => ({
      x: x0 + i * (w + vao),
      y: desvios[i % desvios.length],
      w,
      h,
    })),
  };
}

/** Reparte `n` por `k` filas, as primeiras com a mais. */
function porFilas(n: number, k: number): number[] {
  const base = Math.floor(n / k);
  return Array.from({ length: k }, (_, i) => base + (i < n % k ? 1 : 0));
}

/**
 * Três filas de altura igual ao lado do mosaico de texto, que fica a toda a
 * altura do lado da vez (as «filas» do PDF antigo, nesta folha).
 */
function tresFilas(aspectos: readonly number[], par: boolean): Composicao {
  const h = (H - 2 * VAO) / 3;
  const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  const celulas: Caixa[] = [];
  let i = 0;
  porFilas(aspectos.length, 3).forEach((q, r) => {
    celulas.push(...fila(aspectos.slice(i, i + q), x0, r * (h + VAO), AO_LADO, h));
    i += q;
  });
  return { tipo: "filas", mosaico: mosaicoAlto(par), celulas };
}

/**
 * Destaque: o mosaico de texto, a primeira fotografia (a ★) grande a toda a
 * altura, e as outras numa coluna — uma ao lado da outra em duas colunas
 * quando são mais de três.
 */
function destaque(aspectos: readonly number[], par: boolean): Composicao {
  const resto = aspectos.length - 1;
  const larguraGrande = Math.round(AO_LADO * 0.55);
  const larguraColuna = AO_LADO - larguraGrande - VAO;
  const xTexto = par ? W - LARGURA_DO_MOSAICO : 0;
  // Ímpar: texto | grande | coluna. Par: coluna | grande | texto.
  const xGrande = par ? larguraColuna + VAO : LARGURA_DO_MOSAICO + VAO;
  const xColuna = par ? 0 : xGrande + larguraGrande + VAO;
  const grande: Caixa = { x: xGrande, y: 0, w: larguraGrande, h: H };
  const colunas = resto > 3 ? 2 : 1;
  const linhas = Math.ceil(resto / colunas);
  const hLinha = (H - VAO * (linhas - 1)) / linhas;
  const wCol = (larguraColuna - VAO * (colunas - 1)) / colunas;
  const pequenas: Caixa[] = [];
  for (let k = 0; k < resto; k++) {
    const linha = Math.floor(k / colunas);
    const col = k % colunas;
    // A última linha, se tiver uma só, ocupa a largura toda da coluna.
    const sozinha = colunas === 2 && col === 0 && k === resto - 1;
    pequenas.push({
      x: xColuna + col * (wCol + VAO),
      y: linha * (hLinha + VAO),
      w: sozinha ? larguraColuna : wCol,
      h: hLinha,
    });
  }
  return {
    tipo: "destaque",
    mosaico: { x: xTexto, y: 0, w: LARGURA_DO_MOSAICO, h: H },
    celulas: [grande, ...pequenas],
  };
}

/**
 * Grelha: o «mosaico» do PDF antigo — cortes sucessivos de um rectângulo numa
 * grelha fina de 8 × 8, partindo sempre o maior pedaço pelo lado mais comprido,
 * numa proporção de uma lista fixa. Tamanhos todos diferentes, arestas sempre
 * alinhadas, sem buracos nem sobreposições, e o mesmo número de fotografias dá
 * sempre a mesma página. A maior célula vai para a frente (é a da ★).
 */
const PROPORCOES_DA_GRELHA = [0.58, 0.45, 0.62, 0.5, 0.4, 0.55, 0.48, 0.6, 0.42, 0.52];
const CELULAS_DA_GRELHA = 8;

function grelha(n: number, par: boolean): Composicao {
  let pedacos = [{ cx: 0, cy: 0, cw: CELULAS_DA_GRELHA, ch: CELULAS_DA_GRELHA }];
  let corte = 0;
  while (pedacos.length < n) {
    let iMaior = 0;
    for (let k = 1; k < pedacos.length; k++) {
      if (pedacos[k].cw * pedacos[k].ch > pedacos[iMaior].cw * pedacos[iMaior].ch) iMaior = k;
    }
    const p = pedacos[iMaior];
    const naVertical = p.cw >= p.ch;
    const total = naVertical ? p.cw : p.ch;
    if (total < 2) break;
    const razao = PROPORCOES_DA_GRELHA[corte % PROPORCOES_DA_GRELHA.length];
    corte++;
    const primeiro = Math.min(total - 1, Math.max(1, Math.round(total * razao)));
    const a1 = naVertical
      ? { cx: p.cx, cy: p.cy, cw: primeiro, ch: p.ch }
      : { cx: p.cx, cy: p.cy, cw: p.cw, ch: primeiro };
    const a2 = naVertical
      ? { cx: p.cx + primeiro, cy: p.cy, cw: p.cw - primeiro, ch: p.ch }
      : { cx: p.cx, cy: p.cy + primeiro, cw: p.cw, ch: p.ch - primeiro };
    pedacos = [...pedacos.slice(0, iMaior), a1, a2, ...pedacos.slice(iMaior + 1)];
  }
  const x0 = par ? 0 : LARGURA_DO_MOSAICO + VAO;
  const passoX = (AO_LADO + VAO) / CELULAS_DA_GRELHA;
  const passoY = (H + VAO) / CELULAS_DA_GRELHA;
  const celulas = pedacos.slice(0, n).map((p) => ({
    x: x0 + p.cx * passoX,
    y: p.cy * passoY,
    w: p.cw * passoX - VAO,
    h: p.ch * passoY - VAO,
  }));
  const area = (c: Caixa) => c.w * c.h;
  let iMaior = 0;
  celulas.forEach((c, k) => {
    if (area(c) > area(celulas[iMaior])) iMaior = k;
  });
  [celulas[0], celulas[iMaior]] = [celulas[iMaior], celulas[0]];
  return { tipo: "grelha", mosaico: mosaicoAlto(par), celulas };
}

/**
 * Texto e imagem: o mosaico de texto mais largo (45% da folha), e as
 * fotografias umas por cima das outras do outro lado.
 */
function textoEImagem(n: number, par: boolean): Composicao {
  const larguraTexto = Math.round(W * 0.45);
  const larguraFotos = W - larguraTexto - VAO;
  const x0 = par ? 0 : larguraTexto + VAO;
  const h = (H - VAO * (n - 1)) / n;
  return {
    tipo: "texto-e-imagem",
    mosaico: mosaicoAlto(par, larguraTexto),
    celulas: Array.from({ length: n }, (_, i) => ({ x: x0, y: i * (h + VAO), w: larguraFotos, h })),
  };
}

/**
 * Duas filas de altura igual, o mosaico de texto numa delas — o mosaico
 * automático de 4 e de 6 a 12 fotografias.
 */
function duasFilas(aspectos: readonly number[], vezPar: boolean): Composicao {
  let par = vezPar;
  const n = aspectos.length;
  const alturaFila = (H - VAO) / 2;
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
