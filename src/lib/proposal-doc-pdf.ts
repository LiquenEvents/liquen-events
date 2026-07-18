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
  serifIt: PDFFont;
}

/** Decode a base64 (optionally data:-prefixed) image and cover-crop it to the
 *  target point box via sharp, returning an embedded PDFImage. Rendered at 2×
 *  for crispness; smart-cropped so faces/subjects survive the crop. */
async function coverImage(
  doc: PDFDocument,
  b64: string,
  wPt: number,
  hPt: number,
): Promise<PDFImage | null> {
  try {
    const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
    const input = Buffer.from(raw, "base64");
    if (input.length < 32) return null;
    const out = await sharp(input)
      .rotate()
      .resize(Math.max(1, Math.round(wPt * 2)), Math.max(1, Math.round(hPt * 2)), {
        fit: "cover",
        position: "attention",
      })
      .jpeg({ quality: 82 })
      .toBuffer();
    return doc.embedJpg(out);
  } catch {
    return null;
  }
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

  // Content-page header: colour logo top-left, running ref top-right, page num.
  const header = (p: PDFPage, pageNum: number) => {
    const lw = 92;
    const lh = (logoDark.height / logoDark.width) * lw;
    p.drawImage(logoDark, { x: M, y: H - M - lh + 6, width: lw, height: lh });
    textRight(p, doc.ref, W - M, H - M - 4, { size: 9, color: MUTED });
    textRight(p, String(pageNum), W - M, M - 18, { size: 9, color: MUTED });
  };

  // ── Page 1 — Cover ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });
    const panelW = W * 0.3;
    const sideW = (W - panelW) / 2;
    const left = doc.coverImages[0] ? await coverImage(pdf, doc.coverImages[0], sideW, H) : null;
    const right = doc.coverImages[1] ? await coverImage(pdf, doc.coverImages[1], sideW, H) : null;
    if (left) p.drawImage(left, { x: 0, y: 0, width: sideW, height: H });
    if (right) p.drawImage(right, { x: sideW + panelW, y: 0, width: sideW, height: H });
    // Centre dark panel + white logo
    p.drawRectangle({ x: sideW, y: 0, width: panelW, height: H, color: DARK });
    const lw = panelW * 0.62;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, {
      x: sideW + (panelW - lw) / 2,
      y: (H - lh) / 2,
      width: lw,
      height: lh,
    });
  }

  // ── Page 2 — Apresentação + Serviços ──
  {
    const org = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    header(p, 1);
    let y = H - M - 64;
    const ensure = (need: number) => {
      if (y - need < M + 6) {
        p = pdf.addPage([W, H]);
        header(p, pdf.getPageCount() - 1);
        y = H - M - 64;
      }
    };
    const label = (k: string, v: string, strong = false) => {
      const lab = `${k}: `;
      text(p, lab, M, y, { font: f.bold, size: strong ? 11 : 10 });
      text(p, v, M + f.bold.widthOfTextAtSize(lab, strong ? 11 : 10), y, {
        font: strong ? f.bold : f.reg,
        size: strong ? 11 : 10,
      });
      y -= strong ? 22 : 17;
    };

    if (!org) {
      text(p, "1. Apresentação", M, y, { font: f.bold, size: 14 });
      y -= 24;
      label("Noivos", doc.clientNames, true);
      label("Evento", doc.eventType);
    } else {
      label("Cliente", doc.clientNames, true);
    }
    label("Data do Evento", doc.eventDate);
    label("Local", doc.location);
    label("Número de Convidados", doc.guests);
    if (!org && doc.ceremony) label("Cerimónia", doc.ceremony);
    if (!org && doc.time) label("Hora", doc.time);

    y -= 20;
    text(p, "2. Serviços", M, y, { font: f.bold, size: 14 });
    y -= 22;
    text(p, "Serviços Disponibilizados", M, y, { font: f.bold, size: 10 });
    y -= 20;
    const descSize = org ? 9.5 : 10;
    for (const g of doc.serviceGroups) {
      ensure(26);
      text(p, `${g.letter ? g.letter + " " : ""}${g.title}`, M, y, { font: f.bold, size: 10.5 });
      y -= 18;
      for (const it of g.items) {
        p.drawCircle({ x: M + 12, y: y + 3, size: 1.4, color: INK });
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
    header(p, pdf.getPageCount() - 1);
    let y = H - M - 64;
    text(p, "3. Cronograma de Organização", M, y, { font: f.bold, size: 14 });
    y -= 26;
    for (const phase of doc.cronograma) {
      if (y - 24 < M) {
        p = pdf.addPage([W, H]);
        header(p, pdf.getPageCount() - 1);
        y = H - M - 64;
      }
      text(p, phase.title, M, y, { font: f.bold, size: 10.5 });
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
    header(p, pdf.getPageCount() - 1);
    // Elegant serif title (requested serif in place of the script hand)
    text(p, mb.title, M, H - M - 64, { font: f.serifIt, size: 26, color: INK });
    await drawCollage(pdf, p, mb, f, textFns(text, textRight));
  }

  // ── Orçamento ──
  {
    const orgT = doc.template === "organizacao";
    const p = pdf.addPage([W, H]);
    header(p, pdf.getPageCount() - 1);
    let y = H - M - 64;
    text(p, `${orgT ? "4" : "3"}. Orçamento Proposto`, M, y, { font: f.bold, size: 14 });
    y -= 26;
    text(p, "Item", M, y, { font: f.bold, size: 9.5, color: MUTED });
    text(p, orgT ? "Preço Estimado (€)" : "Preço (€)", M + 320, y, {
      font: f.bold,
      size: 9.5,
      color: MUTED,
    });
    y -= 8;
    p.drawLine({ start: { x: M, y }, end: { x: M + 430, y }, thickness: 0.7, color: LINE });
    y -= 18;

    if (orgT && doc.budgetRows?.length) {
      // Per-item estimated values (Organização model).
      for (const r of doc.budgetRows) {
        text(p, r.item, M, y, { size: 10 });
        text(p, r.price, M + 320, y, { size: 10 });
        y -= 18;
      }
      y -= 6;
      p.drawLine({ start: { x: M, y }, end: { x: M + 430, y }, thickness: 0.7, color: LINE });
      y -= 20;
      text(p, "Total Estimado", M, y, { font: f.bold, size: 11 });
      text(p, doc.totalEstimatedText ?? "", M + 320, y, { font: f.bold, size: 12, color: MOSS });
      if (doc.budgetNote) {
        y -= 30;
        for (const ln of wrap(f.reg, `Nota: ${doc.budgetNote}`, 9, W - 2 * M)) {
          text(p, ln, M, y, { size: 9, color: MUTED });
          y -= 13;
        }
      }
    } else {
      // Grouped total (Decoração model) + right-hand notes.
      for (const it of doc.budgetItems) {
        text(p, it, M, y, { size: 10 });
        y -= 17;
      }
      y -= 8;
      p.drawLine({ start: { x: M, y }, end: { x: M + 430, y }, thickness: 0.7, color: LINE });
      y -= 20;
      text(p, doc.totalLabel, M, y, { font: f.bold, size: 11, color: INK });
      text(p, doc.totalText, M + 320, y, { font: f.bold, size: 12, color: MOSS });

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
    header(p, pdf.getPageCount() - 1);
    let y = H - M - 64;
    text(p, "Condições Gerais", M, y, { font: f.bold, size: 13 });
    y -= 22;
    const maxW = W - 2 * M;
    for (const c of doc.condicoesGerais) {
      const lines = wrap(f.reg, c, 9, maxW - 16);
      if (y - lines.length * 12 < M + 10) {
        p = pdf.addPage([W, H]);
        header(p, pdf.getPageCount() - 1);
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
    header(p, pdf.getPageCount() - 1);
    let y = H - M - 64;
    const maxW = W - 2 * M;
    const section = (title: string, items: string[], size = 9) => {
      if (y - 40 < M) {
        p = pdf.addPage([W, H]);
        header(p, pdf.getPageCount() - 1);
        y = H - M - 64;
      }
      text(p, title, M, y, { font: f.bold, size: 11, color: INK });
      y -= 18;
      for (const it of items) {
        const lines = wrap(f.reg, it, size, maxW - 16);
        if (y - lines.length * 12 < M + 10) {
          p = pdf.addPage([W, H]);
          header(p, pdf.getPageCount() - 1);
          y = H - M - 64;
        }
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.3, color: INK });
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
      header(p, pdf.getPageCount() - 1);
      y = H - M - 64;
    }
    text(p, "Contactos", M, y, { font: f.bold, size: 11 });
    y -= 16;
    text(p, `E-mail: ${SITE.email}`, M, y, { size: 9.5 });
    y -= 14;
    text(p, `Telf.: ${SITE.phoneDisplay}`, M, y, { size: 9.5 });
  }

  // ── Back cover ──
  {
    const p = pdf.addPage([W, H]);
    header(p, pdf.getPageCount() - 1);
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
