import "server-only";
import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import { SITE } from "@/lib/site";
import { LOGO_DARK_PNG_B64 } from "@/lib/proposal-assets";
import type { Contract } from "@/lib/contract-types";
import { winAnsiSafe } from "@/lib/pdf-text";

/**
 * Gera o PDF do contrato — a prova em papel do aceite dos Termos & Condições.
 * É o documento que fica no dossiê do estúdio E a cópia que o cliente pode
 * descarregar do portal. Espelha o estilo pdf-lib do resto da casa
 * (invoice-pdf / proposal-doc-pdf): A4, Helvetica/HelveticaBold, paleta de
 * marca (musgo + tinta), o logótipo escuro embebido do módulo de assets.
 *
 * O `termsSnapshot` é o texto CONGELADO no momento do aceite (heading\nbody por
 * secção, secções separadas por linha em branco — ver `termsToPlainText`).
 * Renderizamo-lo como secções legíveis, com quebra de linha e de página
 * automáticas. Um contrato `pendente` (ainda não assinado) é tratado com
 * elegância: o bloco de assinatura anuncia que o aceite está por concretizar.
 */

// ── A4 retrato ──
const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

// ── Paleta de marca (igual ao invoice-pdf) ──
const MOSS = rgb(0.29, 0.486, 0.349);
const INK = rgb(0.1, 0.1, 0.1);
const MUTED = rgb(0.45, 0.45, 0.45);
const LINE = rgb(0.85, 0.85, 0.85);
const GOLD = rgb(0.71, 0.4, 0.29);

/** Quebra um parágrafo em linhas que cabem em `maxWidth` (respeita \n internos).
 *  Sanitiza para WinAnsi antes de medir/quebrar — o snapshot dos termos e afins
 *  podem conter caracteres que a Helvetica não codifica (`widthOfTextAtSize` e
 *  `drawText` lançariam). */
export function wrap(font: PDFFont, rawText: string, size: number, maxWidth: number): string[] {
  const out: string[] = [];
  // Split on the RAW text's newlines FIRST: `winAnsiSafe` maps "\n" (a control
  // char) to "?", so sanitising before splitting would erase every internal
  // break — the "respeita \n internos" contract could never hold. Sanitise each
  // paragraph after the split instead (a stored snapshot with a multi-line body
  // then renders each line on its own row, not joined by a stray "?").
  for (const rawParagraph of rawText.split("\n")) {
    const paragraph = winAnsiSafe(rawParagraph);
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      out.push("");
      continue;
    }
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

/** ISO → "18 de julho de 2026, 14:32" (data + hora; o aceite é pontual). */
function fmtDateTime(iso?: string): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("pt-PT", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Divide o snapshot de texto plano em secções { heading, body }. O formato
 * gerado por `termsToPlainText` é `heading\nbody`, secções separadas por uma
 * linha em branco. Degrada com graça para qualquer texto: um bloco sem segunda
 * linha vira só corpo (heading vazio).
 */
function parseSnapshot(snapshot: string): { heading: string; body: string }[] {
  const blocks = snapshot
    .split(/\n\s*\n/)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks.map((block) => {
    const nl = block.indexOf("\n");
    if (nl === -1) return { heading: "", body: block };
    return { heading: block.slice(0, nl).trim(), body: block.slice(nl + 1).trim() };
  });
}

/** Renderiza o contrato em PDF e devolve os bytes. */
export async function renderContractPdf(contract: Contract): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo: PDFImage = await doc.embedPng(Buffer.from(LOGO_DARK_PNG_B64, "base64"));

  const right = A4.w - MARGIN;
  const maxW = A4.w - 2 * MARGIN;

  let page: PDFPage = doc.addPage([A4.w, A4.h]);
  let y = A4.h - MARGIN;

  // Sanitiza no ponto de desenho: clientName/acceptedName vêm do cliente e podem
  // conter caracteres que a Helvetica/WinAnsi não codifica (→ 500). `tr` sanitiza
  // antes de medir a largura para o alinhamento à direita ficar correto.
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

  // Rodapé de identificação, repetido em todas as páginas.
  const footer = (p: PDFPage) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN - 4 },
      end: { x: right, y: MARGIN - 4 },
      thickness: 0.7,
      color: LINE,
    });
    p.drawText(
      `${SITE.name}   ·   ${SITE.email}   ·   ${SITE.phoneDisplay}   ·   ${SITE.region}, Portugal`,
      {
        x: MARGIN,
        y: MARGIN - 16,
        font,
        size: 7.5,
        color: MUTED,
      },
    );
  };

  // Abre uma nova página de continuação (logótipo discreto + referência),
  // fechando a anterior com o rodapé. Devolve o novo topo de conteúdo.
  const newPage = () => {
    footer(page);
    page = doc.addPage([A4.w, A4.h]);
    const lw = 56;
    const lh = (logo.height / logo.width) * lw;
    page.drawImage(logo, { x: MARGIN, y: A4.h - MARGIN - lh + 4, width: lw, height: lh });
    tr(`Ref. ${contract.quoteId || contract.id}`, right, A4.h - MARGIN - 6, {
      size: 8,
      color: MUTED,
    });
    y = A4.h - MARGIN - lh - 18;
  };

  // Garante espaço vertical para `need` pontos; senão salta de página.
  const ensure = (need: number) => {
    if (y - need < MARGIN + 20) newPage();
  };

  // ── Cabeçalho ──
  const lw = 116;
  const lh = (logo.height / logo.width) * lw;
  page.drawImage(logo, { x: MARGIN, y: y - lh + 8, width: lw, height: lh });
  tr("CONTRATO", right, y, { font: bold, size: 12, color: MUTED });
  tr(`Ref. ${contract.quoteId || contract.id}`, right, y - 14, { size: 9, color: MUTED });
  tr(fmtDateTime(contract.createdAt), right, y - 27, { size: 8, color: MUTED });
  y -= lh + 18;
  hr(y);
  y -= 28;

  // ── Título ──
  const titleLines = wrap(
    bold,
    "Contrato de Prestação de Serviços — Decoração de Eventos",
    15,
    maxW,
  );
  for (const ln of titleLines) {
    text(ln, MARGIN, y, { font: bold, size: 15, color: INK });
    y -= 20;
  }
  y -= 10;

  // ── Partes ──
  text("ENTRE", MARGIN, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  text(SITE.legalName, MARGIN, y, { font: bold, size: 11 });
  y -= 13;
  text(`${SITE.email}  ·  ${SITE.phoneDisplay}`, MARGIN, y, { size: 9, color: MUTED });
  y -= 12;
  text(`${SITE.city}, ${SITE.region} — Portugal  ·  ${SITE.url}`, MARGIN, y, {
    size: 9,
    color: MUTED,
  });
  y -= 24;

  text("E", MARGIN, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  text(contract.clientName || "—", MARGIN, y, { font: bold, size: 11 });
  y -= 13;
  if (contract.clientEmail) {
    text(contract.clientEmail, MARGIN, y, { size: 9, color: MUTED });
    y -= 12;
  }
  y -= 6;
  text("doravante designados, respetivamente, por «Estúdio» e «Cliente».", MARGIN, y, {
    size: 9,
    color: MUTED,
  });
  y -= 22;

  // Referência (pedido / proposta).
  hr(y);
  y -= 16;
  text("REFERÊNCIA", MARGIN, y, { font: bold, size: 8, color: MUTED });
  text(`Pedido ${contract.quoteId || "—"}`, MARGIN + 90, y, { size: 9 });
  tr(`Proposta ${contract.proposalId || "—"}`, right, y, { size: 9, color: MUTED });
  y -= 14;
  hr(y);
  y -= 26;

  // ── Termos (snapshot congelado) ──
  text("TERMOS E CONDIÇÕES", MARGIN, y, { font: bold, size: 8, color: MUTED });
  tr(`Versão v${contract.termsVersion}`, right, y, { size: 8, color: MUTED });
  y -= 20;

  const sections = parseSnapshot(contract.termsSnapshot || "");
  if (sections.length === 0) {
    text("Sem snapshot de termos guardado.", MARGIN, y, { size: 9.5, color: MUTED });
    y -= 16;
  }
  for (const s of sections) {
    // A secção precisa de, no mínimo, cabeçalho + primeira linha juntos.
    ensure(30);
    if (s.heading) {
      // Heading pode quebrar em títulos longos.
      for (const ln of wrap(bold, s.heading, 10.5, maxW)) {
        ensure(16);
        text(ln, MARGIN, y, { font: bold, size: 10.5, color: INK });
        y -= 15;
      }
      y -= 2;
    }
    for (const ln of wrap(font, s.body, 9.5, maxW)) {
      ensure(13);
      text(ln, MARGIN, y, { size: 9.5, color: rgb(0.25, 0.25, 0.25) });
      y -= 13;
    }
    y -= 12;
  }

  // ── Bloco de aceitação / assinatura ──
  ensure(96);
  y -= 4;
  hr(y);
  y -= 22;

  const accepted = contract.status === "aceite";
  if (accepted) {
    text("ACEITE ELETRÓNICO", MARGIN, y, { font: bold, size: 8, color: MOSS });
    y -= 18;
    text(contract.acceptedName || contract.clientName || "—", MARGIN, y, { font: bold, size: 12 });
    y -= 16;
    // Linha-prova legível: quem, quando, versão, registo.
    text(
      `Aceite eletronicamente por ${contract.acceptedName || contract.clientName || "—"} em ${fmtDateTime(contract.acceptedAt)}.`,
      MARGIN,
      y,
      { size: 9.5, color: INK },
    );
    y -= 14;
    text(
      `Versão dos termos v${contract.termsVersion}  ·  registo ${contract.acceptedIp || "—"}`,
      MARGIN,
      y,
      { size: 8.5, color: MUTED },
    );
    y -= 16;
    text(
      "Aceitação registada por via eletrónica, com valor probatório equivalente a assinatura.",
      MARGIN,
      y,
      { size: 8, color: MUTED },
    );
  } else {
    // Pendente: sem assinatura ainda — anota o estado com clareza.
    text("ACEITAÇÃO PENDENTE", MARGIN, y, { font: bold, size: 8, color: GOLD });
    y -= 18;
    for (const ln of wrap(
      font,
      "Este contrato ainda não foi aceite pelo Cliente. Torna-se vinculativo no momento em que o Cliente aceita as condições através do link enviado por e-mail; até lá, serve apenas de minuta.",
      9.5,
      maxW,
    )) {
      text(ln, MARGIN, y, { size: 9.5, color: INK });
      y -= 14;
    }
  }

  footer(page);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
