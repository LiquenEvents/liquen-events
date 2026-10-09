import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { LADO_PAGINA } from "../imagens";
import { cabecalho, fotoNaCaixa, novaPagina, rectangulo, rodape, type Contexto } from "../moldura";
import {
  COR,
  FOLHA_PX_H,
  FOLHA_PX_W,
  LETRA,
  MARGEM,
  fio,
  hexParaRgb,
  misturaNoFundo,
  px,
} from "../paleta";
import { bloco, caber, escrever, maiusculas, yDoTopo, baseDaLinha, type Estilo } from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «O QUE PROPOMOS» E «A PALETA E O AMBIENTE DO EVENTO»
 * ═══════════════════════════════════════════════════════════════════════════
 */

/* ── O que propomos ──────────────────────────────────────────────────────── */

export interface Servico {
  nome: string;
  /** A descrição que ela escreveu no serviço, se escreveu. */
  descricao: string;
  /** A primeira fotografia do tema que lhe corresponde. */
  foto: Foto | null;
}

export interface DadosDosServicos {
  sobretitulo: string;
  titulo: string;
  /** Os serviços DESTA página (até seis). */
  servicos: readonly Servico[];
  /** O número do primeiro cartão desta página (1, 7, 13…). */
  primeiro: number;
  pagina: number;
}

/** Quantos cartões cabem numa página: duas filas de três. */
export const CARTOES_POR_PAGINA = 6;

const COLUNAS = 3;
const VAO = 20;
const ALTURA_DA_FOTO = 150;
/** O fundo do cartão: `rgba(18,18,20,.75)` sobre o fundo da página, já misturado. */
const FUNDO_DO_CARTAO = hexParaRgb(misturaNoFundo("#121214", 0.75));

/**
 * Um cartão por serviço, com a fotografia, o número e o nome — e a descrição,
 * quando ela a escreveu (o gerador antigo mostra-a, e não se perde).
 *
 * O fundo da página é o escuro liso. O exemplo tem aqui uma fotografia
 * desfocada; a regra dela é que nenhuma página tem fundo desfocado, e a regra
 * ganha ao exemplo.
 */
export async function servicos(ctx: Contexto, d: DadosDosServicos): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const largo = FOLHA_PX_W - 2 * MARGEM;
  let topo = cabecalho(ctx, p, {
    sobretitulo: d.sobretitulo,
    titulo: d.titulo,
    x: MARGEM,
    topo: 52,
    largura: largo,
  });
  topo += 28;

  const col = (largo - VAO * (COLUNAS - 1)) / COLUNAS;
  const num: Estilo = {
    letra: ctx.letras.corpo,
    tam: LETRA.cartaoNumero.tam,
    cor: COR.acento,
    espaco: LETRA.cartaoNumero.espaco,
  };
  const nome: Estilo = { letra: ctx.letras.corpoForte, tam: LETRA.cartaoNome.tam, cor: COR.texto };
  const desc: Estilo = {
    letra: ctx.letras.corpo,
    tam: LETRA.cartaoDescricao.tam,
    cor: COR.textoSuave,
  };
  const temFoto = d.servicos.some((s) => s.foto);
  const larguraTexto = px(col - 28);

  const cartoes = d.servicos.map((s) => {
    const n = caber(nome, s.nome, larguraTexto, 3, 11);
    const ds = s.descricao.trim() ? caber(desc, s.descricao, larguraTexto, 4, desc.tam) : null;
    if (ds?.cortado) {
      ctx.cortes.push({ where: `O que propomos · ${s.nome}`, dropped: ds.cortado, unit: "linhas" });
    }
    const altura =
      (temFoto ? ALTURA_DA_FOTO : 0) +
      12 +
      num.tam * 1.21 +
      4 +
      n.linhas.length * n.estilo.tam * LETRA.cartaoNome.entrelinha +
      (ds ? 6 + ds.linhas.length * desc.tam * LETRA.cartaoDescricao.entrelinha : 0) +
      14;
    return { s, n, ds, altura };
  });

  for (let i = 0; i < cartoes.length; i += COLUNAS) {
    const fila = cartoes.slice(i, i + COLUNAS);
    const altFila = Math.max(...fila.map((c) => c.altura));
    for (const [j, c] of fila.entries()) {
      const x = MARGEM + j * (col + VAO);
      rectangulo(p, { x, y: topo, w: col, h: altFila }, FUNDO_DO_CARTAO, fio(0.22));
      let t = topo;
      if (temFoto) {
        await fotoNaCaixa(ctx, p, c.s.foto, {
          x: x + 1,
          y: topo + 1,
          w: col - 2,
          h: ALTURA_DA_FOTO - 1,
        });
        t += ALTURA_DA_FOTO;
      }
      t += 12;
      escrever(
        p,
        num,
        String(d.primeiro + i + j).padStart(2, "0"),
        px(x + 14),
        yDoTopo(t) - baseDaLinha(num, 1.21),
      );
      t += num.tam * 1.21 + 4;
      t = bloco(p, c.n.estilo, c.n.linhas, x + 14, t, LETRA.cartaoNome.entrelinha);
      if (c.ds) bloco(p, desc, c.ds.linhas, x + 14, t + 6, LETRA.cartaoDescricao.entrelinha);
    }
    topo += altFila + VAO;
  }
  rodape(ctx, p, d.pagina);
  return p;
}

/* ── A paleta e o ambiente ───────────────────────────────────────────────── */

export interface DadosDoAmbiente {
  /** As cinco cores, `#RRGGBB`. */
  cores: readonly string[];
  /** Até seis fotografias para a fila de baixo. */
  fotos: readonly Foto[];
  /** A fotografia do painel da direita. */
  painel: Foto | null;
  pagina: number;
}

/** O painel da direita: 360 px; o texto acaba a 416 da borda. */
const PAINEL_DO_AMBIENTE = { x: FOLHA_PX_W - 360, y: 0, w: 360, h: FOLHA_PX_H };
const FIM_DO_AMBIENTE = FOLHA_PX_W - 416;

export async function ambiente(ctx: Contexto, d: DadosDoAmbiente): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(ctx, p, d.painel, PAINEL_DO_AMBIENTE, {}, LADO_PAGINA);
  const largo = FIM_DO_AMBIENTE - MARGEM;
  let topo = cabecalho(ctx, p, {
    sobretitulo: ctx.te.sobretituloAmbiente,
    titulo: ctx.te.tituloAmbiente,
    subtitulo: ctx.te.subtituloAmbiente,
    x: MARGEM,
    topo: 70,
    largura: largo,
  });
  topo += 30;

  const n = Math.max(1, d.cores.length);
  const vao = 10;
  const larguraCor = (largo - vao * (n - 1)) / n;
  const hex: Estilo = { letra: ctx.letras.corpo, tam: 11, cor: COR.textoBaixo, espaco: 0.08 };
  for (const [i, cor] of d.cores.entries()) {
    const x = MARGEM + i * (larguraCor + vao);
    rectangulo(p, { x, y: topo, w: larguraCor, h: 190 }, hexParaRgb(cor as `#${string}`));
    escrever(p, hex, maiusculas(cor), px(x), yDoTopo(topo + 190 + 8) - baseDaLinha(hex, 1.21));
  }
  topo += 190 + 8 + 11 * 1.21 + 22;

  // A fila das fotografias: 92 × 134, com 8 px entre elas.
  await Promise.all(
    d.fotos
      .slice(0, 6)
      .map((f, i) => fotoNaCaixa(ctx, p, f, { x: MARGEM + i * (92 + 8), y: topo, w: 92, h: 134 })),
  );
  rodape(ctx, p, d.pagina, MARGEM, FIM_DO_AMBIENTE);
  return p;
}
