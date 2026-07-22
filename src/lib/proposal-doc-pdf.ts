import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import sharp from "sharp";
import { SITE } from "@/lib/site";
import {
  type ProposalDoc,
  type MoodBoard,
  resolveProposalMoney,
  resolveValidUntil,
} from "@/lib/proposal-doc";
import { splitThirtySeventy, eur } from "@/lib/money";
import { LOGO_DARK_PNG_B64, LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import { winAnsiSafe } from "@/lib/pdf-text";

const PT_MONTHS_SHORT = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];
/** "2026-09-12" → "12 de set. de 2026"; passes through anything unexpected. */
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return iso;
  return `${Number(m[3])} de ${PT_MONTHS_SHORT[mo - 1]} de ${m[1]}`;
}

// ── Landscape A4 ──
const W = 841.89;
const H = 595.28;
const M = 56; // page margin — generous editorial whitespace
// Max text measure: long lines (~120+ chars edge-to-edge) are the biggest "DIY"
// tell. Cap body copy near the 45–75 char ideal.
const MEASURE = 430;

// ── Brand palette ──
const MOSS = rgb(0.388, 0.478, 0.373); // #637a5f
const INK = rgb(0.165, 0.149, 0.125); // #2a2620
const MUTED = rgb(0.42, 0.4, 0.36);
const FAINT = rgb(0.55, 0.53, 0.49);
const DARK = rgb(0.047, 0.055, 0.043); // #0c0e0b
const LINE = rgb(0.886, 0.871, 0.835); // #e2ded5

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  serif: PDFFont;
  serifB: PDFFont;
  serifIt: PDFFont;
}

// ── Refined palette additions for the redesign ──
const CREAM = rgb(0.968, 0.957, 0.933); // #f7f4ee — warm off-white on the dark cover
const GOLD = rgb(0.541, 0.416, 0.114); // #8a6a1d — accent hairlines / eyebrows on light
const CREAM_DIM = rgb(0.72, 0.74, 0.71); // muted cream/sage for sub-text on dark

/** Embed image bytes into the PDF, trying JPEG then PNG by their magic bytes and
 *  never throwing. Returns null when the bytes are neither (so a bad image is
 *  simply omitted instead of failing the whole document). `embedJpg`/`embedPng`
 *  are awaited so a rejection (e.g. "SOI not found in JPEG") is caught here. */
async function embedImage(doc: PDFDocument, bytes: Buffer): Promise<PDFImage | null> {
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  if (isJpg) {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      /* fall through */
    }
  }
  if (isPng) {
    try {
      return await doc.embedPng(bytes);
    } catch {
      /* fall through */
    }
  }
  // Unknown/none of the magic bytes matched — last-resort attempts, still guarded.
  try {
    return await doc.embedJpg(bytes);
  } catch {
    try {
      return await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

/** Decode a base64 (optionally data:-prefixed) image and cover-crop it to the
 *  target point box via sharp, returning an embedded PDFImage. Rendered at 2×
 *  for crispness; smart-cropped so faces/subjects survive the crop. Any failure
 *  (bad bytes, sharp unavailable, non-JPEG output) degrades to embedding the
 *  original image, and finally to null — the PDF is always produced. */
async function coverImage(
  doc: PDFDocument,
  b64: string,
  wPt: number,
  hPt: number,
): Promise<PDFImage | null> {
  const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  let input: Buffer;
  try {
    input = Buffer.from(raw, "base64");
  } catch {
    return null;
  }
  if (input.length < 32) return null;

  let cropped: Buffer | null = null;
  try {
    cropped = await sharp(input)
      .rotate()
      .resize(Math.max(1, Math.round(wPt * 2)), Math.max(1, Math.round(hPt * 2)), {
        fit: "cover",
        position: "attention",
      })
      .jpeg({ quality: 82 })
      .toBuffer();
  } catch {
    cropped = null; // sharp unavailable/failed — fall back to the original bytes
  }

  if (cropped) {
    const img = await embedImage(doc, cropped);
    if (img) return img;
  }
  // Fallback: embed the original image as-is (may not be perfectly cropped, but
  // it shows) rather than dropping it or crashing the whole proposal.
  return embedImage(doc, input);
}

function wrap(font: PDFFont, rawText: string, size: number, maxWidth: number): string[] {
  // Sanitiza para WinAnsi antes de medir/quebrar — descrições e notas do
  // documento podem trazer caracteres que a Helvetica não codifica.
  const text = winAnsiSafe(rawText);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

export async function renderProposalDocPdf(doc: ProposalDoc): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const f: Fonts = {
    reg: await pdf.embedFont(StandardFonts.Helvetica),
    bold: await pdf.embedFont(StandardFonts.HelveticaBold),
    serif: await pdf.embedFont(StandardFonts.TimesRoman),
    serifB: await pdf.embedFont(StandardFonts.TimesRomanBold),
    serifIt: await pdf.embedFont(StandardFonts.TimesRomanItalic),
  };
  const logoDark = await pdf.embedPng(Buffer.from(LOGO_DARK_PNG_B64, "base64"));
  const logoWhite = await pdf.embedPng(Buffer.from(LOGO_WHITE_PNG_B64, "base64"));

  // Sanitiza no ponto de desenho: campos do documento (nomes, descrições…) podem
  // conter caracteres que o WinAnsi/Helvetica não codifica (→ drawText lança).
  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    p.drawText(winAnsiSafe(s), {
      x,
      y,
      font: o.font ?? f.reg,
      size: o.size ?? 10,
      color: o.color ?? INK,
    });

  const textRight = (
    p: PDFPage,
    s: string,
    xR: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = winAnsiSafe(s);
    const fn = o.font ?? f.reg;
    const sz = o.size ?? 10;
    p.drawText(safe, {
      x: xR - fn.widthOfTextAtSize(safe, sz),
      y,
      font: fn,
      size: sz,
      color: o.color ?? INK,
    });
  };

  // Centred text helper (used on the cover).
  const textCenter = (
    p: PDFPage,
    s: string,
    cx: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; tracking?: number } = {},
  ) => {
    const safe = winAnsiSafe(s);
    const fn = o.font ?? f.reg;
    const sz = o.size ?? 10;
    if (o.tracking) {
      // Letter-spaced small caps (eyebrows) — draw glyph by glyph.
      let w = 0;
      for (const ch of safe) w += fn.widthOfTextAtSize(ch, sz) + o.tracking;
      w -= o.tracking;
      let x = cx - w / 2;
      for (const ch of safe) {
        p.drawText(ch, { x, y, font: fn, size: sz, color: o.color ?? INK });
        x += fn.widthOfTextAtSize(ch, sz) + o.tracking;
      }
      return;
    }
    p.drawText(safe, {
      x: cx - fn.widthOfTextAtSize(safe, sz) / 2,
      y,
      font: fn,
      size: sz,
      color: o.color ?? INK,
    });
  };

  // Content-page header: colour logo top-left, running ref top-right.
  const header = (p: PDFPage) => {
    const lw = 84;
    const lh = (logoDark.height / logoDark.width) * lw;
    p.drawImage(logoDark, { x: M, y: H - M - lh + 6, width: lw, height: lh });
    textRight(p, doc.ref, W - M, H - M - 4, { size: 8.5, color: FAINT });
  };

  // Slim footer: hairline + brand + centred page number. Called on every content
  // page so the document reads as one considered, paginated piece.
  const footer = (p: PDFPage, pageNum: number) => {
    p.drawLine({
      start: { x: M, y: M - 6 },
      end: { x: W - M, y: M - 6 },
      thickness: 0.6,
      color: LINE,
    });
    let bx = M;
    for (const ch of "LÍQUEN EVENTS") {
      p.drawText(ch, { x: bx, y: M - 20, font: f.bold, size: 7, color: FAINT });
      bx += f.bold.widthOfTextAtSize(ch, 7) + 1.2;
    }
    textRight(p, SITE.email, W - M, M - 20, { size: 7.5, color: FAINT });
    textCenter(p, `— ${String(pageNum).padStart(2, "0")} —`, W / 2, M - 20, {
      size: 8,
      color: FAINT,
    });
  };

  // A page frame = header + footer, returning the starting y for the body.
  let pageNo = 0;
  const frame = (p: PDFPage): number => {
    pageNo += 1;
    header(p);
    footer(p, pageNo);
    return H - M - 78;
  };

  // Section header: gold eyebrow (letter-spaced) + serif title + a short moss
  // rule. The one consistent "voice" for every section start.
  const eyebrow = (p: PDFPage, s: string, x: number, y: number, color = GOLD) => {
    const sz = 8;
    let cx = x;
    for (const ch of winAnsiSafe(s.toUpperCase())) {
      p.drawText(ch, { x: cx, y, font: f.bold, size: sz, color });
      cx += f.bold.widthOfTextAtSize(ch, sz) + 1.6;
    }
  };
  const sectionHeader = (p: PDFPage, kicker: string, title: string, y: number): number => {
    eyebrow(p, kicker, M, y);
    text(p, title, M, y - 22, { font: f.serifB, size: 21, color: INK });
    p.drawRectangle({ x: M, y: y - 34, width: 46, height: 2, color: MOSS });
    return y - 52;
  };

  // ── Page 1 — Cover ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });

    const hasImgs = !!(doc.coverImages[0] || doc.coverImages[1]);
    if (hasImgs) {
      // Two side photos flanking a centre band — the editorial "gatefold" look.
      const panelW = W * 0.34;
      const sideW = (W - panelW) / 2;
      const left = doc.coverImages[0] ? await coverImage(pdf, doc.coverImages[0], sideW, H) : null;
      const right = doc.coverImages[1] ? await coverImage(pdf, doc.coverImages[1], sideW, H) : null;
      if (left) p.drawImage(left, { x: 0, y: 0, width: sideW, height: H });
      if (right) p.drawImage(right, { x: sideW + panelW, y: 0, width: sideW, height: H });
      p.drawRectangle({ x: sideW, y: 0, width: panelW, height: H, color: DARK });
    }

    const cx = W / 2;
    // Thin cream frame inset from the trim — a quiet mark of craft.
    const inset = 22;
    p.drawRectangle({
      x: inset,
      y: inset,
      width: W - 2 * inset,
      height: H - 2 * inset,
      borderColor: rgb(0.32, 0.34, 0.31),
      borderWidth: 0.6,
      color: DARK,
    });

    // White logo, upper area.
    const lw = 148;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H - 150, width: lw, height: lh });

    // Eyebrow (gold small-caps) + gold rule.
    const kicker =
      doc.template === "organizacao" ? "Proposta · Organização" : "Proposta · Decoração";
    textCenter(p, kicker.toUpperCase(), cx, 336, {
      font: f.bold,
      size: 9,
      color: rgb(0.72, 0.6, 0.34),
      tracking: 3.2,
    });
    p.drawRectangle({ x: cx - 26, y: 324, width: 52, height: 1.1, color: rgb(0.72, 0.6, 0.34) });

    // Couple/client name — shrink-to-fit, then wrap to two lines as a last resort
    // so long names never overflow the trim or the centre band.
    // Sanitiza para WinAnsi ANTES de medir: widthOfTextAtSize lança em glifos
    // fora do WinAnsi (emoji/CJK num nome de cliente), o que rebentaria o PDF
    // inteiro aqui na capa em vez de degradar graciosamente.
    const names = winAnsiSafe(doc.clientNames || "");
    const maxNameW = (hasImgs ? W * 0.34 : W * 0.72) - 16;
    let nameSize = 52;
    while (nameSize > 26 && f.serif.widthOfTextAtSize(names, nameSize) > maxNameW) nameSize -= 2;
    if (f.serif.widthOfTextAtSize(names, nameSize) > maxNameW) {
      const nl = wrap(f.serif, names, nameSize, maxNameW).slice(0, 2);
      let ny = 278;
      for (const ln of nl) {
        textCenter(p, ln, cx, ny, { font: f.serif, size: nameSize, color: CREAM });
        ny -= nameSize * 1.05;
      }
    } else {
      textCenter(p, names, cx, 262, { font: f.serif, size: nameSize, color: CREAM });
    }

    const sub = [doc.eventType, doc.eventDate].filter(Boolean).join("   ·   ");
    if (sub)
      textCenter(p, sub, cx, 214, { font: f.reg, size: 11, color: CREAM_DIM, tracking: 1.4 });
    if (doc.location)
      textCenter(p, doc.location, cx, 194, { font: f.serifIt, size: 11, color: FAINT });
  }

  // ── Page 2 — Apresentação + Serviços ──
  {
    const org = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    const ensure = (need: number) => {
      if (y - need < M + 6) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };
    y = sectionHeader(p, "A Proposta", "Apresentação", y);

    // Client / couple name in serif — the personal headline of the document.
    text(p, org ? "Cliente" : "Noivos", M, y, { font: f.bold, size: 8, color: GOLD });
    text(p, doc.clientNames, M, y - 22, { font: f.serif, size: 22, color: INK });
    y -= 48;

    // Warm opening — a short, personalised welcome sets the tone before the facts.
    const evento = (doc.eventType || "evento").toLowerCase();
    const nomes = doc.clientNames || (org ? "Cliente" : "Noivos");
    const welcome =
      `Caros ${nomes}, foi com muito gosto que preparámos esta proposta para o vosso ${evento}. ` +
      "Reunimos aqui a nossa visão, pensada ao pormenor para tornar este momento único. " +
      "Estamos ao vosso lado em cada passo.";
    for (const ln of wrap(f.serifIt, welcome, 11.5, MEASURE + 90)) {
      text(p, ln, M, y, { font: f.serifIt, size: 11.5, color: MUTED });
      y -= 16;
    }
    y -= 18;

    // Event details as a calm tinted band of labelled columns.
    const details: [string, string][] = [
      ...(!org && doc.eventType ? ([["Evento", doc.eventType]] as [string, string][]) : []),
      ...(doc.eventDate ? ([["Data", doc.eventDate]] as [string, string][]) : []),
      ...(doc.location ? ([["Local", doc.location]] as [string, string][]) : []),
      ...(doc.guests ? ([["Convidados", doc.guests]] as [string, string][]) : []),
      ...(!org && doc.ceremony ? ([["Cerimónia", doc.ceremony]] as [string, string][]) : []),
      ...(!org && doc.time ? ([["Hora", doc.time]] as [string, string][]) : []),
    ];
    if (details.length) {
      const cols = Math.min(3, details.length);
      const rows = Math.ceil(details.length / cols);
      const pad = 16;
      const bandH = rows * 40 + pad;
      p.drawRectangle({
        x: M,
        y: y - bandH,
        width: W - 2 * M,
        height: bandH,
        color: rgb(0.973, 0.968, 0.957),
      });
      p.drawRectangle({ x: M, y: y - bandH, width: 2.5, height: bandH, color: MOSS });
      const colW = (W - 2 * M - pad * 2) / cols;
      details.forEach(([k, v], i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cxp = M + pad + c * colW;
        const cyp = y - pad - r * 40;
        eyebrow(p, k, cxp, cyp - 8);
        for (const [j, ln] of wrap(f.reg, v, 10.5, colW - 10)
          .slice(0, 2)
          .entries()) {
          text(p, ln, cxp, cyp - 24 - j * 12, { font: f.serif, size: 11.5, color: INK });
        }
      });
      y -= bandH + 26;
    }

    y = sectionHeader(p, "O que propomos", "Serviços", y);
    const descSize = org ? 9.5 : 10;
    for (const g of doc.serviceGroups) {
      ensure(30);
      // Group title in serif with a moss ordinal marker for a designed feel.
      if (g.letter) text(p, g.letter, M, y, { font: f.serifB, size: 12, color: MOSS });
      const letterW = g.letter ? f.serifB.widthOfTextAtSize(winAnsiSafe(g.letter) + " ", 12) : 0;
      text(p, g.title, M + letterW, y, {
        font: f.serifB,
        size: 12,
        color: INK,
      });
      y -= 20;
      for (const it of g.items) {
        p.drawCircle({ x: M + 12, y: y + 3, size: 1.4, color: MOSS });
        if (it.desc) {
          // Sanitiza aqui também: `lab` é medido diretamente com
          // widthOfTextAtSize (que lança em glifos fora do WinAnsi).
          const lab = winAnsiSafe(`${it.label}: `);
          text(p, lab, M + 24, y, { font: f.bold, size: descSize });
          const dx = M + 24 + f.bold.widthOfTextAtSize(lab, descSize);
          const lines = wrap(f.reg, it.desc, descSize, W - M - dx);
          text(p, lines[0] ?? "", dx, y, { size: descSize });
          y -= descSize + 6;
          for (let i = 1; i < lines.length; i++) {
            ensure(descSize + 4);
            text(p, lines[i], M + 24, y, { size: descSize });
            y -= descSize + 5;
          }
        } else {
          text(p, it.label, M + 24, y, { size: descSize });
          y -= descSize + 6;
        }
        ensure(descSize + 8);
      }
      y -= 8;
    }
  }

  // ── Cronograma de Organização (Organização template) ──
  if (doc.cronograma && doc.cronograma.length) {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, "Como avançamos", "Cronograma de Organização", y);
    for (const phase of doc.cronograma) {
      if (y - 24 < M) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      text(p, phase.title, M, y, { font: f.serifB, size: 12, color: INK });
      y -= 18;
      for (const it of phase.items) {
        const lines = wrap(f.reg, it, 10, W - 2 * M - 24);
        p.drawCircle({ x: M + 12, y: y + 3, size: 1.4, color: INK });
        for (const ln of lines) {
          text(p, ln, M + 24, y, { size: 10 });
          y -= 15;
        }
      }
      y -= 10;
    }
  }

  // ── Mood board pages (skip empty boards — never show a client a placeholder) ──
  for (const mb of doc.moodBoards) {
    if (!mb.images || mb.images.length === 0) continue;
    const p = pdf.addPage([W, H]);
    frame(p);
    eyebrow(p, "Inspiração", M, H - M - 44);
    text(p, mb.title, M, H - M - 72, { font: f.serifIt, size: 26, color: INK });
    await drawCollage(pdf, p, mb, f, textFns(text, textRight));
  }

  // ── Orçamento ──
  {
    // Branch on TEMPLATE, not on whether rows exist — an Organização proposal
    // with no priced rows must never fall into the Decoração reserva wording.
    const orgT = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    const firstBudgetPage = p;
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, "O investimento", "Orçamento Proposto", y);

    const totalStr = orgT ? (doc.totalEstimatedText ?? "") : doc.totalText;
    const totalLbl = orgT ? "Total Estimado" : doc.totalLabel;
    const boxW = MEASURE;
    const boxH = 58;
    const drawTotalBox = (pg: PDFPage, ty: number) => {
      pg.drawRectangle({ x: M, y: ty - boxH, width: boxW, height: boxH, color: DARK });
      pg.drawRectangle({ x: M, y: ty - boxH, width: 3, height: boxH, color: MOSS });
      let lx = M + 22;
      for (const ch of winAnsiSafe(totalLbl.toUpperCase())) {
        pg.drawText(ch, { x: lx, y: ty - 24, font: f.bold, size: 8, color: rgb(0.72, 0.6, 0.34) });
        lx += f.bold.widthOfTextAtSize(ch, 8) + 1.6;
      }
      const amount = totalStr || "—";
      pg.drawText(winAnsiSafe(amount), {
        x: M + boxW - 22 - f.serifB.widthOfTextAtSize(winAnsiSafe(amount), 23),
        y: ty - 38,
        font: f.serifB,
        size: 23,
        color: CREAM,
      });
    };

    // Column header row.
    eyebrow(p, "Item", M, y);
    textRight(p, orgT ? "Preço Estimado" : "Preço", M + boxW, y, {
      font: f.bold,
      size: 8,
      color: GOLD,
    });
    y -= 10;
    p.drawLine({ start: { x: M, y }, end: { x: M + boxW, y }, thickness: 0.5, color: LINE });
    y -= 20;

    // Start a fresh page when the next row (or block) won't fit above the footer.
    const budgetBreak = (need: number) => {
      if (y - need < M + 30) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };

    if (orgT) {
      for (const r of doc.budgetRows ?? []) {
        budgetBreak(20);
        text(p, r.item, M, y, { size: 10.5, color: INK });
        textRight(p, r.price, M + boxW, y, { size: 10.5, color: MUTED });
        y -= 20;
      }
    } else {
      for (const it of doc.budgetItems) {
        budgetBreak(19);
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.3, color: MOSS });
        text(p, it, M + 14, y, { size: 10.5, color: INK });
        y -= 19;
      }
    }

    budgetBreak(boxH + 24);
    y -= 12;
    drawTotalBox(p, y);
    y -= boxH + 20;

    // Payment schedule with the actual amounts (30% sinal / 70% saldo) — the
    // clarity a client wants right under the total. Amounts come from the same
    // money resolver the invoicing uses, so they always agree.
    const money = resolveProposalMoney(doc);
    if (money.gross > 0) {
      const { sinal, saldo } = splitThirtySeventy(money.gross);
      budgetBreak(58);
      eyebrow(p, "Faseamento do pagamento", M, y);
      y -= 18;
      text(p, `Sinal 30%   ${eur(sinal)}`, M, y, { font: f.serif, size: 12, color: INK });
      textRight(p, "na adjudicação, para reservar a data", M + boxW, y, {
        size: 9.5,
        color: MUTED,
      });
      y -= 17;
      text(p, `Saldo 70%   ${eur(saldo)}`, M, y, { font: f.serif, size: 12, color: INK });
      textRight(p, "até 1 mês antes do evento", M + boxW, y, { size: 9.5, color: MUTED });
      y -= 20;
    }

    if (doc.budgetNote) {
      budgetBreak(30);
      for (const ln of wrap(f.reg, `Nota: ${doc.budgetNote}`, 9, boxW)) {
        text(p, ln, M, y, { size: 9, color: MUTED });
        y -= 13;
      }
    }

    // Reservation notes — a right-hand column, anchored on the FIRST budget page
    // (independent of how far the left list paginated). Shown for both templates.
    let ry = H - M - 64;
    const rx = M + 490;
    const rW = W - M - rx;
    const rHead = (t: string) => {
      text(firstBudgetPage, t, rx, ry, { font: f.serifB, size: 12, color: INK });
      firstBudgetPage.drawRectangle({ x: rx, y: ry - 7, width: 26, height: 1.5, color: MOSS });
      ry -= 22;
    };
    rHead("Notas importantes");
    ry = bullets(firstBudgetPage, doc.notasImportantes, rx, ry, rW, f, 8.5);
    ry -= 14;
    rHead("Condições de reserva");
    text(firstBudgetPage, "Incluído na proposta", rx, ry, { font: f.bold, size: 7.5, color: GOLD });
    ry -= 13;
    ry = bullets(firstBudgetPage, doc.incluido, rx, ry, rW, f, 8.5);
    ry -= 8;
    text(firstBudgetPage, "Não incluído", rx, ry, { font: f.bold, size: 7.5, color: GOLD });
    ry -= 13;
    bullets(firstBudgetPage, doc.naoIncluido, rx, ry, rW, f, 8.5);
  }

  // ── Condições Gerais (two columns for a comfortable reading measure) ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    const yTop = sectionHeader(p, "Para sua tranquilidade", "Condições Gerais", H - M - 64);
    const gutter = 34;
    const colW = (W - 2 * M - gutter) / 2;
    const colX = [M, M + colW + gutter];
    let col = 0;
    let y = yTop;
    for (const c of doc.condicoesGerais) {
      const lines = wrap(f.reg, c, 9, colW - 14);
      if (y - lines.length * 12 - 6 < M + 4) {
        // Column full → next column, or a new page after the second column.
        if (col === 0) {
          col = 1;
          y = yTop;
        } else {
          p = pdf.addPage([W, H]);
          frame(p);
          col = 0;
          y = H - M - 64;
        }
      }
      const x = colX[col];
      p.drawCircle({ x: x + 3, y: y + 3, size: 1.3, color: MOSS });
      for (const ln of lines) {
        text(p, ln, x + 14, y, { size: 9 });
        y -= 12;
      }
      y -= 6;
    }
  }

  // ── Observações / Faseamento / Cancelamento / Contactos ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    const maxW = MEASURE; // capped reading measure
    const subHead = (title: string) => {
      if (y - 40 < M) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      text(p, title, M, y, { font: f.serifB, size: 15, color: INK });
      p.drawRectangle({ x: M, y: y - 8, width: 32, height: 1.5, color: MOSS });
      y -= 26;
    };
    const section = (title: string, items: string[], size = 9) => {
      subHead(title);
      for (const it of items) {
        const lines = wrap(f.reg, it, size, maxW - 16);
        if (y - lines.length * 12 < M + 10) {
          p = pdf.addPage([W, H]);
          frame(p);
          y = H - M - 64;
        }
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.3, color: MOSS });
        for (const ln of lines) {
          text(p, ln, M + 14, y, { size });
          y -= 12;
        }
        y -= 5;
      }
      y -= 14;
    };

    // Próximos passos — the clear "what happens next", with the validity date.
    const validUntil = prettyDate(resolveValidUntil(doc));
    subHead("Próximos Passos");
    for (const line of [
      "Para confirmar esta proposta, basta aceitá-la online através da ligação enviada no e-mail, ou responder-nos diretamente.",
      "A reserva da data só fica garantida após o pagamento do sinal.",
      `Esta proposta é válida até ${validUntil}.`,
    ]) {
      const lines = wrap(f.reg, line, 10, maxW - 16);
      p.drawCircle({ x: M + 3, y: y + 3, size: 1.3, color: MOSS });
      for (const ln of lines) {
        text(p, ln, M + 14, y, { size: 10 });
        y -= 14;
      }
      y -= 4;
    }
    y -= 14;

    section("Observações Gerais", doc.observacoesGerais);
    section("Faseamento do Pagamento", doc.faseamento);
    section("Cancelamento", doc.cancelamento);

    // Contactos
    subHead("Contactos");
    eyebrow(p, "Email", M, y);
    text(p, SITE.email, M + 70, y, { size: 10.5, color: INK });
    y -= 18;
    eyebrow(p, "Telefone", M, y);
    text(p, SITE.phoneDisplay, M + 70, y, { size: 10.5, color: INK });
  }

  // ── Back cover — a silent, dark closing page that bookends the cover. ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });
    // Thin cream frame inset from the trim — a quiet mark of craft.
    const inset = 22;
    p.drawRectangle({
      x: inset,
      y: inset,
      width: W - 2 * inset,
      height: H - 2 * inset,
      borderColor: rgb(0.32, 0.34, 0.31),
      borderWidth: 0.6,
      color: DARK,
    });
    const cx = W / 2;
    textCenter(p, "OBRIGADA", cx, H * 0.62, {
      font: f.bold,
      size: 9,
      color: rgb(0.72, 0.6, 0.34),
      tracking: 3,
    });
    textCenter(p, "Por nos deixarem fazer parte deste momento.", cx, H * 0.56, {
      font: f.serifIt,
      size: 13,
      color: CREAM,
    });
    const lw = 168;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H * 0.3, width: lw, height: lh });
    textCenter(p, SITE.slogan, cx, H * 0.3 - 18, { font: f.serifIt, size: 10.5, color: CREAM_DIM });
  }

  return pdf.save();
}

// Small helper factory so the collage function can reuse the closures.
function textFns(
  text: (p: PDFPage, s: string, x: number, y: number, o?: object) => void,
  textRight: (p: PDFPage, s: string, xR: number, y: number, o?: object) => void,
) {
  return { text, textRight };
}

/** Auto-layout collage of a mood board's images across the page body. */
async function drawCollage(
  pdf: PDFDocument,
  p: PDFPage,
  mb: MoodBoard,
  f: Fonts,
  fns: ReturnType<typeof textFns>,
) {
  const top = H - M - 112;
  const bottom = M + (mb.annotation ? 40 : 8);
  const areaW = W - 2 * M;
  const areaH = top - bottom;
  const imgs = mb.images.slice(0, 6);
  const n = imgs.length;
  const gap = 8;

  // Draw one framed image into a box (cover-cropped, thin hairline frame).
  const place = async (b64: string, x: number, yBottom: number, w: number, h: number) => {
    const img = await coverImage(pdf, b64, w, h);
    if (img) p.drawImage(img, { x, y: yBottom, width: w, height: h });
    p.drawRectangle({ x, y: yBottom, width: w, height: h, borderColor: LINE, borderWidth: 0.5 });
  };

  if (n === 1) {
    await place(imgs[0], M, bottom, areaW, areaH);
  } else if (n === 2) {
    const cw = (areaW - gap) / 2;
    await place(imgs[0], M, bottom, cw, areaH);
    await place(imgs[1], M + cw + gap, bottom, cw, areaH);
  } else {
    // Feature layout: a large left image + the rest as a grid on the right.
    const featW = areaW * 0.56;
    await place(imgs[0], M, bottom, featW, areaH);
    const rest = imgs.slice(1);
    const rx = M + featW + gap;
    const rW = areaW - featW - gap;
    const rCols = rest.length <= 2 ? 1 : 2;
    const rRows = Math.ceil(rest.length / rCols);
    const cw = (rW - gap * (rCols - 1)) / rCols;
    const ch = (areaH - gap * (rRows - 1)) / rRows;
    for (let i = 0; i < rest.length; i++) {
      const r = Math.floor(i / rCols);
      const c = i % rCols;
      const x = rx + c * (cw + gap);
      const yTop = top - r * (ch + gap);
      await place(rest[i], x, yTop - ch, cw, ch);
    }
  }

  if (mb.annotation) {
    fns.text(p, mb.annotation, M, M + 14, { font: f.serifIt, size: 12, color: MUTED });
  }
}

function bullets(
  p: PDFPage,
  items: string[],
  x: number,
  y: number,
  maxW: number,
  f: Fonts,
  size: number,
): number {
  for (const it of items) {
    const lines = wrap(f.reg, it, size, maxW - 12);
    p.drawCircle({ x: x + 2, y: y + 3, size: 1.2, color: INK });
    for (const ln of lines) {
      p.drawText(ln, { x: x + 11, y, font: f.reg, size, color: INK });
      y -= size + 3;
    }
    y -= 3;
  }
  return y;
}
