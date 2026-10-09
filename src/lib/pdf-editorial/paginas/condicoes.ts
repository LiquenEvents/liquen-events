import "server-only";
import type { PDFPage } from "pdf-lib";
import { desenharColuna, type Peca } from "../colunas";
import type { Foto } from "../fotos";
import { LADO_PAGINA } from "../imagens";
import {
  FUNDO_DO_CONTEUDO,
  cabecalho,
  fotoNaCaixa,
  novaPagina,
  rodape,
  type Contexto,
} from "../moldura";
import { COR, FOLHA_PX_H, FOLHA_PX_W, LETRA, MARGEM, px } from "../paleta";
import { caber } from "../texto";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DE TEXTO EM COLUNAS — condições, pagamento, cronograma
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fundo escuro liso, uma faixa de fotografia nítida à direita (230 px), e o
 * texto em duas ou três colunas, como no exemplo. O conteúdo vem já repartido
 * (`colunas.ts`): esta página só desenha o que lhe calhou.
 */

/** A faixa de fotografia à direita: 230 px; o texto acaba a 286 da borda. */
export const FAIXA = 230;
export const FIM_DO_TEXTO = FOLHA_PX_W - (FAIXA + 56);
export const LARGURA_DO_TEXTO = FIM_DO_TEXTO - MARGEM;
const TOPO = 48;
const AR_ATE_AS_COLUNAS = 20;

export interface DadosDaPaginaDeColunas {
  sobretitulo: string;
  titulo: string;
  colunas: readonly (readonly Peca[])[];
  /** O intervalo entre colunas (28 em três, 50 em duas). */
  vao: number;
  faixa: Foto | null;
  pagina: number;
}

/** A largura de cada coluna, para `n` colunas com `vao` entre elas. */
export const larguraDaColuna = (n: number, vao: number) => (LARGURA_DO_TEXTO - vao * (n - 1)) / n;

/** A altura que sobra para as colunas, depois do cabeçalho. */
export function alturaDasColunas(ctx: Contexto, titulo: string): number {
  const L = LETRA.tituloConteudo;
  const t = caber(
    { letra: ctx.letras.titulo, tam: L.tam, cor: COR.texto },
    titulo,
    px(LARGURA_DO_TEXTO),
    2,
    Math.round(L.tam * 0.7),
  );
  const fimDoCabecalho =
    TOPO + LETRA.sobretitulo.tam * 1.21 + 10 + t.linhas.length * t.estilo.tam * L.entrelinha;
  return FUNDO_DO_CONTEUDO - (fimDoCabecalho + AR_ATE_AS_COLUNAS);
}

export async function paginaDeColunas(ctx: Contexto, d: DadosDaPaginaDeColunas): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(
    ctx,
    p,
    d.faixa,
    { x: FOLHA_PX_W - FAIXA, y: 0, w: FAIXA, h: FOLHA_PX_H },
    {},
    LADO_PAGINA,
  );
  const topo =
    cabecalho(ctx, p, {
      sobretitulo: d.sobretitulo,
      titulo: d.titulo,
      x: MARGEM,
      topo: TOPO,
      largura: LARGURA_DO_TEXTO,
    }) + AR_ATE_AS_COLUNAS;
  const n = Math.max(1, d.colunas.length);
  const col = larguraDaColuna(n, d.vao);
  d.colunas.forEach((pecas, i) => {
    desenharColuna(ctx, p, pecas, MARGEM + i * (col + d.vao), topo, col);
  });
  rodape(ctx, p, d.pagina, MARGEM, FIM_DO_TEXTO);
  return p;
}

/**
 * Um título de secção da casa como o exemplo o escreve: só a primeira letra
 * em maiúscula e sem os dois pontos — «Próximos Passos» → «Próximos passos»,
 * «Incluído na proposta:» → «Incluído na proposta». As PALAVRAS são as do
 * dicionário; muda só a caixa, que é desenho.
 */
export function comoTitulo(texto: string): string {
  const t = texto.trim().replace(/:$/, "");
  return t.charAt(0) + t.slice(1).toLocaleLowerCase("pt-PT");
}
