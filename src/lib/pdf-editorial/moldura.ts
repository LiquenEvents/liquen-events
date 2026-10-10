import "server-only";
import type { PDFDocument, PDFImage, PDFPage, RGB } from "pdf-lib";
import type { DocTruncation } from "@/lib/proposal-doc-pdf";
import type { IdiomaDaProposta, TextosDoDocumento } from "@/lib/proposal-doc-textos";
import { PAGINA_H, PAGINA_W } from "@/lib/proposal-geometria";
import { embedImagem } from "./embutir";
import type { Foto } from "./fotos";
import { LADO_CELULA, pixeisDaCaixa, preparar, type Tratamento } from "./imagens";
import { COR, FOLHA_PX_H, FOLHA_PX_W, MARGEM, LETRA, RODAPE, fio, px } from "./paleta";
import type { TextosEditoriais } from "./textos";
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
  /** O que o desenho cortou — o mesmo relatório do gerador antigo. */
  cortes: DocTruncation[];
  /** Fotografias (pela origem) que chegaram e não se conseguiram desenhar. */
  naoDesenhadas: Set<string>;
  /** As imagens já preparadas e embutidas — ver {@link fotoNaCaixa}. */
  embutidas: Map<string, Promise<PDFImage | null>>;
}

/** Uma página nova, já com o fundo pintado. */
export function novaPagina(ctx: Contexto): PDFPage {
  const p = ctx.pdf.addPage([PAGINA_W, PAGINA_H]);
  p.drawRectangle({ x: 0, y: 0, width: PAGINA_W, height: PAGINA_H, color: COR.fundo });
  return p;
}

/** Uma caixa em píxeis do exemplo. */
export interface CaixaPx {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A folha toda. */
export const FOLHA: CaixaPx = { x: 0, y: 0, w: FOLHA_PX_W, h: FOLHA_PX_H };

/** Desenha uma imagem JÁ embutida a ocupar a caixa (a forma foi dada pelo sharp). */
function desenharNaCaixa(pagina: PDFPage, img: PDFImage, caixa: CaixaPx) {
  pagina.drawImage(img, {
    x: px(caixa.x),
    y: PAGINA_H - px(caixa.y + caixa.h),
    width: px(caixa.w),
    height: px(caixa.h),
  });
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA NUMA CAIXA — recortada, tratada e embutida UMA vez
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Recorta a foto para a forma da caixa (o `object-fit: cover`), aplica o
 * tratamento (degradés, sombra — fundidos na JPEG) e desenha-a.
 *
 * A mesma foto, na mesma caixa, com o mesmo tratamento, é a mesma imagem: a
 * capa e a contracapa partilham as duas fotografias, e sem esta memória o
 * ficheiro levava-as duas vezes. Guarda-se a promessa, para dois pedidos
 * simultâneos partilharem o trabalho.
 *
 * `lado` é o lado maior em pixéis: {@link LADO_CELULA} para as células, mais
 * para as fotos de página inteira.
 */
export async function fotoNaCaixa(
  ctx: Contexto,
  pagina: PDFPage,
  foto: Foto | null,
  caixa: CaixaPx,
  t: Tratamento = {},
  lado = LADO_CELULA,
  densidade = 1.7,
): Promise<boolean> {
  if (!foto) return false;
  const { w, h } = pixeisDaCaixa(caixa.w, caixa.h, lado, densidade);
  // O enquadramento é da FOTOGRAFIA (escolhido à mão para ela), e não da página.
  if (foto.foco) t = { ...t, foco: foto.foco };
  const chave = `${foto.id}|${w}x${h}|${JSON.stringify(t)}`;
  let img = ctx.embutidas.get(chave);
  if (!img) {
    img = preparar(foto.bytes, w, h, caixa.w, t).then((jpeg) =>
      jpeg ? embedImagem(ctx.pdf, jpeg) : null,
    );
    ctx.embutidas.set(chave, img);
  }
  const pronta = await img;
  if (!pronta) {
    ctx.naoDesenhadas.add(foto.origem);
    return false;
  }
  desenharNaCaixa(pagina, pronta, caixa);
  return true;
}

/** Um rectângulo chapado, em píxeis do exemplo. */
export function rectangulo(pagina: PDFPage, c: CaixaPx, cor: RGB, borda?: RGB): void {
  pagina.drawRectangle({
    x: px(c.x),
    y: PAGINA_H - px(c.y + c.h),
    width: px(c.w),
    height: px(c.h),
    color: cor,
    ...(borda ? { borderColor: borda, borderWidth: px(1) } : {}),
  });
}

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
  tam: number = LETRA.sobretitulo.tam,
): number {
  const e: Estilo = { letra: ctx.letras.corpoForte, tam, cor, espaco: LETRA.sobretitulo.espaco };
  // A caixa de linha do Inter no CSS é ~1,21 × o tamanho (a «normal»).
  escrever(pagina, e, maiusculas(texto), px(xPx), yDoTopo(topoPx) - baseDaLinha(e, 1.21));
  return topoPx + e.tam * 1.21;
}

/**
 * O cabeçalho das páginas de conteúdo: sobretítulo, título em serifada e, se
 * houver, o subtítulo em itálico. Devolve o fundo, em píxeis do exemplo.
 *
 * O título encolhe até caber em duas linhas na largura dada.
 */
export function cabecalho(
  ctx: Contexto,
  pagina: PDFPage,
  o: {
    sobretitulo: string;
    titulo: string;
    subtitulo?: string;
    x: number;
    topo: number;
    largura: number;
    tam?: number;
    entrelinha?: number;
  },
): number {
  const tam = o.tam ?? LETRA.tituloConteudo.tam;
  const entrelinha = o.entrelinha ?? LETRA.tituloConteudo.entrelinha;
  let topo = sobretitulo(ctx, pagina, o.sobretitulo, o.x, o.topo) + 10;
  const tit = caber(
    { letra: ctx.letras.titulo, tam, cor: COR.texto, espaco: -0.01 },
    o.titulo,
    px(o.largura),
    2,
    Math.round(tam * 0.7),
  );
  topo = bloco(pagina, tit.estilo, tit.linhas, o.x, topo, entrelinha);
  if (o.subtitulo) {
    const sub: Estilo = {
      letra: ctx.letras.tituloItalico,
      tam: LETRA.subtitulo.tam,
      cor: COR.textoSuave,
    };
    const s = caber(sub, o.subtitulo, px(o.largura), 2, 14);
    topo = bloco(pagina, s.estilo, s.linhas, o.x, topo + 4, 1.25);
  }
  return topo;
}

/**
 * O logótipo da casa, com `altura` px do exemplo, ASSENTE na linha de base
 * `yBase` (pontos do PDF): o nome «LÍQUEN EVENTS», que é a parte de baixo do
 * logótipo, fica na mesma linha da frase ao lado — foi o que ela pediu ao vê-lo
 * centrado, um pouco abaixo do texto: «coloca mais para cima para ficar ao
 * nível da frase». Devolve a largura que ocupou, em px do exemplo.
 */
export function logotipoNaLinha(
  ctx: Contexto,
  pagina: PDFPage,
  xPx: number,
  yBase: number,
  altura: number,
): number {
  if (!ctx.logo) return 0;
  const w = (ctx.logo.width / ctx.logo.height) * altura;
  pagina.drawImage(ctx.logo, {
    x: px(xPx),
    y: yBase,
    width: px(w),
    height: px(altura),
  });
  return w;
}

/** A altura do logótipo no rodapé: legível, e sem passar da faixa do rodapé. */
export const LOGO_NO_RODAPE = 32;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O RODAPÉ — [logótipo]  Proposta de decoração · nomes · data          07
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O logótipo da Líquen à esquerda, o nome da proposta, e o número da página à
 * direita com dois algarismos. A 38 px do fundo, em 12 px.
 *
 * O caminho até aqui, pela mão dela: primeiro o símbolo sozinho (o texto do
 * prompt) — «demasiado pequeno e quase não se lê»; depois «LÍQUEN EVENTS» em
 * letra, como o exemplo; e por fim, ao ver o PDF: «troca pelo logo da Líquen
 * nas páginas». É o logótipo inteiro (símbolo e nome), o mesmo ficheiro da
 * capa, a 32 px de altura — o nome lê-se e a faixa do rodapé não cresce.
 *
 * `x0`/`x1` são as margens do texto da página: numa página com painel de
 * fotografia o rodapé fica do lado do texto e acaba onde o painel começa.
 *
 * O texto do meio encolhe com «…» se não couber — nomes compridos não podem
 * empurrar o número da página para fora da folha.
 */
export function rodape(
  ctx: Contexto,
  pagina: PDFPage,
  numero: number,
  x0 = MARGEM,
  x1 = FOLHA_PX_W - MARGEM,
): void {
  const corpo: Estilo = {
    letra: ctx.letras.corpo,
    tam: RODAPE.tamanho,
    cor: COR.textoBaixo,
    espaco: LETRA.rodape.espaco,
  };
  const altLinha = RODAPE.tamanho * 1.21;
  const topoTexto = FOLHA_PX_H - RODAPE.fundo - altLinha;
  const yBase = yDoTopo(topoTexto) - baseDaLinha(corpo, 1.21);
  const larguraDoLogo = logotipoNaLinha(ctx, pagina, x0, yBase, LOGO_NO_RODAPE);
  const n = String(numero).padStart(2, "0");
  escreverADireita(pagina, corpo, n, px(x1), yBase);
  const xMeio = px(x0 + larguraDoLogo + (larguraDoLogo ? 16 : 0));
  const livre = px(x1) - largura(corpo, n) - px(24) - xMeio;
  let meio = ctx.rodape;
  if (largura(corpo, meio) > livre) {
    while (meio.length > 1 && largura(corpo, `${meio}…`) > livre) meio = meio.slice(0, -1);
    meio = `${meio.trimEnd()}…`;
  }
  if (livre > px(40)) escrever(pagina, corpo, meio, xMeio, yBase);
}

/**
 * O fundo da área de conteúdo, acima do rodapé. No exemplo é 724 (`.mid`);
 * aqui 716, porque o logótipo do rodapé (32 px, assente na linha da frase)
 * sobe até aos 721 — uma coluna de condições cheia até ao fim tocava-lhe.
 */
export const FUNDO_DO_CONTEUDO = 716;

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
