import "server-only";
import type { PDFPage } from "pdf-lib";
import { linha, sobretitulo, type Contexto } from "./moldura";
import { COR, LETRA, px } from "./paleta";
import { baseDaLinha, escrever, largura, limpo, quebrar, yDoTopo, type Estilo } from "./texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TEXTO EM COLUNAS QUE CONTINUA NA PÁGINA SEGUINTE — as condições
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As condições são texto contratual: saem SEMPRE, inteiras, palavra por
 * palavra. Por isso aqui não há corte nenhum — o que não cabe numa coluna
 * passa para a página seguinte, com o título da secção repetido e «(cont.)».
 *
 * Uma página é um conjunto de colunas; cada coluna é uma lista de peças
 * (títulos `h3`, pontos `li`, contactos). As peças medem-se antes de se
 * desenhar, para a repartição ser decidida inteira — um título nunca fica
 * sozinho no fundo de uma coluna sem o primeiro ponto por baixo.
 */

export type Peca =
  | { tipo: "h3"; texto: string }
  /** Um ponto da lista; `forte` é o princípio a negro («Sinal 30% · 1.350,54 €»). */
  | { tipo: "item"; texto: string; forte?: string }
  | { tipo: "contacto"; rotulo: string; valor: string };

const ITEM = LETRA.item;
const H3 = LETRA.h3;
/** `li { padding: 7px 0 }` e o fio de baixo. */
const ENCHIMENTO = 7;
const AR_ANTES_DO_H3 = 20;
const AR_DEPOIS_DO_H3 = 10;

const estilos = (ctx: Contexto) => ({
  h3: { letra: ctx.letras.corpoForte, tam: H3.tam, cor: COR.texto } satisfies Estilo,
  item: { letra: ctx.letras.corpo, tam: ITEM.tam, cor: COR.textoLead } satisfies Estilo,
  forte: { letra: ctx.letras.corpoForte, tam: ITEM.tam, cor: COR.texto } satisfies Estilo,
  rotulo: {
    letra: ctx.letras.corpoForte,
    tam: 10,
    cor: COR.acento,
    espaco: LETRA.sobretitulo.espaco,
  } satisfies Estilo,
});

/** Uma linha de texto feita de corridas em letras diferentes. */
type Corrida = { texto: string; estilo: Estilo };

/**
 * Parte um ponto com princípio a negro em linhas, palavra a palavra, sem
 * perder qual palavra vai a negro.
 */
function linhasDoItem(ctx: Contexto, p: Extract<Peca, { tipo: "item" }>, max: number): Corrida[][] {
  const e = estilos(ctx);
  const palavras: Corrida[] = [
    ...(p.forte ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ texto: w, estilo: e.forte })),
    ...p.texto
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => ({ texto: w, estilo: e.item })),
  ];
  if (!p.forte) return quebrar(e.item, p.texto, max).map((l) => [{ texto: l, estilo: e.item }]);
  const linhas: Corrida[][] = [];
  let atual: Corrida[] = [];
  let usado = 0;
  for (const w of palavras) {
    const espaco = atual.length ? largura(w.estilo, " ") : 0;
    const lw = largura(w.estilo, w.texto);
    if (atual.length && usado + espaco + lw > max) {
      linhas.push(atual);
      atual = [];
      usado = 0;
    }
    atual.push(w);
    usado += (atual.length > 1 ? espaco : 0) + lw;
  }
  if (atual.length) linhas.push(atual);
  return linhas;
}

/** A altura de uma peça, em píxeis do exemplo. */
export function alturaDaPeca(ctx: Contexto, p: Peca, larguraPx: number, primeira: boolean): number {
  const e = estilos(ctx);
  if (p.tipo === "h3") {
    const n = quebrar(e.h3, p.texto, px(larguraPx)).length;
    return (primeira ? 0 : AR_ANTES_DO_H3) + n * H3.tam * H3.entrelinha + AR_DEPOIS_DO_H3;
  }
  if (p.tipo === "contacto") return 2 * ENCHIMENTO + ITEM.tam * ITEM.entrelinha + 1;
  const n = linhasDoItem(ctx, p, px(larguraPx)).length;
  return 2 * ENCHIMENTO + n * ITEM.tam * ITEM.entrelinha + 1;
}

/**
 * Reparte uma lista de peças em pedaços que cabem em `altura`.
 *
 * Um título nunca fica no fim de um pedaço sem o ponto seguinte. Quando uma
 * secção continua no pedaço seguinte, o pedaço abre com o título dela e
 * «(cont.)», para quem vira a página saber o que está a ler.
 */
export function repartir(
  ctx: Contexto,
  pecas: readonly Peca[],
  larguraPx: number,
  altura: number,
): Peca[][] {
  const pedacos: Peca[][] = [];
  let atual: Peca[] = [];
  let usado = 0;
  let tituloAtual: string | null = null;
  const fecha = () => {
    pedacos.push(atual);
    atual = [];
    usado = 0;
  };
  for (let i = 0; i < pecas.length; i++) {
    const p = pecas[i];
    if (p.tipo === "h3") tituloAtual = p.texto;
    let h = alturaDaPeca(ctx, p, larguraPx, atual.length === 0);
    // Um título leva consigo o primeiro ponto.
    const seguinte = pecas[i + 1];
    const precisa =
      p.tipo === "h3" && seguinte && seguinte.tipo !== "h3"
        ? h + alturaDaPeca(ctx, seguinte, larguraPx, false)
        : h;
    if (atual.length && usado + precisa > altura) {
      fecha();
      if (p.tipo !== "h3" && tituloAtual) {
        const cont: Peca = { tipo: "h3", texto: `${tituloAtual} ${ctx.te.continuacao}` };
        atual.push(cont);
        usado += alturaDaPeca(ctx, cont, larguraPx, true);
      }
      h = alturaDaPeca(ctx, p, larguraPx, atual.length === 0);
    }
    atual.push(p);
    usado += h;
  }
  if (atual.length) pedacos.push(atual);
  return pedacos;
}

/**
 * Colunas FIXAS: cada coluna tem o seu conteúdo e continua na mesma coluna da
 * página seguinte. Devolve as páginas, cada uma com as suas colunas.
 */
export function paginarColunasFixas(
  ctx: Contexto,
  colunas: readonly (readonly Peca[])[],
  larguraPx: number,
  altura: number,
): Peca[][][] {
  const pedacos = colunas.map((c) => repartir(ctx, c, larguraPx, altura));
  const paginas = Math.max(1, ...pedacos.map((p) => p.length));
  return Array.from({ length: paginas }, (_, i) => pedacos.map((p) => p[i] ?? []));
}

/**
 * Uma lista CORRIDA por `n` colunas: enche a primeira, depois a segunda, e só
 * depois passa à página seguinte.
 */
export function paginarCorrido(
  ctx: Contexto,
  pecas: readonly Peca[],
  n: number,
  larguraPx: number,
  altura: number,
): Peca[][][] {
  const pedacos = repartir(ctx, pecas, larguraPx, altura);
  const paginas: Peca[][][] = [];
  for (let i = 0; i < pedacos.length; i += n) paginas.push(pedacos.slice(i, i + n));
  return paginas.length ? paginas : [[]];
}

/**
 * Para duas colunas de uma lista que cabe numa página só: reparte-a ao meio
 * pela ALTURA, e não pela contagem — a coluna da direita não fica com metade
 * dos pontos e um terço do texto.
 */
export function aoMeio(ctx: Contexto, pecas: readonly Peca[], larguraPx: number): number {
  const alturas = pecas.map((p, i) => alturaDaPeca(ctx, p, larguraPx, i === 0));
  const total = alturas.reduce((s, h) => s + h, 0);
  let acc = 0;
  for (let i = 0; i < alturas.length; i++) {
    acc += alturas[i];
    if (acc >= total / 2) return Math.max(1, i + 1);
  }
  return pecas.length;
}

/** Desenha uma coluna a partir de `topo`. Devolve onde acabou. */
export function desenharColuna(
  ctx: Contexto,
  pagina: PDFPage,
  pecas: readonly Peca[],
  x: number,
  topo: number,
  larguraPx: number,
): number {
  const e = estilos(ctx);
  for (const [i, p] of pecas.entries()) {
    if (p.tipo === "h3") {
      if (i > 0) topo += AR_ANTES_DO_H3;
      for (const l of quebrar(e.h3, p.texto, px(larguraPx))) {
        escrever(pagina, e.h3, l, px(x), yDoTopo(topo) - baseDaLinha(e.h3, H3.entrelinha));
        topo += H3.tam * H3.entrelinha;
      }
      topo += AR_DEPOIS_DO_H3;
      continue;
    }
    topo += ENCHIMENTO;
    if (p.tipo === "contacto") {
      const y = yDoTopo(topo) - baseDaLinha(e.item, ITEM.entrelinha);
      sobretituloEmLinha(ctx, pagina, p.rotulo, x, topo);
      escrever(pagina, { ...e.item, cor: COR.texto }, p.valor, px(x + 74), y);
      topo += ITEM.tam * ITEM.entrelinha;
    } else {
      for (const corridas of linhasDoItem(ctx, p, px(larguraPx))) {
        const y = yDoTopo(topo) - baseDaLinha(e.item, ITEM.entrelinha);
        let cx = px(x);
        for (const [k, c] of corridas.entries()) {
          if (k) cx += largura(c.estilo, " ");
          escrever(pagina, c.estilo, c.texto, cx, y);
          cx += largura(c.estilo, limpo(c.estilo.letra, c.texto));
        }
        topo += ITEM.tam * ITEM.entrelinha;
      }
    }
    topo += ENCHIMENTO;
    linha(pagina, x, x + larguraPx, topo, 0.16);
    topo += 1;
  }
  return topo;
}

/** O rótulo dourado de um contacto («EMAIL»), alinhado com o valor. */
function sobretituloEmLinha(
  ctx: Contexto,
  pagina: PDFPage,
  texto: string,
  x: number,
  topo: number,
) {
  // A linha do item é de 12,5 × 1,5; o rótulo de 10 px centra-se nela.
  const desce = (ITEM.tam * ITEM.entrelinha - 10 * 1.21) / 2;
  sobretitulo(ctx, pagina, texto, x, topo + desce, COR.acento, 10);
}
