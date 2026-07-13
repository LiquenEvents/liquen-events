import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Proposal } from "@/lib/orcamento/types";
import { SITE } from "@/lib/site";

const MOSS = rgb(0.29, 0.486, 0.349);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

function eur(n: number, currency = "EUR"): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(n || 0);
}

interface Meta {
  eventType?: string;
  date?: string;
  guests?: number;
  location?: string;
}

/** Renders a clean, single-page A4 proposal PDF and returns the bytes. */
export async function renderProposalPdf(p: Proposal, meta: Meta = {}): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([A4.w, A4.h]);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const right = A4.w - MARGIN;
  let y = A4.h - MARGIN;

  const text = (
    s: string,
    x: number,
    yy: number,
    opts: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(s, {
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
    const f = opts.font ?? font;
    const size = opts.size ?? 10;
    text(s, xRight - f.widthOfTextAtSize(s, size), yy, opts);
  };

  const hr = (yy: number) =>
    page.drawLine({
      start: { x: MARGIN, y: yy },
      end: { x: right, y: yy },
      thickness: 0.7,
      color: LINE,
    });

  // ── Header ──
  text("LÍQUEN EVENTS", MARGIN, y, { font: bold, size: 20, color: MOSS });
  textRight("PROPOSTA", right, y, { font: bold, size: 12, color: MUTED });
  y -= 16;
  text("Organizamos eventos, eternizamos memórias.", MARGIN, y, { size: 9, color: MUTED });
  textRight(`Ref. ${p.id}`, right, y, { size: 9, color: MUTED });
  y -= 14;
  textRight(new Date(p.createdAt).toLocaleDateString("pt-PT"), right, y, { size: 9, color: MUTED });
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
  const colDesc = MARGIN;
  const colQty = right - 200;
  const colUnit = right - 120;
  const colTotal = right;

  text("DESCRIÇÃO", colDesc, y, { font: bold, size: 8, color: MUTED });
  textRight("QT", colQty + 14, y, { font: bold, size: 8, color: MUTED });
  textRight("UNIT.", colUnit + 6, y, { font: bold, size: 8, color: MUTED });
  textRight("TOTAL", colTotal, y, { font: bold, size: 8, color: MUTED });
  y -= 10;
  hr(y);
  y -= 18;

  for (const item of p.lineItems) {
    const lineTotal = item.qty * item.unitPrice;
    // wrap description to ~ colQty width
    const maxWidth = colQty - colDesc - 20;
    const words = (item.description || "").split(/\s+/);
    let line = "";
    const lines: string[] = [];
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, 10) > maxWidth && line) {
        lines.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    if (line) lines.push(line);
    if (lines.length === 0) lines.push("—");

    text(lines[0], colDesc, y, { size: 10 });
    textRight(String(item.qty), colQty + 14, y, { size: 10, color: MUTED });
    textRight(eur(item.unitPrice, p.currency), colUnit + 6, y, { size: 10, color: MUTED });
    textRight(eur(lineTotal, p.currency), colTotal, y, { size: 10 });
    y -= 14;
    for (let i = 1; i < lines.length; i++) {
      text(lines[i], colDesc, y, { size: 10 });
      y -= 14;
    }
    y -= 4;
  }

  y -= 6;
  hr(y);
  y -= 22;

  // ── Totals ──
  const totalsLabelX = colUnit + 6;
  textRight("Subtotal", totalsLabelX, y, { size: 9, color: MUTED });
  textRight(eur(p.subtotal, p.currency), colTotal, y, { size: 9 });
  y -= 16;
  textRight(`IVA (${Math.round(p.vatRate * 100)}%)`, totalsLabelX, y, { size: 9, color: MUTED });
  textRight(eur(p.vat, p.currency), colTotal, y, { size: 9 });
  y -= 20;
  textRight("TOTAL", totalsLabelX, y, { font: bold, size: 12, color: MOSS });
  textRight(eur(p.total, p.currency), colTotal, y, { font: bold, size: 12, color: MOSS });
  y -= 34;

  // ── Validity + notes ──
  if (p.validUntil) {
    text(
      `Proposta válida até ${new Date(p.validUntil + "T12:00:00").toLocaleDateString("pt-PT")}.`,
      MARGIN,
      y,
      { size: 9, color: MUTED },
    );
    y -= 18;
  }
  if (p.notes) {
    text("NOTAS", MARGIN, y, { font: bold, size: 8, color: MUTED });
    y -= 14;
    for (const raw of p.notes.split("\n")) {
      const words = raw.split(/\s+/);
      let line = "";
      const maxWidth = right - MARGIN;
      for (const w of words) {
        const test = line ? `${line} ${w}` : w;
        if (font.widthOfTextAtSize(test, 9) > maxWidth && line) {
          text(line, MARGIN, y, { size: 9, color: INK });
          y -= 13;
          line = w;
        } else {
          line = test;
        }
      }
      if (line) {
        text(line, MARGIN, y, { size: 9, color: INK });
        y -= 13;
      }
    }
  }

  // ── Footer ──
  drawFooter(page, font);

  return doc.save();
}

function drawFooter(page: PDFPage, font: PDFFont) {
  const y = MARGIN - 12;
  page.drawLine({
    start: { x: MARGIN, y: y + 16 },
    end: { x: A4.w - MARGIN, y: y + 16 },
    thickness: 0.7,
    color: LINE,
  });
  const parts = `${SITE.email}   ·   ${SITE.phoneDisplay}   ·   Portugal`;
  page.drawText(parts, { x: MARGIN, y, font, size: 8, color: MUTED });
}
