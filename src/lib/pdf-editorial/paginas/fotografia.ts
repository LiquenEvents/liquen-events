import "server-only";
import type { PDFPage } from "pdf-lib";
import { LADO_PAGINA, paginaInteira, preparar, tiras } from "../imagens";
import { FOLHA, imagemNaCaixa, novaPagina, sobretitulo, type Contexto } from "../moldura";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import { bloco, caber, type Estilo } from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS QUE SÃO SÓ FOTOGRAFIA — separador e citação
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem rodapé, como no exemplo: são as pausas do documento. O texto assenta em
 * baixo, à esquerda, sobre um degradé que sobe do fundo — fundido na imagem.
 */

/** O degradé de baixo dos separadores: a foto limpa em cima, escura em baixo. */
const DE_BAIXO = {
  de: [0, 0] as const,
  para: [0, 1] as const,
  paragens: [
    { em: 0.4, cobre: 0 },
    { em: 0.75, cobre: 0.45 },
    { em: 1, cobre: 0.85 },
  ],
};

export interface DadosDoSeparador {
  /** «02 · Inspiração». */
  sobretitulo: string;
  /** «Cerimónia». */
  titulo: string;
  /** Até quatro fotos do capítulo, em tiras verticais. */
  fotos: readonly Buffer[];
  origens: readonly string[];
}

/** O intervalo entre as tiras: «4 a 6 px», no documento dela. */
const FENDA = 4;

/** Quantas tiras tem o separador do exemplo. */
export const TIRAS_DO_SEPARADOR = 4;

export async function separador(ctx: Contexto, d: DadosDoSeparador): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const { w, h } = paginaInteira(LADO_PAGINA);
  const fotos = d.fotos.slice(0, TIRAS_DO_SEPARADOR);
  if (fotos.length) {
    const jpeg = await tiras(fotos, w, h, FENDA, { degrades: [DE_BAIXO], qualidade: 70 });
    await imagemNaCaixa(ctx, p, jpeg, FOLHA, d.origens[0] ?? "separador");
  }
  const tit: Estilo = {
    letra: ctx.letras.titulo,
    tam: LETRA.tituloSeparador.tam,
    cor: COR.texto,
    espaco: -0.01,
  };
  const { estilo, linhas } = caber(tit, d.titulo, px(FOLHA_PX_W - 2 * MARGEM), 2, 36);
  const entrelinha = 1.06;
  const altTitulo = linhas.length * estilo.tam * entrelinha;
  // Assenta a 66 px do fundo (`bottom: 66px`).
  const topoTitulo = FOLHA_PX_H - 66 - altTitulo;
  const topoSobre = topoTitulo - 10 - LETRA.sobretitulo.tam * 1.21;
  sobretitulo(ctx, p, d.sobretitulo, MARGEM, topoSobre);
  bloco(p, estilo, linhas, MARGEM, topoTitulo, entrelinha);
  return p;
}

/* ── Citação ─────────────────────────────────────────────────────────────── */

export interface DadosDaCitacao {
  /** «Decoramos eventos, eternizamos memórias.» */
  frase: string;
  /** As aspas da língua: «» em português, “” em inglês. */
  aspas: readonly [string, string];
  /** «Líquen Events». */
  assinatura: string;
  foto: Buffer;
  origem: string;
}

/**
 * A foto inteira, escurecida SÓ NA BASE — é o que ela pede para esta página: a
 * fotografia fica intacta, e o degradé só existe onde a frase assenta.
 */
async function fundoDaCitacao(foto: Buffer) {
  const { w, h } = paginaInteira(LADO_PAGINA);
  return preparar(foto, w, h, FOLHA_PX_W, {
    qualidade: 74,
    degrades: [
      {
        de: [0, 0],
        para: [0, 1],
        paragens: [
          { em: 0.4, cobre: 0 },
          { em: 0.75, cobre: 0.5 },
          { em: 1, cobre: 0.82 },
        ],
      },
    ],
  });
}

export async function citacao(ctx: Contexto, d: DadosDaCitacao): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await imagemNaCaixa(ctx, p, await fundoDaCitacao(d.foto), FOLHA, d.origem);
  const c = LETRA.citacao;
  const e: Estilo = { letra: ctx.letras.tituloItalico, tam: c.tam, cor: COR.texto };
  // A quebra do exemplo é depois da vírgula: «Decoramos eventos, / eternizamos
  // memórias.» Se a frase não tiver vírgula, parte-se pela largura.
  const [abre, fecha] = d.aspas;
  const virgula = d.frase.indexOf(", ");
  const texto =
    virgula > 0
      ? `${abre}${d.frase.slice(0, virgula + 1)}\n${d.frase.slice(virgula + 2)}${fecha}`
      : `${abre}${d.frase}${fecha}`;
  const { estilo, linhas } = caber(e, texto, px(FOLHA_PX_W - 2 * MARGEM), 3, 34);
  const altFrase = linhas.length * estilo.tam * c.entrelinha;
  const altAssin = LETRA.sobretitulo.tam * 1.21;
  // Assenta a 84 px do fundo.
  const topo = FOLHA_PX_H - 84 - altAssin - 18 - altFrase;
  const fim = bloco(p, estilo, linhas, MARGEM, topo, c.entrelinha);
  sobretitulo(ctx, p, d.assinatura, MARGEM, fim + 18);
  return p;
}
