import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { LADO_PAGINA, type Tratamento } from "../imagens";
import {
  FOLHA,
  FUNDO_DO_CONTEUDO,
  fotoNaCaixa,
  linha,
  novaPagina,
  rodape,
  sobretitulo,
  type Contexto,
} from "../moldura";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
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
 * O ÍNDICE E «A PROPOSTA» — fotografia NÍTIDA, nunca um fundo desfocado
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As duas tinham uma fotografia desfocada e acinzentada a encher a página. A
 * regra dela, com o exemplo novo à frente: «nenhuma página é só texto sobre
 * fundo desfocado». O índice passa a ter um painel de fotografia nítida a toda
 * a altura, à esquerda; «A proposta» uma fotografia nítida a página inteira,
 * escurecida só do lado do texto (o degradé está fundido na imagem).
 */

/** Centra um bloco de `altura` na área acima do rodapé (`.mid`). */
const centrado = (altura: number) => Math.max(48, (FUNDO_DO_CONTEUDO - altura) / 2);

const estiloTitulo = (ctx: Contexto, tam: number): Estilo => ({
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
  foto: Foto | null;
  numero: number;
}

/** O painel do índice: 440 px a toda a altura; o texto começa a 496. */
const PAINEL_DO_INDICE = { x: 0, y: 0, w: 440, h: FOLHA_PX_H };
const INDICE_X = 496;

export async function indice(ctx: Contexto, d: DadosDoIndice): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(ctx, p, d.foto, PAINEL_DO_INDICE, {}, LADO_PAGINA);

  const tit = estiloTitulo(ctx, LETRA.titulo.tam);
  const linhaE: Estilo = { letra: ctx.letras.corpo, tam: LETRA.indice.tam, cor: COR.texto };
  const numE: Estilo = { ...linhaE, letra: ctx.letras.corpoForte, cor: COR.acento };
  const pagE: Estilo = { ...linhaE, cor: COR.textoBaixo };
  const altLinha = 14 + LETRA.indice.tam * 1.21 + 14 + 1;
  const xFim = FOLHA_PX_W - MARGEM;
  const altura =
    LETRA.sobretitulo.tam * 1.21 +
    14 +
    tit.tam * LETRA.titulo.entrelinha +
    30 +
    d.entradas.length * altLinha;
  let topo = centrado(altura);

  topo = sobretitulo(ctx, p, d.sobretitulo, INDICE_X, topo) + 14;
  const t = caber(tit, d.titulo, px(xFim - INDICE_X), 2, 30);
  topo = bloco(p, t.estilo, t.linhas, INDICE_X, topo, LETRA.titulo.entrelinha) + 30;

  for (const [i, en] of d.entradas.entries()) {
    const y = yDoTopo(topo + 14) - baseDaLinha(linhaE, 1.21);
    escrever(p, numE, String(i + 1).padStart(2, "0"), px(INDICE_X), y);
    const pag = String(en.pagina).padStart(2, "0");
    escreverADireita(p, pagE, pag, px(xFim), y);
    const livre = px(xFim - INDICE_X - 26 - 18 - 18) - largura(pagE, pag);
    let texto = en.titulo;
    while (texto.length > 1 && largura(linhaE, texto) > livre) texto = texto.slice(0, -1);
    if (texto !== en.titulo) texto = `${texto.trimEnd()}…`;
    escrever(p, linhaE, texto, px(INDICE_X + 26 + 18), y);
    topo += altLinha;
    linha(p, INDICE_X, xFim, topo, 0.2);
  }
  rodape(ctx, p, d.numero, INDICE_X);
  return p;
}

/* ── A proposta ──────────────────────────────────────────────────────────── */

export interface DadosDaApresentacao {
  sobretitulo: string;
  titulo: string;
  /** Os factos, já sem os vazios, pela ordem em que aparecem. */
  factos: readonly { rotulo: string; valor: string }[];
  foto: Foto | null;
  numero: number;
}

/** A coluna do texto: 560 px a partir da margem. */
const COLUNA = 560;
const VAO_H = 30;
const VAO_V = 20;

/** A fotografia nítida, escurecida só do lado do texto (≈ 60% da largura). */
export const ESCURO_A_ESQUERDA: Tratamento = {
  degrades: [
    {
      de: [0, 0],
      para: [1, 0],
      paragens: [
        { em: 0, cobre: 0.86 },
        { em: 0.5, cobre: 0.72 },
        { em: 0.72, cobre: 0.2 },
        { em: 1, cobre: 0.05 },
      ],
    },
  ],
};

export async function apresentacao(ctx: Contexto, d: DadosDaApresentacao): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(ctx, p, d.foto, FOLHA, ESCURO_A_ESQUERDA, LADO_PAGINA);

  const L = LETRA.tituloProposta;
  const tit = caber(estiloTitulo(ctx, L.tam), d.titulo, px(COLUNA), 3, 34);
  const rot: Estilo = {
    letra: ctx.letras.corpoForte,
    tam: LETRA.factoRotulo.tam,
    cor: COR.acento,
    espaco: LETRA.factoRotulo.espaco,
  };
  const val: Estilo = { letra: ctx.letras.corpoForte, tam: LETRA.factoValor.tam, cor: COR.texto };
  const altVal = val.tam * LETRA.factoValor.entrelinha;
  const col = (COLUNA - VAO_H) / 2;

  // A grelha de duas colunas; cada fila tem a altura do valor mais alto.
  const filas: { rotulo: string; linhas: string[] }[][] = [];
  for (let i = 0; i < d.factos.length; i += 2) {
    filas.push(
      d.factos.slice(i, i + 2).map((f) => {
        const c = caber(val, f.valor, px(col), 3, val.tam);
        if (c.cortado) {
          ctx.cortes.push({
            where: `A proposta · ${f.rotulo}`,
            dropped: c.cortado,
            unit: "linhas",
          });
        }
        return { rotulo: f.rotulo, linhas: c.linhas };
      }),
    );
  }
  const altFila = (f: (typeof filas)[number]) =>
    1 + 12 + rot.tam * 1.21 + 7 + Math.max(...f.map((c) => c.linhas.length)) * altVal;
  const altura =
    LETRA.sobretitulo.tam * 1.21 +
    14 +
    tit.linhas.length * tit.estilo.tam * L.entrelinha +
    38 +
    filas.reduce((s, f, i) => s + (i ? VAO_V : 0) + altFila(f), 0);
  let topo = centrado(altura);

  topo = sobretitulo(ctx, p, d.sobretitulo, MARGEM, topo) + 14;
  topo = bloco(p, tit.estilo, tit.linhas, MARGEM, topo, L.entrelinha) + 38;
  for (const [i, fila] of filas.entries()) {
    if (i) topo += VAO_V;
    for (const [j, c] of fila.entries()) {
      const x = MARGEM + j * (col + VAO_H);
      linha(p, x, x + col, topo, 0.4);
      escrever(p, rot, maiusculas(c.rotulo), px(x), yDoTopo(topo + 13) - baseDaLinha(rot, 1.21));
      bloco(p, val, c.linhas, x, topo + 13 + rot.tam * 1.21 + 7, LETRA.factoValor.entrelinha);
    }
    topo += altFila(fila);
  }
  rodape(ctx, p, d.numero);
  return p;
}
