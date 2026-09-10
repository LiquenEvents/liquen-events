import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {
  CARLITO_BOLD_TTF_B64,
  CARLITO_ITALIC_TTF_B64,
  CARLITO_REGULAR_TTF_B64,
} from "@/lib/proposal-fonts";
import { LOGO_DARK_PNG_B64 } from "@/lib/proposal-assets";
import { ordenar } from "./guiao-do-dia";
import type { TimelineItem } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TIMELINE EM PDF — A FOLHA DELA, MEDIDA A OLHO NU E DEPOIS A SÉRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── COMO É QUE ISTO CHEGOU AQUI, E O ERRO QUE ME CUSTOU UMA VOLTA ────────
 *
 * Ela mandou a timeline a sério de um casamento — a folha da Adega Fita
 * Preta, 28 de Junho, três páginas — e disse «quero que faças assim mesmo».
 *
 * Fiz uma primeira versão a partir do TEXTO do PDF dela: extraí as posições de
 * cada palavra e reconstruí as colunas. Bateu certo nas colunas e falhou tudo
 * o resto — ela respondeu «não está nada parecido». E tinha razão, porque eu
 * tinha lido o ficheiro e nunca o tinha VISTO. O que faz aquela folha não são
 * as colunas: é a GRELHA.
 *
 * Instalei um renderizador, olhei para a página, e depois fui buscar os
 * números à imagem, pixel a pixel, em vez de os estimar. É de lá que vêm todas
 * as constantes deste ficheiro.
 *
 * ── O QUE A FOLHA DELA TEM, POR ORDEM ───────────────────────────────────
 *
 *  1. Uma **faixa escura** com o nome do evento em branco, centrada.
 *  2. **«Timeline»**, a negrito e em itálico, centrado.
 *  3. Uma **tabela de contagens** de três colunas — Adultos · Crianças ·
 *     Staff — com os rótulos em itálico sobre cinzento e os números em baixo.
 *  4. A **tabela do dia**, com CONTORNO EM TODAS AS CÉLULAS, cabeçalho a
 *     negrito sobre cinzento, e **uma linha por HORA** — as cinco coisas das
 *     10h30 vivem todas dentro da mesma célula da descrição.
 *  5. **Zebra por bloco de hora**: uma linha cinzenta, a seguinte branca.
 *
 * ── AS MEDIDAS, TIRADAS DA IMAGEM A 100 DPI ─────────────────────────────
 *
 *     bordo esquerdo da tabela ....  91 px → 65,5 pt
 *     HORA | LOCAL ................ 172 px → 123,8 pt
 *     LOCAL | DESCRIÇÃO ........... 272 px → 195,8 pt
 *     DESCRIÇÃO | NOTAS ........... 589 px → 424,0 pt
 *     bordo direito ............... 751 px → 540,6 pt
 *
 *     contorno .................... rgb(217,217,217)
 *     zebra ....................... rgb(243,243,243)
 *     cabeçalho ................... rgb(239,239,239)
 *     faixa do título ............. rgb(67,67,67)
 *
 * O logótipo é o que ela pediu por cima disto tudo — «gostei do logo no pdf e
 * da cor» —, e é a única coisa nesta folha que não estava na dela.
 */

/** A4 ao alto. É o formato da folha dela. */
const LARGURA = 595.28;
const ALTURA = 841.89;

/** As fronteiras das colunas, em pontos, medidas na folha dela. */
const X_TABELA = 65.5;
const X_LOCAL = 123.8;
const X_DESC = 195.8;
const X_NOTAS = 424;
const X_FIM = 540.6;

/** A faixa do título e a tabela das contagens são mais estreitas do que a tabela. */
const X_FAIXA = 105;
const X_FAIXA_FIM = 511;
const X_CONTAGENS = 69;
const X_CONTAGENS_FIM = 531;

const CORPO = 9;
const ENTRELINHA = 11.5;
/** A folga dentro de uma célula: 6 pt de cada lado, como na folha dela. */
const FOLGA_X = 6;
const FOLGA_Y = 7;

const CONTORNO = rgb(217 / 255, 217 / 255, 217 / 255);
const ZEBRA = rgb(243 / 255, 243 / 255, 243 / 255);
const CABECALHO = rgb(239 / 255, 239 / 255, 239 / 255);
const FAIXA = rgb(67 / 255, 67 / 255, 67 / 255);
const TINTA = rgb(0.1, 0.1, 0.1);
const BRANCO = rgb(1, 1, 1);

export interface HorarioParaPdf {
  /** «CASAMENTO J&P 28.06.25» — o que vai na faixa escura. */
  titulo: string;
  /** As três contagens do topo. Vazias quando o produto ainda não as sabe. */
  adultos: string;
  criancas: string;
  staff: string;
  momentos: readonly TimelineItem[];
}

/** «08:30» → «08h30», que é como a folha dela escreve as horas. */
function horaDaFolha(hhmm: string): string {
  const encontro = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!encontro) return hhmm.trim();
  return `${encontro[1].padStart(2, "0")}h${encontro[2]}`;
}

/**
 * Parte um texto nas linhas que couberem na largura dada.
 *
 * Por PALAVRA e nunca por letra: cortar «Chegada Festaaluga» a meio da segunda
 * palavra dá uma folha que se lê aos soluços. Uma palavra sozinha maior do que
 * a coluna fica por cortar e transborda — é preferível a parti-la e ninguém a
 * reconhecer.
 */
function emLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  const linhas: string[] = [];
  let atual = palavras[0];
  for (const p of palavras.slice(1)) {
    const tentativa = `${atual} ${p}`;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  linhas.push(atual);
  return linhas;
}

/**
 * Um bloco de hora: uma linha da tabela dela.
 *
 * É aqui que está a diferença entre a folha dela e uma lista: às 10h30
 * acontecem cinco coisas, e as cinco vivem na MESMA célula da descrição, com a
 * hora escrita uma vez à esquerda. Numa lista seriam cinco linhas com a hora
 * repetida cinco vezes, e a coluna da esquerda passava a parecer cinco
 * momentos diferentes.
 */
interface BlocoDeHora {
  hora: string;
  locais: string[];
  descricao: string[];
  notas: string[];
  altura: number;
}

export async function horarioEmPdf(dados: HorarioParaPdf): Promise<Uint8Array | null> {
  const momentos = ordenar(dados.momentos);
  if (momentos.length === 0) return null;

  const pdf = await PDFDocument.create();
  /**
   * Carlito, e não a Helvetica de série do PDF.
   *
   * A Helvetica embutida só sabe escrever WinAnsi, e um nome que saia dessa
   * tabela — um «Nguyễn», um «Łukasz» — não dá letra errada: dá uma EXCEPÇÃO a
   * meio do desenho, e o download falha inteiro. É o mesmo defeito que o
   * `proposal-doc-pdf.caracteres.test.ts` desta casa já apanhou uma vez.
   */
  pdf.registerFontkit(fontkit);
  const carlito = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const reg = await carlito(CARLITO_REGULAR_TTF_B64);
  const bold = await carlito(CARLITO_BOLD_TTF_B64);
  const italico = await carlito(CARLITO_ITALIC_TTF_B64);
  const marca = await pdf.embedPng(Buffer.from(LOGO_DARK_PNG_B64, "base64"));

  const larguraDesc = X_NOTAS - X_DESC - FOLGA_X * 2;
  const larguraNotas = X_FIM - X_NOTAS - FOLGA_X * 2;
  const larguraLocal = X_DESC - X_LOCAL - FOLGA_X * 2;

  // ── OS BLOCOS, UM POR HORA ───────────────────────────────────────────────
  const blocos: BlocoDeHora[] = [];
  let anterior: BlocoDeHora | null = null;
  let localAnterior = "";
  for (const m of momentos) {
    const hora = horaDaFolha(m.time);
    if (!anterior || anterior.hora !== hora) {
      anterior = { hora, locais: [], descricao: [], notas: [], altura: 0 };
      blocos.push(anterior);
    }
    const local = (m.local ?? "").trim();
    if (local && local !== localAnterior) {
      anterior.locais.push(...emLinhas(local, reg, CORPO, larguraLocal));
      localAnterior = local;
    }
    anterior.descricao.push(...emLinhas(m.title, reg, CORPO, larguraDesc));
    if (m.notas?.trim()) anterior.notas.push(...emLinhas(m.notas, reg, CORPO, larguraNotas));
  }
  for (const b of blocos) {
    const linhas = Math.max(b.locais.length, b.descricao.length, b.notas.length, 1);
    b.altura = linhas * ENTRELINHA + FOLGA_Y * 2;
  }

  // ── AS PÁGINAS ───────────────────────────────────────────────────────────
  let pagina = pdf.addPage([LARGURA, ALTURA]);
  let y = cabecalhoDaPrimeira(pagina, dados, { reg, bold, italico }, marca);
  y = filaDosNomes(pagina, y, bold);

  const chao = 46;
  let zebrada = true;
  for (const b of blocos) {
    if (y - b.altura < chao) {
      pagina = pdf.addPage([LARGURA, ALTURA]);
      y = ALTURA - 46;
      y = filaDosNomes(pagina, y, bold);
    }
    desenharBloco(pagina, y, b, reg, bold, zebrada);
    y -= b.altura;
    zebrada = !zebrada;
  }

  return pdf.save();
}

/** Uma linha da tabela: o fundo, os quatro contornos e o texto das quatro células. */
function desenharBloco(
  pagina: PDFPage,
  topo: number,
  b: BlocoDeHora,
  reg: PDFFont,
  bold: PDFFont,
  zebrada: boolean,
): void {
  const base = topo - b.altura;
  if (zebrada) {
    pagina.drawRectangle({
      x: X_TABELA,
      y: base,
      width: X_FIM - X_TABELA,
      height: b.altura,
      color: ZEBRA,
    });
  }
  /* O contorno de TODAS as células, que é o que faz a folha dela ler-se como
     uma grelha e não como uma lista. Sem isto, é a diferença que ela apanhou à
     primeira: «não está nada parecido». */
  moldura(pagina, X_TABELA, base, X_FIM, topo);
  for (const x of [X_LOCAL, X_DESC, X_NOTAS]) {
    pagina.drawLine({
      start: { x, y: base },
      end: { x, y: topo },
      thickness: 0.5,
      color: CONTORNO,
    });
  }

  const primeiraLinha = topo - FOLGA_Y - CORPO;
  pagina.drawText(b.hora, {
    x: X_TABELA + FOLGA_X,
    y: primeiraLinha,
    size: CORPO,
    font: reg,
    color: TINTA,
  });
  b.locais.forEach((t, i) =>
    pagina.drawText(t, {
      x: X_LOCAL + FOLGA_X,
      y: primeiraLinha - i * ENTRELINHA * 2,
      size: CORPO,
      font: reg,
      color: TINTA,
    }),
  );
  b.descricao.forEach((t, i) =>
    pagina.drawText(t, {
      x: X_DESC + FOLGA_X,
      y: primeiraLinha - i * ENTRELINHA,
      size: CORPO,
      font: reg,
      color: TINTA,
    }),
  );
  b.notas.forEach((t, i) =>
    pagina.drawText(t, {
      x: X_NOTAS + FOLGA_X,
      y: primeiraLinha - i * ENTRELINHA,
      size: CORPO,
      font: reg,
      color: TINTA,
    }),
  );
  void bold;
}

/** Um rectângulo em contorno, nos quatro lados. */
function moldura(pagina: PDFPage, x1: number, y1: number, x2: number, y2: number): void {
  pagina.drawRectangle({
    x: x1,
    y: y1,
    width: x2 - x1,
    height: y2 - y1,
    borderColor: CONTORNO,
    borderWidth: 0.5,
  });
}

/** A fila dos nomes das colunas. Repete-se em cada página, como na folha dela. */
function filaDosNomes(pagina: PDFPage, topo: number, bold: PDFFont): number {
  const altura = 21;
  const base = topo - altura;
  pagina.drawRectangle({
    x: X_TABELA,
    y: base,
    width: X_FIM - X_TABELA,
    height: altura,
    color: CABECALHO,
  });
  moldura(pagina, X_TABELA, base, X_FIM, topo);
  const nomes: [string, number, number][] = [
    ["HORA", X_TABELA, X_LOCAL],
    ["LOCAL", X_LOCAL, X_DESC],
    ["DESCRIÇÃO", X_DESC, X_NOTAS],
    ["NOTAS", X_NOTAS, X_FIM],
  ];
  for (const [nome, de, ate] of nomes) {
    if (de !== X_TABELA) {
      pagina.drawLine({
        start: { x: de, y: base },
        end: { x: de, y: topo },
        thickness: 0.5,
        color: CONTORNO,
      });
    }
    /* Centrados na coluna, como na folha dela — e não encostados à esquerda.
       Num cabeçalho de grelha o nome pertence à COLUNA inteira. */
    const largura = bold.widthOfTextAtSize(nome, 9.5);
    pagina.drawText(nome, {
      x: de + (ate - de - largura) / 2,
      y: base + 6.5,
      size: 9.5,
      font: bold,
      color: TINTA,
    });
  }
  return base;
}

/**
 * O topo da primeira página: marca, faixa escura, «Timeline» e as contagens.
 * Devolve o `y` a que a tabela pode começar.
 */
function cabecalhoDaPrimeira(
  pagina: PDFPage,
  dados: HorarioParaPdf,
  fontes: { reg: PDFFont; bold: PDFFont; italico: PDFFont },
  marca: Awaited<ReturnType<PDFDocument["embedPng"]>>,
): number {
  const { reg, bold, italico } = fontes;

  /* «Gostei do logo no pdf e da cor» — fica, e fica por cima da faixa, que é o
     único sítio onde não disputa espaço com nada da folha dela. */
  const larguraDaMarca = 96;
  const escala = larguraDaMarca / marca.width;
  const alturaDaMarca = marca.height * escala;
  pagina.drawImage(marca, {
    x: (LARGURA - larguraDaMarca) / 2,
    y: ALTURA - 40 - alturaDaMarca,
    width: larguraDaMarca,
    height: alturaDaMarca,
  });

  let y = ALTURA - 40 - alturaDaMarca - 22;

  // ── A FAIXA ESCURA ───────────────────────────────────────────────────────
  const alturaDaFaixa = 29;
  pagina.drawRectangle({
    x: X_FAIXA,
    y: y - alturaDaFaixa,
    width: X_FAIXA_FIM - X_FAIXA,
    height: alturaDaFaixa,
    color: FAIXA,
  });
  const titulo = dados.titulo.toUpperCase();
  pagina.drawText(titulo, {
    x: (LARGURA - reg.widthOfTextAtSize(titulo, 10.5)) / 2,
    y: y - alturaDaFaixa + 10,
    size: 10.5,
    font: reg,
    color: BRANCO,
  });
  y -= alturaDaFaixa + 24;

  // ── «TIMELINE», A NEGRITO E EM ITÁLICO ───────────────────────────────────
  pagina.drawText("Timeline", {
    x: (LARGURA - italico.widthOfTextAtSize("Timeline", 10.5)) / 2,
    y,
    size: 10.5,
    font: italico,
    color: TINTA,
  });
  y -= 24;

  // ── A TABELA DAS CONTAGENS ───────────────────────────────────────────────
  /**
   * Três colunas, como na dela. As que o produto ainda não sabe ficam EM
   * BRANCO e não a zero: um zero é uma afirmação («não vêm crianças») e o
   * branco é a verdade («ainda não está escrito»). Escrever «0 crianças» era
   * apresentar um dado em falta como um dado, que é o que o documento dela
   * proíbe noutro ecrã.
   */
  const colunas: [string, string, number, number][] = [
    ["Adultos", dados.adultos, X_CONTAGENS, 255],
    ["Crianças", dados.criancas, 255, 432],
    ["Staff", dados.staff, 432, X_CONTAGENS_FIM],
  ];
  const alturaDaFila = 24;
  pagina.drawRectangle({
    x: X_CONTAGENS,
    y: y - alturaDaFila,
    width: X_CONTAGENS_FIM - X_CONTAGENS,
    height: alturaDaFila,
    color: CABECALHO,
  });
  for (const [rotulo, valor, de, ate] of colunas) {
    moldura(pagina, de, y - alturaDaFila, ate, y);
    moldura(pagina, de, y - alturaDaFila * 2, ate, y - alturaDaFila);
    const lr = italico.widthOfTextAtSize(rotulo, 10);
    pagina.drawText(rotulo, {
      x: de + (ate - de - lr) / 2,
      y: y - alturaDaFila + 8,
      size: 10,
      font: italico,
      color: TINTA,
    });
    if (valor) {
      const lv = reg.widthOfTextAtSize(valor, 10);
      pagina.drawText(valor, {
        x: de + (ate - de - lv) / 2,
        y: y - alturaDaFila * 2 + 8,
        size: 10,
        font: reg,
        color: TINTA,
      });
    }
  }
  void bold;

  return y - alturaDaFila * 2 - 26;
}
