import "server-only";
import type { PDFDocument, PDFImage, PDFPage } from "pdf-lib";
import type { DocTruncation } from "@/lib/proposal-doc-pdf";
import type { IdiomaDaProposta, TextosDoDocumento } from "@/lib/proposal-doc-textos";
import { PAGINA_H, PAGINA_W } from "@/lib/proposal-geometria";
import { embedImagem } from "./embutir";
import { COR, FOLHA_PX_H, MARGEM, LETRA, RODAPE, fio, px } from "./paleta";
import type { TextosEditoriais } from "./textos";
import {
  baseDaLinha,
  escrever,
  escreverADireita,
  largura,
  maiusculas,
  yDoTopo,
  type Estilo,
  type Letras,
} from "./texto";

/** Tudo o que uma página precisa de saber sobre o documento onde vai. */
export interface Contexto {
  pdf: PDFDocument;
  letras: Letras;
  idioma: IdiomaDaProposta;
  /** Os textos da casa (`textosDaProposta`). */
  t: TextosDoDocumento;
  /** Os rótulos do desenho novo. */
  te: TextosEditoriais;
  /** O que corre no rodapé depois da marca. */
  rodape: string;
  /** O logótipo no creme do texto, com transparência (é uma forma recortada). */
  logo: PDFImage | null;
  /** Só o símbolo do logótipo, para o rodapé. */
  simbolo: PDFImage | null;
  /** O que o desenho cortou — o mesmo relatório do gerador antigo. */
  cortes: DocTruncation[];
  /** Fotografias (pelo conteúdo) que chegaram e não se conseguiram desenhar. */
  naoDesenhadas: Set<string>;
}

/** Uma página nova, já com o fundo pintado. */
export function novaPagina(ctx: Contexto): PDFPage {
  const p = ctx.pdf.addPage([PAGINA_W, PAGINA_H]);
  p.drawRectangle({ x: 0, y: 0, width: PAGINA_W, height: PAGINA_H, color: COR.fundo });
  return p;
}

/**
 * Uma imagem já preparada (JPEG opaca) desenhada numa caixa em píxeis do
 * exemplo. A caixa e a imagem têm a mesma forma — o recorte foi feito pelo
 * sharp —, por isso aqui não há recorte nenhum, só posição.
 */
export async function imagemNaCaixa(
  ctx: Contexto,
  pagina: PDFPage,
  jpeg: Buffer | null,
  caixa: { x: number; y: number; w: number; h: number },
  origem: string,
): Promise<boolean> {
  const img = jpeg ? await embedImagem(ctx.pdf, jpeg) : null;
  if (!img) {
    ctx.naoDesenhadas.add(origem);
    return false;
  }
  pagina.drawImage(img, {
    x: px(caixa.x),
    y: PAGINA_H - px(caixa.y + caixa.h),
    width: px(caixa.w),
    height: px(caixa.h),
  });
  return true;
}

/** A imagem que cobre a folha toda. */
export const FOLHA = { x: 0, y: 0, w: 1123, h: 794 } as const;

/**
 * O sobretítulo dourado (`.eb`): maiúsculas espaçadas, Inter 600.
 * Devolve o fundo da linha em píxeis do exemplo.
 */
export function sobretitulo(
  ctx: Contexto,
  pagina: PDFPage,
  texto: string,
  xPx: number,
  topoPx: number,
  cor = COR.acento,
): number {
  const e: Estilo = {
    letra: ctx.letras.corpoForte,
    tam: LETRA.sobretitulo.tam,
    cor,
    espaco: LETRA.sobretitulo.espaco,
  };
  // A caixa de linha do Inter no CSS é ~1,21 × o tamanho (a «normal»).
  escrever(pagina, e, maiusculas(texto), px(xPx), yDoTopo(topoPx) - baseDaLinha(e, 1.21));
  return topoPx + e.tam * 1.21;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RODAPÉ — símbolo │ «Proposta de decoração · nomes · data»        07
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Como o documento dela o descreve: o símbolo pequeno da marca à esquerda, uma
 * linha vertical fina, o texto, e o número da página à direita com dois
 * algarismos. A 38 px do fundo, em 12 px, numa cor discreta. Só nas páginas de
 * texto: a capa, os separadores, a citação e a contracapa ficam limpas.
 *
 * (O exemplo «Mafalda & João» tem «LÍQUEN EVENTS» escrito no lugar do
 * símbolo. O CSS dele tem as duas coisas — `.ft .logo` e a linha de
 * `span.t` — e é o documento escrito que manda.)
 *
 * O texto do meio encolhe com «…» se não couber — nomes compridos não podem
 * empurrar o número da página para fora da folha.
 */
export function rodape(ctx: Contexto, pagina: PDFPage, numero: number): void {
  const corpo: Estilo = {
    letra: ctx.letras.corpo,
    tam: RODAPE.tamanho,
    cor: COR.textoBaixo,
    espaco: LETRA.rodape.espaco,
  };
  // A fila tem a altura do símbolo (25 px) e assenta a 38 px do fundo; o texto
  // fica centrado nela, como o `align-items: center` do exemplo.
  const SIMBOLO = { w: 18, h: 25 };
  const centro = RODAPE.fundo + SIMBOLO.h / 2;
  const altLinha = RODAPE.tamanho * 1.21;
  const topoTexto = FOLHA_PX_H - (centro + altLinha / 2);
  const yBase = yDoTopo(topoTexto) - baseDaLinha(corpo, 1.21);

  let x = MARGEM;
  if (ctx.simbolo) {
    const k = Math.min(SIMBOLO.w / ctx.simbolo.width, SIMBOLO.h / ctx.simbolo.height);
    const w = ctx.simbolo.width * k;
    const h = ctx.simbolo.height * k;
    pagina.drawImage(ctx.simbolo, {
      x: px(x + (SIMBOLO.w - w) / 2),
      y: px(centro - h / 2),
      width: px(w),
      height: px(h),
    });
    x += SIMBOLO.w + 12;
    pagina.drawLine({
      start: { x: px(x), y: yDoTopo(topoTexto) },
      end: { x: px(x), y: yDoTopo(topoTexto + altLinha) },
      thickness: px(1),
      color: fio(0.25),
    });
    x += 1 + 14;
  }

  const x1 = PAGINA_W - px(MARGEM);
  const n = String(numero).padStart(2, "0");
  escreverADireita(pagina, corpo, n, x1, yBase);
  const livre = x1 - largura(corpo, n) - px(24) - px(x);
  let meio = ctx.rodape;
  if (largura(corpo, meio) > livre) {
    while (meio.length > 1 && largura(corpo, `${meio}…`) > livre) meio = meio.slice(0, -1);
    meio = `${meio.trimEnd()}…`;
  }
  escrever(pagina, corpo, meio, px(x), yBase);
}

/** Um fio horizontal, com a opacidade do exemplo já misturada no fundo. */
export function linha(
  pagina: PDFPage,
  x0Px: number,
  x1Px: number,
  yPx: number,
  opacidade: number,
): void {
  pagina.drawLine({
    start: { x: px(x0Px), y: yDoTopo(yPx) },
    end: { x: px(x1Px), y: yDoTopo(yPx) },
    thickness: px(1),
    color: fio(opacidade),
  });
}
