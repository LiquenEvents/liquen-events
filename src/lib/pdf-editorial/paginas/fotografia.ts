import "server-only";
import type { PDFPage } from "pdf-lib";
import type { Foto } from "../fotos";
import { LADO_PAGINA, type Degrade, type Tratamento } from "../imagens";
import { FOLHA, fotoNaCaixa, novaPagina, sobretitulo, type Contexto } from "../moldura";
import { VAO } from "../mosaico";
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

/** O degradé de baixo: a foto limpa em cima, escura em baixo. */
export const DE_BAIXO: Degrade = {
  de: [0, 0],
  para: [0, 1],
  paragens: [
    { em: 0.45, cobre: 0 },
    { em: 0.78, cobre: 0.5 },
    { em: 1, cobre: 0.86 },
  ],
};

export interface DadosDoSeparador {
  /** «02 · Inspiração», ou «06» no investimento. */
  sobretitulo: string;
  /** «Cerimónia». */
  titulo: string;
  /** As duas fotografias, lado a lado. Com uma só, a página inteira. */
  fotos: readonly Foto[];
}

/**
 * O separador do exemplo novo: DUAS fotografias grandes lado a lado, com 4 px
 * entre elas, e o nome do capítulo a 72 px. Eram quatro tiras estreitas; ela
 * comparou com o exemplo e pediu as duas grandes — as de maior resolução do
 * grupo, que é o que `montar.ts` lhe passa.
 */
export async function separador(ctx: Contexto, d: DadosDoSeparador): Promise<PDFPage> {
  const p = novaPagina(ctx);
  const fotos = d.fotos.slice(0, 2);
  const t: Tratamento = { degrades: [DE_BAIXO], qualidade: 72 };
  if (fotos.length === 1) {
    await fotoNaCaixa(ctx, p, fotos[0], FOLHA, t, LADO_PAGINA);
  } else if (fotos.length === 2) {
    const w = (FOLHA_PX_W - VAO) / 2;
    await Promise.all(
      fotos.map((f, i) =>
        fotoNaCaixa(ctx, p, f, { x: i * (w + VAO), y: 0, w, h: FOLHA_PX_H }, t, LADO_PAGINA),
      ),
    );
  }
  const tit: Estilo = {
    letra: ctx.letras.titulo,
    tam: LETRA.tituloSeparador.tam,
    cor: COR.texto,
    espaco: -0.01,
  };
  const { estilo, linhas } = caber(tit, d.titulo, px(FOLHA_PX_W - 2 * MARGEM), 2, 40);
  const entrelinha = 1.06;
  const altTitulo = linhas.length * estilo.tam * entrelinha;
  // Assenta a 66 px do fundo (`bottom: 66px`).
  const topoTitulo = FOLHA_PX_H - 66 - altTitulo;
  const topoSobre = topoTitulo - 8 - LETRA.sobretitulo.tam * 1.21;
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
  foto: Foto;
}

/** A foto inteira, escurecida SÓ NA BASE, onde a frase assenta. */
const DA_CITACAO: Tratamento = {
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
};

export async function citacao(ctx: Contexto, d: DadosDaCitacao): Promise<PDFPage> {
  const p = novaPagina(ctx);
  await fotoNaCaixa(ctx, p, d.foto, FOLHA, DA_CITACAO, LADO_PAGINA);
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
