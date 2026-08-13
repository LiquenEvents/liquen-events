import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { SITE } from "@/lib/site";
/**
 * `eurDocumento` e não `eur`: um documento fiscal escreve os milhares com PONTO,
 * como se escrevem em Portugal. Com o `eur`, esta folha dizia «20 000,00 €»,
 * «4600,00 €» e «24 600,00 €» na MESMA coluna, a três linhas de distância — o
 * do meio sem separador nenhum, porque o `Intl` de pt-PT só agrupa a partir de
 * cinco dígitos. O porquê inteiro está no `money.ts`.
 */
import { eurDocumento, round2 } from "@/lib/money";
import { winAnsiSafe } from "@/lib/pdf-text";

const MOSS = rgb(0.29, 0.486, 0.349);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

/**
 * Quebra um texto em linhas que cabem em `maxWidth`.
 *
 * Gémeo do `wrap` do contract-pdf, e escrito aqui em vez de importado de
 * propósito: os três geradores de PDF desta casa espelham-se uns aos outros em
 * vez de partilharem um módulo (ver o cabeçalho do contract-pdf), e a fatura não
 * tem por que arrastar o logótipo embebido do contrato só para partir linhas.
 *
 * Sanitiza ANTES de medir: `widthOfTextAtSize` lança nos glifos que o
 * WinAnsi/Helvetica não codifica, exactamente como o `drawText`.
 */
function quebrar(font: PDFFont, texto: string, size: number, maxWidth: number): string[] {
  const linhas: string[] = [];
  for (const bruto of winAnsiSafe(texto).split("\n")) {
    const palavras = bruto.split(/\s+/).filter(Boolean);
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

export interface InvoiceData {
  number: string;
  date: string;
  clientName: string;
  clientEmail?: string;
  clientNif?: string;
  description: string;
  amount: number; // valor com IVA
  vatRate: number; // ex.: 0.23
  kindLabel: string; // "Sinal", "Saldo", "Pagamento"
  paid: boolean;
}

/** Renders a simple A4 receipt/invoice PDF and returns the bytes. */
export async function renderInvoicePdf(d: InvoiceData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.w, A4.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const right = A4.w - MARGIN;
  const maxW = right - MARGIN;
  let y = A4.h - MARGIN;

  // Sanitizamos NO ponto de desenho: `s` pode conter texto do cliente (nome,
  // descrição…) com caracteres que o WinAnsi/Helvetica não codifica e que
  // fariam `drawText`/`widthOfTextAtSize` lançar (→ recibo 500). `tr` sanitiza
  // antes de medir a largura, para o alinhamento à direita usar a string real.
  const text = (
    s: string,
    x: number,
    yy: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(winAnsiSafe(s), {
      x,
      y: yy,
      font: o.font ?? font,
      size: o.size ?? 10,
      color: o.color ?? INK,
    });
  const tr = (
    s: string,
    xr: number,
    yy: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = winAnsiSafe(s);
    const f = o.font ?? font;
    const size = o.size ?? 10;
    text(safe, xr - f.widthOfTextAtSize(safe, size), yy, o);
  };
  const hr = (yy: number) =>
    page.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: right, y: yy },
      thickness: 0.7,
      color: LINE,
    });

  // Header
  text("LÍQUEN EVENTS", MARGIN, y, { font: bold, size: 20, color: MOSS });
  tr("FATURA", right, y, { font: bold, size: 12, color: MUTED });
  y -= 16;
  text("Decoramos eventos, eternizamos memórias.", MARGIN, y, { size: 9, color: MUTED });
  tr(`Nº ${d.number}`, right, y, { size: 9, color: MUTED });
  y -= 14;
  tr(new Date(d.date + "T12:00:00").toLocaleDateString("pt-PT"), right, y, {
    size: 9,
    color: MUTED,
  });
  y -= 18;
  hr(y);
  y -= 28;

  // Client
  text("CLIENTE", MARGIN, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  // O nome vem do pedido, onde o campo aceita 120 caracteres, e um nome de casal
  // por extenso passa dos 80: numa linha só, saía pela direita da folha e o
  // apelido de quem paga a factura ficava fora do papel.
  for (const linha of quebrar(bold, d.clientName || "—", 11, maxW)) {
    text(linha, MARGIN, y, { font: bold, size: 11 });
    y -= 14;
  }
  if (d.clientEmail) {
    text(d.clientEmail, MARGIN, y, { size: 9, color: MUTED });
    y -= 12;
  }
  if (d.clientNif) {
    text(`NIF: ${d.clientNif}`, MARGIN, y, { size: 9, color: MUTED });
    y -= 12;
  }
  y -= 16;

  // Table
  text("DESCRIÇÃO", MARGIN, y, { font: bold, size: 8, color: MUTED });
  tr("VALOR", right, y, { font: bold, size: 8, color: MUTED });
  y -= 10;
  hr(y);
  y -= 18;

  /**
   * ── AS TRÊS PARCELAS TÊM DE FECHAR ────────────────────────────────────────
   *
   * Isto era `base = amount / (1 + vatRate)` e `vat = amount - base`, os dois em
   * vírgula flutuante e sem arredondar, com o formatador a arredondar só na
   * altura de desenhar. Enquanto o valor vem em cêntimos exactos não se nota;
   * assim que
   * traz uma terceira casa decimal — e traz, porque o `parseMoney` do painel
   * aceita "1000,005" e a rota grava o número tal e qual —, as três linhas da
   * factura deixam de dar:
   *
   *     Base de incidência   813,01 €
   *     IVA (23%)            186,99 €
   *     TOTAL              1 000,01 €     ← 813,01 + 186,99 = 1 000,00
   *
   * Um cêntimo, numa factura, é uma conversa com o contabilista. Arredonda-se
   * PRIMEIRO o total (é o que o cliente paga e o que sai impresso a negrito),
   * tira-se-lhe a base, e o IVA é o que SOBRA — por subtracção, nunca por
   * `base × taxa`. É a mesma disciplina do `splitSinal` no `money.ts`, e pela
   * mesma razão: as parcelas fecham sempre o total, aconteça o que acontecer ao
   * arredondamento.
   */
  const total = round2(d.amount);
  const base = round2(total / (1 + d.vatRate));
  const vat = round2(total - base);

  /**
   * A descrição numa linha só corria por cima da coluna do VALOR e saía pela
   * direita da folha: a rota aceita 2000 caracteres neste campo e desenhava-os
   * todos em fila (~11 000 pontos numa folha de 595). Hoje nenhum ecrã envia
   * descrição — o PDF cai sempre no texto por omissão —, mas o campo está aberto
   * na rota e um documento fiscal ilegível não é um defeito que se descubra a
   * tempo. Quebra-se, com uma goteira de 100 pontos guardada para o valor.
   */
  const colValor = 100;
  const linhasDesc = quebrar(
    font,
    `${d.kindLabel}: ${d.description || "Serviços de decoração de eventos"}`,
    10,
    maxW - colValor,
  );
  // O bloco de totais + o estado + o rodapé precisam do que fica por baixo; sem
  // este limite, uma descrição comprida empurrava-os para fora da folha — trocar
  // um texto cortado por um TOTAL invisível não é negócio. Quando corta, corta à
  // vista, com reticências.
  const maxLinhas = Math.max(1, Math.floor((y - 166) / 13));
  const desenhadas = linhasDesc.slice(0, maxLinhas);
  if (linhasDesc.length > maxLinhas) desenhadas[maxLinhas - 1] += " […]";

  const yDaLinha = y;
  for (const linha of desenhadas) {
    text(linha, MARGIN, y, { size: 10 });
    y -= 13;
  }
  // O valor fica à altura da PRIMEIRA linha da descrição: é a linha do documento.
  tr(eurDocumento(total), right, yDaLinha, { size: 10 });
  y -= 9;
  hr(y);
  y -= 18;

  tr("Base de incidência", right - 110, y, { size: 9, color: MUTED });
  tr(eurDocumento(base), right, y, { size: 9 });
  y -= 16;
  tr(`IVA (${Math.round(d.vatRate * 100)}%)`, right - 110, y, { size: 9, color: MUTED });
  tr(eurDocumento(vat), right, y, { size: 9 });
  y -= 20;
  tr("TOTAL", right - 110, y, { font: bold, size: 12, color: MOSS });
  tr(eurDocumento(total), right, y, { font: bold, size: 12, color: MOSS });
  y -= 30;

  // Status
  text(d.paid ? "PAGO" : "AGUARDA PAGAMENTO", MARGIN, y, {
    font: bold,
    size: 11,
    color: d.paid ? MOSS : rgb(0.71, 0.4, 0.29),
  });

  // Footer
  page.drawLine({
    start: { x: MARGIN, y: MARGIN - 4 },
    end: { x: right, y: MARGIN - 4 },
    thickness: 0.7,
    color: LINE,
  });
  page.drawText(`${SITE.email}   ·   ${SITE.phoneDisplay}   ·   Portugal`, {
    x: MARGIN,
    y: MARGIN - 16,
    font,
    size: 8,
    color: MUTED,
  });

  return doc.save();
}
