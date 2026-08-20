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

/**
 * O fuso em que este documento é lido, e por isso o único em que pode ser
 * escrito. Mesmo valor e mesma razão do `FUSO` da rota dos lembretes e do módulo
 * das conversões offline.
 */
const FUSO = "Europe/Lisbon";

/**
 * ISO → "18 de julho de 2026 às 14:32" (data + hora; o aceite é pontual).
 *
 * ── PORQUE É QUE O FUSO ESTÁ ESCRITO À MÃO ──────────────────────────────────
 *
 * Sem ele, o `toLocaleString` usa o fuso da MÁQUINA que gerou o PDF — que no
 * alojamento é UTC. Portugal é UTC+1 no Verão, por isso um aceite registado às
 * 23:32 de 2 de julho saía impresso como «02 de julho de 2026 às 23:32» quando
 * o cliente carregou no botão já a 3 de julho, 00:32. Num contrato, o momento
 * do aceite é a data em que ele passa a vincular: errar o DIA não é um pormenor
 * de apresentação, é o documento a dizer outra coisa do que aconteceu.
 *
 * E há o outro lado, mais insidioso: sem fuso fixo, o mesmo contrato descarregado
 * do portal e regerado noutra máquina traz datas diferentes.
 */
function fmtDateTime(iso?: string, idioma: "pt" | "en" = "pt"): string {
  if (!iso) return "—";
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  /**
   * A LOCALIZAÇÃO muda com a língua; o FUSO nunca.
   *
   * O fuso é o de Lisboa nas duas, e não é decoração: o momento do aceite é a
   * data em que o contrato passa a vincular, e o alojamento corre em UTC. Um
   * aceite às 23:32 de 2 de julho saía impresso no dia errado — está medido no
   * `contract-pdf.datas.test.ts`, e é a razão de este parâmetro existir.
   */
  return dt.toLocaleString(idioma === "en" ? "en-GB" : "pt-PT", {
    timeZone: FUSO,
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PALAVRAS DA FOLHA — as que não são dos termos
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «CONTRATO», «ENTRE», «ACEITE REGISTADO». Nada disto está no
 * `termsSnapshot`: o snapshot é o texto que o casal aceitou, e estas são a
 * moldura em que ele é impresso. Traduzi-las era o que faltava para um casal
 * estrangeiro receber um contrato inglês inteiro, em vez de termos ingleses
 * dentro de uma folha portuguesa.
 *
 * A língua vem do CONTRATO (`Contract.idioma`), que a copiou da proposta.
 * Ausente lê-se como português — é o que todos os contratos anteriores são.
 */
interface PalavrasDoContrato {
  contrato: string;
  ref: string;
  titulo: string;
  entre: string;
  e: string;
  doravante: string;
  referencia: string;
  pedido: string;
  proposta: string;
  termos: string;
  versao: (v: string) => string;
  semSnapshot: string;
  aceiteRegistado: string;
  confirmadoPor: (quem: string, quando: string) => string;
  como: (texto: string) => string;
  versaoDosTermos: (v: string) => string;
  documentoAceite: string;
  bytes: string;
  aceiteElectronico: string;
  aceiteElectronicoPor: (quem: string, quando: string) => string;
  registoIp: (v: string, ip: string) => string;
  valorProbatorio: string;
  pendente: string;
  minuta: string;
}

const PALAVRAS_PT: PalavrasDoContrato = {
  contrato: "CONTRATO",
  ref: "Ref.",
  titulo: "Contrato de Prestação de Serviços de Decoração de Eventos",
  entre: "ENTRE",
  e: "E",
  doravante: "doravante designados, respetivamente, por «Estúdio» e «Cliente».",
  referencia: "REFERÊNCIA",
  pedido: "Pedido",
  proposta: "Proposta",
  termos: "TERMOS E CONDIÇÕES",
  versao: (v) => `Versão v${v}`,
  semSnapshot: "Sem snapshot de termos guardado.",
  aceiteRegistado: "ACEITE REGISTADO",
  confirmadoPor: (quem, quando) => `Aceite confirmado por ${quem} em ${quando}.`,
  como: (t) => `Como: ${t}`,
  versaoDosTermos: (v) => `Versão dos termos v${v}`,
  documentoAceite: "Documento aceite:",
  bytes: "bytes",
  aceiteElectronico: "ACEITE ELETRÓNICO",
  aceiteElectronicoPor: (quem, quando) => `Aceite eletronicamente por ${quem} em ${quando}.`,
  registoIp: (v, ip) => `Versão dos termos v${v}  ·  registo ${ip}`,
  valorProbatorio:
    "Aceitação registada por via eletrónica, com valor probatório equivalente a assinatura.",
  pendente: "ACEITAÇÃO PENDENTE",
  minuta:
    "Este contrato ainda não foi aceite pelo Cliente. Torna-se vinculativo no momento em que o Cliente aceita as condições através do link enviado por e-mail; até lá, serve apenas de minuta.",
};

const PALAVRAS_EN: PalavrasDoContrato = {
  contrato: "CONTRACT",
  ref: "Ref.",
  titulo: "Event Decoration Services Agreement",
  entre: "BETWEEN",
  e: "AND",
  doravante: "hereinafter referred to, respectively, as the “Studio” and the “Client”.",
  referencia: "REFERENCE",
  pedido: "Request",
  proposta: "Proposal",
  termos: "TERMS AND CONDITIONS",
  versao: (v) => `Version v${v}`,
  semSnapshot: "No terms snapshot stored.",
  aceiteRegistado: "ACCEPTANCE ON RECORD",
  confirmadoPor: (quem, quando) => `Acceptance confirmed by ${quem} on ${quando}.`,
  como: (t) => `How: ${t}`,
  versaoDosTermos: (v) => `Terms version v${v}`,
  documentoAceite: "Document accepted:",
  bytes: "bytes",
  aceiteElectronico: "ELECTRONIC ACCEPTANCE",
  aceiteElectronicoPor: (quem, quando) => `Accepted electronically by ${quem} on ${quando}.`,
  registoIp: (v, ip) => `Terms version v${v}  ·  record ${ip}`,
  valorProbatorio:
    "Acceptance recorded electronically, with evidential value equivalent to a signature.",
  pendente: "ACCEPTANCE PENDING",
  minuta:
    "This contract has not yet been accepted by the Client. It becomes binding at the moment the Client accepts the conditions through the link sent by email; until then, it serves only as a draft.",
};

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
  // A língua do CONTRATO, copiada da proposta quando ele nasceu. Ausente nos
  // contratos anteriores a esse campo, e ausente é português — que é o que
  // eles são e o que sempre lhes foi impresso.
  const idioma = contract.idioma === "en" ? "en" : "pt";
  const w = idioma === "en" ? PALAVRAS_EN : PALAVRAS_PT;
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
    p.drawText(`${SITE.name}   ·   ${SITE.email}   ·   ${SITE.phoneDisplay}   ·   Portugal`, {
      x: MARGIN,
      y: MARGIN - 16,
      font,
      size: 7.5,
      color: MUTED,
    });
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
  tr(w.contrato, right, y, { font: bold, size: 12, color: MUTED });
  tr(`${w.ref} ${contract.quoteId || contract.id}`, right, y - 14, { size: 9, color: MUTED });
  tr(fmtDateTime(contract.createdAt, idioma), right, y - 27, { size: 8, color: MUTED });
  y -= lh + 18;
  hr(y);
  y -= 28;

  // ── Título ──
  const titleLines = wrap(bold, w.titulo, 15, maxW);
  for (const ln of titleLines) {
    text(ln, MARGIN, y, { font: bold, size: 15, color: INK });
    y -= 20;
  }
  y -= 10;

  // ── Partes ──
  text(w.entre, MARGIN, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  text(SITE.legalName, MARGIN, y, { font: bold, size: 11 });
  y -= 13;
  text(`${SITE.email}  ·  ${SITE.phoneDisplay}`, MARGIN, y, { size: 9, color: MUTED });
  y -= 12;
  text(`${SITE.city}, ${SITE.region}, Portugal  ·  ${SITE.url}`, MARGIN, y, {
    size: 9,
    color: MUTED,
  });
  y -= 24;

  text(w.e, MARGIN, y, { font: bold, size: 8, color: MUTED });
  y -= 16;
  text(contract.clientName || "—", MARGIN, y, { font: bold, size: 11 });
  y -= 13;
  if (contract.clientEmail) {
    text(contract.clientEmail, MARGIN, y, { size: 9, color: MUTED });
    y -= 12;
  }
  y -= 6;
  text(w.doravante, MARGIN, y, { size: 9, color: MUTED });
  y -= 22;

  // Referência (pedido / proposta).
  hr(y);
  y -= 16;
  text(w.referencia, MARGIN, y, { font: bold, size: 8, color: MUTED });
  text(`${w.pedido} ${contract.quoteId || "—"}`, MARGIN + 90, y, { size: 9 });
  tr(`${w.proposta} ${contract.proposalId || "—"}`, right, y, { size: 9, color: MUTED });
  y -= 14;
  hr(y);
  y -= 26;

  // ── Termos (snapshot congelado) ──
  text(w.termos, MARGIN, y, { font: bold, size: 8, color: MUTED });
  tr(w.versao(contract.termsVersion), right, y, { size: 8, color: MUTED });
  y -= 20;

  const sections = parseSnapshot(contract.termsSnapshot || "");
  if (sections.length === 0) {
    text(w.semSnapshot, MARGIN, y, { size: 9.5, color: MUTED });
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
  /**
   * ── DUAS MANEIRAS DE UM CONTRATO SER ACEITE, E NÃO SE PODEM CONFUNDIR ────
   *
   * ELECTRÓNICO: o casal escreveu o nome no link, e ficou a hora e o IP. É o
   * que o fluxo antigo produzia, e há contratos assim guardados.
   *
   * REGISTADO: o sim aconteceu numa conversa, num email ou num papel, e
   * alguém da casa registou-o (ver `registadoPor` em `contract-types.ts`). É o
   * único caminho que existe hoje, porque o botão de aceitar foi retirado —
   * «um casamento não se fecha num botão».
   *
   * Imprimir «Aceite eletronicamente por Maria Silva» num contrato do segundo
   * tipo era o documento a afirmar uma assinatura electrónica que ninguém deu
   * — uma prova falsa, escrita pelo nosso software. É a única coisa aqui que
   * se pode estragar de vez, e por isso os dois blocos são diferentes: o do
   * registo não diz «electrónico», não mostra IP, e diz quem registou e como.
   */
  const registado = !!contract.registadoPor || !!contract.registadoComo;
  if (accepted && registado) {
    text(w.aceiteRegistado, MARGIN, y, { font: bold, size: 8, color: MOSS });
    y -= 18;
    text(contract.clientName || "—", MARGIN, y, { font: bold, size: 12 });
    y -= 16;
    text(
      w.confirmadoPor(
        contract.registadoPor || SITE.name,
        fmtDateTime(contract.acceptedAt, idioma),
      ),
      MARGIN,
      y,
      { size: 9.5, color: INK },
    );
    y -= 14;
    if (contract.registadoComo) {
      text(w.como(contract.registadoComo), MARGIN, y, { size: 9, color: INK });
      y -= 14;
    }
    text(w.versaoDosTermos(contract.termsVersion), MARGIN, y, { size: 8.5, color: MUTED });
    y -= 14;
    if (contract.propostaPdfSha256) {
      text(
        `${w.documentoAceite} ${contract.propostaPdfSha256.slice(0, 12)}` +
          (contract.propostaPdfBytes ? `  ·  ${contract.propostaPdfBytes} ${w.bytes}` : ""),
        MARGIN,
        y,
        { size: 8.5, color: MUTED },
      );
      y -= 14;
    }
    y -= 2;
  } else if (accepted) {
    text(w.aceiteElectronico, MARGIN, y, { font: bold, size: 8, color: MOSS });
    y -= 18;
    text(contract.acceptedName || contract.clientName || "—", MARGIN, y, { font: bold, size: 12 });
    y -= 16;
    // Linha-prova legível: quem, quando, versão, registo.
    text(
      w.aceiteElectronicoPor(
        contract.acceptedName || contract.clientName || "—",
        fmtDateTime(contract.acceptedAt, idioma),
      ),
      MARGIN,
      y,
      { size: 9.5, color: INK },
    );
    y -= 14;
    text(w.registoIp(contract.termsVersion, contract.acceptedIp || "—"), MARGIN, y, {
      size: 8.5,
      color: MUTED,
    });
    y -= 14;
    /**
     * ── O SELO DO DOCUMENTO ACEITE ─────────────────────────────────────────
     *
     * Impresso, e não só guardado na base de dados: um selo que ninguém vê é um
     * selo que ninguém invoca. Assim ele viaja com o contrato, chega ao casal e
     * ao contabilista, e numa discussão de dentro de dois anos ela pode apontar
     * para a linha em vez de ir buscar registos.
     *
     * Doze caracteres chegam: são 48 bits, e a probabilidade de dois PDFs
     * diferentes coincidirem neles é indistinguível de zero para esta escala. O
     * valor inteiro fica guardado, para quem quiser conferir a sério.
     *
     * Ausente nos contratos anteriores a esta mudança — e nesses não se imprime
     * linha nenhuma, em vez de se imprimir um "—" que daria a entender que o
     * documento não tinha selo por alguma razão.
     */
    if (contract.propostaPdfSha256) {
      text(
        `${w.documentoAceite} ${contract.propostaPdfSha256.slice(0, 12)}` +
          (contract.propostaPdfBytes ? `  ·  ${contract.propostaPdfBytes} ${w.bytes}` : ""),
        MARGIN,
        y,
        { size: 8.5, color: MUTED },
      );
      y -= 14;
    }
    y -= 2;
    text(w.valorProbatorio, MARGIN, y, { size: 8, color: MUTED });
  } else {
    // Pendente: sem assinatura ainda — anota o estado com clareza.
    text(w.pendente, MARGIN, y, { font: bold, size: 8, color: GOLD });
    y -= 18;
    for (const ln of wrap(font, w.minuta, 9.5, maxW)) {
      text(ln, MARGIN, y, { size: 9.5, color: INK });
      y -= 14;
    }
  }

  footer(page);
  const bytes = await doc.save();
  return Buffer.from(bytes);
}
