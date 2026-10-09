import "server-only";
import type { PDFPage } from "pdf-lib";
import { LADO_FUNDO, paginaInteira, preparar } from "../imagens";
import {
  FOLHA,
  imagemNaCaixa,
  linha,
  novaPagina,
  rodape,
  sobretitulo,
  type Contexto,
} from "../moldura";
import { COR, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import {
  baseDaLinha,
  bloco,
  caber,
  escrever,
  escreverADireita,
  largura,
  maiusculas,
  yDoTopo,
  type Estilo,
} from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DE TEXTO SOBRE FOTOGRAFIA — índice e «A proposta»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O tipo de página «fotografia de fundo com texto ao lado» do kit dela: uma
 * foto da própria proposta, desfocada e escurecida até o texto se ler como em
 * papel escuro, e o texto por cima. O escurecimento está fundido na imagem.
 *
 * O bloco de texto fica centrado na vertical na área acima do rodapé
 * (`.mid { height: 724px; justify-content: center }`).
 */

/** A altura onde o texto se centra: a folha menos a faixa do rodapé. */
const ALTURA_UTIL = 724;

/** Um fundo de página de texto: desfocado e escurecido por igual. */
export async function fundoDeTexto(foto: Buffer): Promise<Buffer | null> {
  const { w, h } = paginaInteira(LADO_FUNDO);
  return preparar(foto, w, h, FOLHA_PX_W, {
    desfoque: 6,
    brilho: 0.66,
    degrades: [
      {
        de: [0, 0],
        para: [0, 1],
        paragens: [
          { em: 0, cobre: 0.66 },
          { em: 1, cobre: 0.74 },
        ],
      },
    ],
  });
}

async function fundo(ctx: Contexto, p: PDFPage, foto: Buffer | null, origem: string) {
  if (foto) await imagemNaCaixa(ctx, p, await fundoDeTexto(foto), FOLHA, origem);
}

const estiloTitulo = (ctx: Contexto, tam: number = LETRA.titulo.tam): Estilo => ({
  letra: ctx.letras.titulo,
  tam,
  cor: COR.texto,
  espaco: -0.01,
});

/* ── Índice ──────────────────────────────────────────────────────────────── */

export interface EntradaDoIndice {
  titulo: string;
  pagina: number;
}

export interface DadosDoIndice {
  sobretitulo: string;
  titulo: string;
  entradas: readonly EntradaDoIndice[];
  foto: Buffer | null;
  origem: string;
  numero: number;
}

/** A coluna do índice começa a 420 px, como no exemplo. */
const INDICE_X = MARGEM + 420;

export async function indice(ctx: Contexto, d: DadosDoIndice): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundo(ctx, p, d.foto, d.origem);

  const tit = estiloTitulo(ctx, 44);
  const linhaE: Estilo = { letra: ctx.letras.corpo, tam: LETRA.indice.tam, cor: COR.texto };
  const numE: Estilo = { ...linhaE, letra: ctx.letras.corpoForte, cor: COR.acento };
  const pagE: Estilo = { ...linhaE, cor: COR.textoBaixo };
  const altLinha = 13 + LETRA.indice.tam * 1.21 + 13 + 1;
  const altura =
    LETRA.sobretitulo.tam * 1.21 +
    14 +
    tit.tam * LETRA.titulo.entrelinha +
    30 +
    d.entradas.length * altLinha;
  let topo = Math.max(60, (ALTURA_UTIL - altura) / 2);

  topo = sobretitulo(ctx, p, d.sobretitulo, INDICE_X, topo) + 14;
  topo = bloco(p, tit, [d.titulo], INDICE_X, topo, LETRA.titulo.entrelinha) + 30;

  const xFim = FOLHA_PX_W - MARGEM;
  for (const [i, en] of d.entradas.entries()) {
    const y = yDoTopo(topo + 13) - baseDaLinha(linhaE, 1.21);
    escrever(p, numE, String(i + 1).padStart(2, "0"), px(INDICE_X), y);
    const pag = String(en.pagina).padStart(2, "0");
    escreverADireita(p, pagE, pag, px(xFim), y);
    const livre = px(xFim - INDICE_X - 26 - 18 - 18) - largura(pagE, pag);
    let t = en.titulo;
    while (t.length > 1 && largura(linhaE, t) > livre) t = t.slice(0, -1);
    if (t !== en.titulo) t = `${t.trimEnd()}…`;
    escrever(p, linhaE, t, px(INDICE_X + 26 + 18), y);
    topo += altLinha;
    linha(p, INDICE_X, xFim, topo, 0.2);
  }
  rodape(ctx, p, d.numero);
  return p;
}

/* ── A proposta ──────────────────────────────────────────────────────────── */

export interface DadosDaApresentacao {
  sobretitulo: string;
  titulo: string;
  /** Os factos, já sem os vazios, pela ordem em que aparecem. */
  factos: readonly { rotulo: string; valor: string }[];
  foto: Buffer | null;
  origem: string;
  numero: number;
}

/** A grelha dos factos: quatro colunas com 22 px entre elas (`.kf`). */
const COLUNAS = 4;
const VAO = 22;

export async function apresentacao(ctx: Contexto, d: DadosDaApresentacao): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fundo(ctx, p, d.foto, d.origem);

  const larguraUtil = FOLHA_PX_W - 2 * MARGEM;
  const col = (larguraUtil - VAO * (COLUNAS - 1)) / COLUNAS;
  const tit = caber(estiloTitulo(ctx), d.titulo, px(760), 2, 34);
  const rot: Estilo = {
    letra: ctx.letras.corpoForte,
    tam: LETRA.factoRotulo.tam,
    cor: COR.acento,
    espaco: LETRA.factoRotulo.espaco,
  };
  const val: Estilo = {
    letra: ctx.letras.corpoForte,
    tam: LETRA.factoValor.tam,
    cor: COR.texto,
    espaco: -0.01,
  };
  const altVal = val.tam * LETRA.factoValor.entrelinha;

  // As linhas da grelha, com os valores já partidos: a altura de cada fila é a
  // do valor mais alto dela.
  const filas: { rotulo: string; linhas: string[] }[][] = [];
  for (let i = 0; i < d.factos.length; i += COLUNAS) {
    filas.push(
      d.factos.slice(i, i + COLUNAS).map((f) => {
        const c = caber(val, f.valor, px(col), 3, val.tam);
        if (c.cortado)
          ctx.cortes.push({
            where: `A proposta · ${f.rotulo}`,
            dropped: c.cortado,
            unit: "linhas",
          });
        return { rotulo: f.rotulo, linhas: c.linhas };
      }),
    );
  }
  const altFila = (f: (typeof filas)[number]) =>
    1 + 16 + rot.tam * 1.21 + 10 + Math.max(...f.map((c) => c.linhas.length)) * altVal;
  const altura =
    LETRA.sobretitulo.tam * 1.21 +
    14 +
    tit.linhas.length * tit.estilo.tam * LETRA.titulo.entrelinha +
    filas.reduce((s, f, i) => s + (i === 0 ? 44 : 26) + altFila(f), 0);
  let topo = Math.max(60, (ALTURA_UTIL - altura) / 2);

  topo = sobretitulo(ctx, p, d.sobretitulo, MARGEM, topo) + 14;
  topo = bloco(p, tit.estilo, tit.linhas, MARGEM, topo, LETRA.titulo.entrelinha);

  for (const [i, fila] of filas.entries()) {
    topo += i === 0 ? 44 : 26;
    for (const [j, c] of fila.entries()) {
      const x = MARGEM + j * (col + VAO);
      linha(p, x, x + col, topo, 0.4);
      const yRot = yDoTopo(topo + 17) - baseDaLinha(rot, 1.21);
      escrever(p, rot, maiusculas(c.rotulo), px(x), yRot);
      bloco(p, val, c.linhas, x, topo + 17 + rot.tam * 1.21 + 10, LETRA.factoValor.entrelinha);
    }
    topo += altFila(fila);
  }
  rodape(ctx, p, d.numero);
  return p;
}
