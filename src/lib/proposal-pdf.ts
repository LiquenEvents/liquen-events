import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Proposal } from "@/lib/orcamento/types";
import { SITE } from "@/lib/site";
import { winAnsiSafe } from "@/lib/pdf-text";
/**
 * O formatador é o PARTILHADO dos documentos, e não uma cópia local do `Intl`.
 *
 * Esta era a terceira cópia da mesma função na casa — e a terceira a herdar as
 * manias do `Intl` de pt-PT: uma linha de 4 600 € saía «4600,00 €» ao lado de
 * um total de 24 600 € escrito «24 600,00 €», na mesma coluna. O documento novo
 * da proposta já normalizava isto para si; hoje a regra é uma só, no `money.ts`,
 * e vale para todos os papéis que o casal lê. A `currency` da proposta continua
 * a ser respeitada — ver lá.
 */
import { eurDocumento } from "@/lib/money";

const MOSS = rgb(0.29, 0.486, 0.349);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

/**
 * O fuso em que esta proposta é lida, e por isso o único em que pode ser
 * escrita. Mesmo valor e mesma razão do `FUSO` do contract-pdf.
 */
const FUSO = "Europe/Lisbon";

/**
 * Quebra um texto em linhas que cabem em `maxWidth` (respeita \n internos).
 *
 * Gémeo do `wrap` do contract-pdf. Estava aqui escrito duas vezes à mão — uma
 * para a descrição das linhas, outra para as notas —, com a segunda a desenhar
 * enquanto media. Uma só, que devolve linhas e não desenha nada, é o que permite
 * ao chamador contar de quantas precisa ANTES de decidir se cabem na página.
 *
 * Sanitiza cada parágrafo DEPOIS de partir nos \n do texto cru: o `winAnsiSafe`
 * preserva a quebra de linha, mas medir e partir é trabalho de quem conhece a
 * largura. Antes de medir tem mesmo de passar — `widthOfTextAtSize` lança nos
 * glifos que o WinAnsi/Helvetica não codifica, tal como o `drawText`.
 */
function quebrar(font: PDFFont, texto: string, size: number, maxWidth: number): string[] {
  const linhas: string[] = [];
  for (const bruto of texto.split("\n")) {
    const palavras = winAnsiSafe(bruto).split(/\s+/).filter(Boolean);
    if (palavras.length === 0) continue;
    let linha = "";
    for (const p of palavras) {
      const tentativa = linha ? `${linha} ${p}` : p;
      if (font.widthOfTextAtSize(tentativa, size) > maxWidth && linha) {
        linhas.push(linha);
        linha = p;
      } else {
        linha = tentativa;
      }
    }
    linhas.push(linha);
  }
  return linhas;
}

interface Meta {
  eventType?: string;
  date?: string;
  guests?: number;
  location?: string;
}

/** Renders a clean A4 proposal PDF and returns the bytes. */
export async function renderProposalPdf(p: Proposal, meta: Meta = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const right = A4.w - MARGIN;
  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;

  // Sanitiza no ponto de desenho: campos como clientName/eventType/notes vêm do
  // cliente e podem ter caracteres que o WinAnsi/Helvetica não codifica (→ 500).
  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(winAnsiSafe(s), {
      x,
      y: yy,
      font: opts.font ?? font,
      size: opts.size ?? 10,
      color: opts.color ?? INK,
    });

  const textRight = (
    s: string,
    xRight: number,
    yy: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = winAnsiSafe(s);
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    text(safe, xRight - f.widthOfTextAtSize(safe, size), yy, opts);
  };

  const hr = (yy: number) =>
    page.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: right, y: yy },
      thickness: 0.7,
      color: LINE,
    });

  // ── Colunas da tabela ──
  const colDesc = MARGIN;
  const colQty = right - 200;
  const colUnit = right - 120;
  const colTotal = right;
  const maxDesc = colQty - colDesc - 20;

  const cabecalhoDaTabela = () => {
    text("DESCRIÇÃO", colDesc, y, { font: bold, size: 8, color: MUTED });
    textRight("QT", colQty + 14, y, { font: bold, size: 8, color: MUTED });
    textRight("UNIT.", colUnit + 6, y, { font: bold, size: 8, color: MUTED });
    textRight("TOTAL", colTotal, y, { font: bold, size: 8, color: MUTED });
    y -= 10;
    hr(y);
    y -= 18;
  };

  /**
   * ════════════════════════════════════════════════════════════════════════════
   * A PROPOSTA QUE NÃO CABIA NA FOLHA — E LEVAVA O TOTAL COM ELA
   * ════════════════════════════════════════════════════════════════════════════
   *
   * Este documento desenhava-se numa página fixa e nunca perguntava se ainda
   * havia folha. O `y` continuava a descer para lá do rodapé e depois para lá do
   * zero, e o pdf-lib desenha na mesma — em coordenadas que nenhum leitor mostra.
   *
   * Com 26 linhas de orçamento o «TOTAL» já saía em cima do rodapé; com 40 (o
   * esquema aceita até 200) saía a y = −162, ou seja: o casal recebia uma
   * proposta com dez itens em falta, sem subtotal, sem IVA, sem total, sem a
   * validade e sem as notas. Nada assinalava a perda — nem um aviso na rota, nem
   * uma página a mais. Uma proposta de decoração de casamento com vinte e tal
   * rubricas (arranjos, mesas, transporte, montagem) é o caso normal, não o
   * extremo.
   *
   * Passa a haver páginas de continuação, no molde do contract-pdf: o rodapé
   * fecha a página que sai, a nova abre com a identificação e a referência, e a
   * tabela repete os seus cabeçalhos para as colunas continuarem a ter nome.
   */
  const rodape = (pg: PDFPage) => {
    const yy = MARGIN - 12;
    pg.drawLine({
      start: { x: MARGIN, y: yy + 16 },
      end: { x: A4.w - MARGIN, y: yy + 16 },
      thickness: 0.7,
      color: LINE,
    });
    pg.drawText(`${SITE.email}   ·   ${SITE.phoneDisplay}   ·   Portugal`, {
      x: MARGIN,
      y: yy,
      font,
      size: 8,
      color: MUTED,
    });
  };

  const novaPagina = () => {
    rodape(page);
    page = doc.addPage([A4.w, A4.h]);
    y = A4.h - MARGIN;
    text("LÍQUEN EVENTS", MARGIN, y, { font: bold, size: 12, color: MOSS });
    textRight(`Ref. ${p.id}`, right, y, { size: 9, color: MUTED });
    y -= 12;
    hr(y);
    y -= 24;
  };

  /** Garante `need` pontos de folha; senão salta de página. Diz se saltou — quem
   *  está a meio da tabela precisa de saber, para repetir os cabeçalhos. */
  const garantir = (need: number): boolean => {
    if (y - need >= MARGIN + 20) return false;
    novaPagina();
    return true;
  };

  // ── Header ──
  text("LÍQUEN EVENTS", MARGIN, y, { font: bold, size: 20, color: MOSS });
  textRight("PROPOSTA", right, y, { font: bold, size: 12, color: MUTED });
  y -= 16;
  text("Decoramos eventos, eternizamos memórias.", MARGIN, y, { size: 9, color: MUTED });
  textRight(`Ref. ${p.id}`, right, y, { size: 9, color: MUTED });
  y -= 14;
  /**
   * A data de emissão no fuso de Portugal, e não no da máquina que gerou o PDF
   * (UTC, no alojamento). Uma proposta criada às 23:30 de 2 de julho saía datada
   * de 02/07 quando em Lisboa já era dia 3 — e é dessa data que se contam os
   * dias de validade que o documento promete três linhas abaixo.
   */
  textRight(new Date(p.createdAt).toLocaleDateString("pt-PT", { timeZone: FUSO }), right, y, {
    size: 9,
    color: MUTED,
  });
  y -= 18;
  hr(y);
  y -= 28;

  // ── Client + event meta (two columns) ──
  const colR = MARGIN + 270;
  text("PARA", MARGIN, y, { font: bold, size: 8, color: MUTED });
  text("EVENTO", colR, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  text(p.clientName || "—", MARGIN, y, { font: bold, size: 11 });
  text(meta.eventType || "—", colR, y, { size: 11 });
  y -= 14;
  text(p.clientEmail || "—", MARGIN, y, { size: 9, color: MUTED });
  const evLine = [
    meta.date ? new Date(meta.date + "T12:00:00").toLocaleDateString("pt-PT") : null,
    meta.guests ? `${meta.guests} convidados` : null,
    meta.location || null,
  ]
    .filter(Boolean)
    .join(" · ");
  text(evLine || "—", colR, y, { size: 9, color: MUTED });
  y -= 30;

  // ── Line items table ──
  cabecalhoDaTabela();

  for (const item of p.lineItems) {
    const lineTotal = item.qty * item.unitPrice;
    const lines = quebrar(font, item.description || "", 10, maxDesc);
    if (lines.length === 0) lines.push("—");

    // A linha inteira salta junta: a descrição em cima e o valor na página
    // seguinte seria pior do que a folha a acabar. E a página nova volta a dizer
    // o nome das colunas — sem eles, «1  100,00 €  100,00 €» é uma fila de
    // números sem cabeçalho.
    if (garantir(lines.length * 14 + 4)) cabecalhoDaTabela();

    text(lines[0], colDesc, y, { size: 10 });
    textRight(String(item.qty), colQty + 14, y, { size: 10, color: MUTED });
    textRight(eurDocumento(item.unitPrice, p.currency), colUnit + 6, y, { size: 10, color: MUTED });
    textRight(eurDocumento(lineTotal, p.currency), colTotal, y, { size: 10 });
    y -= 14;
    for (let i = 1; i < lines.length; i++) {
      text(lines[i], colDesc, y, { size: 10 });
      y -= 14;
    }
    y -= 4;
  }

  // ── Totals ──
  // O bloco inteiro (traço + três linhas) ou nenhum: um subtotal sozinho no fim
  // de uma página, com o total na seguinte, é a conta partida ao meio.
  garantir(6 + 22 + 16 + 20 + 12);
  y -= 6;
  hr(y);
  y -= 22;

  const totalsLabelX = colUnit + 6;
  textRight("Subtotal", totalsLabelX, y, { size: 9, color: MUTED });
  textRight(eurDocumento(p.subtotal, p.currency), colTotal, y, { size: 9 });
  y -= 16;
  textRight(`IVA (${Math.round(p.vatRate * 100)}%)`, totalsLabelX, y, { size: 9, color: MUTED });
  textRight(eurDocumento(p.vat, p.currency), colTotal, y, { size: 9 });
  y -= 20;
  textRight("TOTAL", totalsLabelX, y, { font: bold, size: 12, color: MOSS });
  textRight(eurDocumento(p.total, p.currency), colTotal, y, { font: bold, size: 12, color: MOSS });
  y -= 34;

  // ── Validity + notes ──
  if (p.validUntil) {
    garantir(18);
    text(
      `Proposta válida até ${new Date(p.validUntil + "T12:00:00").toLocaleDateString("pt-PT")}.`,
      MARGIN,
      y,
      { size: 9, color: MUTED },
    );
    y -= 18;
  }
  if (p.notes) {
    garantir(27);
    text("NOTAS", MARGIN, y, { font: bold, size: 8, color: MUTED });
    y -= 14;
    for (const linha of quebrar(font, p.notes, 9, right - MARGIN)) {
      garantir(13);
      text(linha, MARGIN, y, { size: 9, color: INK });
      y -= 13;
    }
  }

  // ── Footer ──
  rodape(page);

  return doc.save();
}
