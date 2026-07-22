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
import type { ProposalDoc, MoodBoard } from "@/lib/proposal-doc";
import { LOGO_DARK_PNG_B64, LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import { winAnsiSafe } from "@/lib/pdf-text";

// ── Landscape A4 ──
const W = 841.89;
const H = 595.28;
const M = 48; // page margin

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
    text(p, "LÍQUEN EVENTS", M, M - 20, { font: f.bold, size: 7, color: FAINT });
    textRight(p, SITE.email, W - M, M - 20, { size: 7.5, color: FAINT });
    textCenter(p, String(pageNum), W / 2, M - 20, { size: 8, color: FAINT });
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
    // White logo, upper third.
    const lw = 150;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H * 0.66, width: lw, height: lh });

    // Personalised title block: eyebrow + names (serif) + event · date.
    const kicker =
      doc.template === "organizacao" ? "Proposta · Organização" : "Proposta · Decoração";
    textCenter(p, kicker.toUpperCase(), cx, H * 0.52, {
      font: f.bold,
      size: 9,
      color: rgb(0.8, 0.83, 0.79),
      tracking: 3,
    });
    // Thin gold rule under the eyebrow.
    p.drawRectangle({ x: cx - 26, y: H * 0.52 - 12, width: 52, height: 1.2, color: MOSS });

    const names = doc.clientNames || "";
    const nameSize = names.length > 28 ? 30 : 40;
    textCenter(p, names, cx, H * 0.4, { font: f.serif, size: nameSize, color: CREAM });

    const sub = [doc.eventType, doc.eventDate].filter(Boolean).join("  ·  ");
    if (sub) {
      textCenter(p, sub, cx, H * 0.32, {
        font: f.reg,
        size: 11,
        color: rgb(0.78, 0.81, 0.77),
        tracking: 1.2,
      });
    }
    if (doc.location) {
      textCenter(p, doc.location, cx, H * 0.32 - 18, { font: f.serifIt, size: 11, color: FAINT });
    }
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
    text(p, doc.clientNames, M, y - 22, { font: f.serifB, size: 18, color: INK });
    y -= 44;

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
      text(p, g.title, M + (g.letter ? f.serifB.widthOfTextAtSize(g.letter + " ", 12) : 0), y, {
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

  // ── Mood board pages ──
  for (const mb of doc.moodBoards) {
    const p = pdf.addPage([W, H]);
    frame(p);
    eyebrow(p, "Inspiração", M, H - M - 48);
    text(p, mb.title, M, H - M - 74, { font: f.serifIt, size: 26, color: INK });
    await drawCollage(pdf, p, mb, f, textFns(text, textRight));
  }

  // ── Orçamento ──
  {
    const orgT = doc.template === "organizacao";
    const p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, "O investimento", "Orçamento Proposto", y);

    // Highlighted total block — the number the client is looking for, framed.
    const totalStr = orgT ? (doc.totalEstimatedText ?? "") : doc.totalText;
    const totalLbl = orgT ? "Total Estimado" : doc.totalLabel;
    const boxW = 430;
    const boxH = 56;
    const drawTotalBox = (ty: number) => {
      p.drawRectangle({
        x: M,
        y: ty - boxH,
        width: boxW,
        height: boxH,
        color: rgb(0.11, 0.135, 0.106),
      });
      text(p, totalLbl.toUpperCase(), M + 20, ty - 22, {
        font: f.bold,
        size: 8,
        color: rgb(0.7, 0.74, 0.69),
      });
      text(p, totalStr || "—", M + 20, ty - 44, { font: f.serifB, size: 20, color: CREAM });
    };

    text(p, "Item", M, y, { font: f.bold, size: 8, color: GOLD });
    text(p, orgT ? "Preço Estimado (€)" : "Preço (€)", M + 320, y, {
      font: f.bold,
      size: 8,
      color: GOLD,
    });
    y -= 8;
    p.drawLine({ start: { x: M, y }, end: { x: M + boxW, y }, thickness: 0.7, color: LINE });
    y -= 20;

    if (orgT && doc.budgetRows?.length) {
      // Per-item estimated values (Organização model).
      for (const r of doc.budgetRows) {
        text(p, r.item, M, y, { size: 10.5, color: INK });
        textRight(p, r.price, M + boxW, y, { size: 10.5, color: MUTED });
        y -= 20;
      }
      y -= 10;
      drawTotalBox(y);
      y -= boxH + 8;
      if (doc.budgetNote) {
        y -= 8;
        for (const ln of wrap(f.reg, `Nota: ${doc.budgetNote}`, 9, boxW)) {
          text(p, ln, M, y, { size: 9, color: MUTED });
          y -= 13;
        }
      }
    } else {
      // Grouped total (Decoração model) + right-hand notes.
      for (const it of doc.budgetItems) {
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.4, color: MOSS });
        text(p, it, M + 14, y, { size: 10.5, color: INK });
        y -= 19;
      }
      y -= 12;
      drawTotalBox(y);
      y -= boxH + 8;

      let ry = H - M - 64;
      const rx = M + 470;
      const rW = W - M - rx;
      text(p, "Notas Importantes", rx, ry, { font: f.bold, size: 11 });
      ry -= 18;
      ry = bullets(p, doc.notasImportantes, rx, ry, rW, f, 9);
      ry -= 12;
      text(p, "Condições de Reserva", rx, ry, { font: f.bold, size: 11 });
      ry -= 16;
      text(p, "Incluído na proposta:", rx, ry, { font: f.bold, size: 8.5, color: MUTED });
      ry -= 14;
      ry = bullets(p, doc.incluido, rx, ry, rW, f, 8.5);
      ry -= 8;
      text(p, "Não incluído no orçamento:", rx, ry, { font: f.bold, size: 8.5, color: MUTED });
      ry -= 14;
      bullets(p, doc.naoIncluido, rx, ry, rW, f, 8.5);
    }
  }

  // ── Condições Gerais ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, "Para sua tranquilidade", "Condições Gerais", y);
    const maxW = W - 2 * M;
    for (const c of doc.condicoesGerais) {
      const lines = wrap(f.reg, c, 9, maxW - 16);
      if (y - lines.length * 12 < M + 10) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      p.drawCircle({ x: M + 3, y: y + 3, size: 1.3, color: INK });
      for (let i = 0; i < lines.length; i++) {
        text(p, lines[i], M + 14, y, { size: 9 });
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
    const maxW = W - 2 * M;
    const section = (title: string, items: string[], size = 9) => {
      if (y - 40 < M) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      text(p, title, M, y, { font: f.serifB, size: 15, color: INK });
      p.drawRectangle({ x: M, y: y - 8, width: 32, height: 1.5, color: MOSS });
      y -= 26;
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
    section("Observações Gerais", doc.observacoesGerais);
    section("Faseamento do Pagamento", doc.faseamento);
    section("Cancelamento", doc.cancelamento);
    // Contactos
    if (y - 40 < M) {
      p = pdf.addPage([W, H]);
      frame(p);
      y = H - M - 64;
    }
    text(p, "Contactos", M, y, { font: f.serifB, size: 15, color: INK });
    p.drawRectangle({ x: M, y: y - 8, width: 32, height: 1.5, color: MOSS });
    y -= 28;
    eyebrow(p, "Email", M, y);
    text(p, SITE.email, M + 64, y, { size: 10.5, color: INK });
    y -= 18;
    eyebrow(p, "Telefone", M, y);
    text(p, SITE.phoneDisplay, M + 64, y, { size: 10.5, color: INK });
  }

  // ── Back cover ──
  {
    const p = pdf.addPage([W, H]);
    frame(p);
    const lw = 200;
    const lh = (logoDark.height / logoDark.width) * lw;
    p.drawImage(logoDark, { x: (W - lw) / 2, y: (H - lh) / 2, width: lw, height: lh });
    text(
      p,
      SITE.slogan,
      W / 2 - f.serifIt.widthOfTextAtSize(SITE.slogan, 11) / 2,
      (H - lh) / 2 - 20,
      {
        font: f.serifIt,
        size: 11,
        color: MUTED,
      },
    );
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
  const top = H - M - 96;
  const bottom = M + (mb.annotation ? 40 : 8);
  const areaW = W - 2 * M;
  const areaH = top - bottom;
  const imgs = mb.images.slice(0, 6);
  const n = imgs.length;
  if (n === 0) {
    p.drawRectangle({
      x: M,
      y: bottom,
      width: areaW,
      height: areaH,
      color: rgb(0.96, 0.955, 0.94),
    });
    fns.text(p, "(fotos a inserir)", M + 16, top - 24, { font: f.serifIt, size: 12, color: FAINT });
  } else {
    const cols = n <= 2 ? n : n <= 4 ? 2 : 3;
    const rows = Math.ceil(n / cols);
    const gap = 10;
    const cw = (areaW - gap * (cols - 1)) / cols;
    const ch = (areaH - gap * (rows - 1)) / rows;
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols);
      const c = i % cols;
      const x = M + c * (cw + gap);
      const yTop = top - r * (ch + gap);
      const img = await coverImage(pdf, imgs[i], cw, ch);
      if (img) p.drawImage(img, { x, y: yTop - ch, width: cw, height: ch });
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
