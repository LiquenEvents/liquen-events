import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

const MOSS = rgb(0.29, 0.486, 0.349);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

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
  let y = A4.h - MARGIN;

  const text = (
    s: string,
    x: number,
    yy: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    page.drawText(s, { x, y: yy, font: o.font ?? font, size: o.size ?? 10, color: o.color ?? INK });
  const tr = (
    s: string,
    xr: number,
    yy: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const f = o.font ?? font;
    const size = o.size ?? 10;
    text(s, xr - f.widthOfTextAtSize(s, size), yy, o);
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
  tr("RECIBO", right, y, { font: bold, size: 12, color: MUTED });
  y -= 16;
  text("Organizamos eventos, eternizamos memórias.", MARGIN, y, { size: 9, color: MUTED });
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
  text(d.clientName || "—", MARGIN, y, { font: bold, size: 11 });
  y -= 14;
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

  const base = d.amount / (1 + d.vatRate);
  const vat = d.amount - base;

  text(`${d.kindLabel} — ${d.description || "Serviços de organização de eventos"}`, MARGIN, y, {
    size: 10,
  });
  tr(eur(d.amount), right, y, { size: 10 });
  y -= 22;
  hr(y);
  y -= 18;

  tr("Base de incidência", right - 110, y, { size: 9, color: MUTED });
  tr(eur(base), right, y, { size: 9 });
  y -= 16;
  tr(`IVA (${Math.round(d.vatRate * 100)}%)`, right - 110, y, { size: 9, color: MUTED });
  tr(eur(vat), right, y, { size: 9 });
  y -= 20;
  tr("TOTAL", right - 110, y, { font: bold, size: 12, color: MOSS });
  tr(eur(d.amount), right, y, { font: bold, size: 12, color: MOSS });
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
  page.drawText("liquen.alentejo@gmail.com   ·   +351 919 259 820   ·   Portugal", {
    x: MARGIN,
    y: MARGIN - 16,
    font,
    size: 8,
    color: MUTED,
  });

  return doc.save();
}
