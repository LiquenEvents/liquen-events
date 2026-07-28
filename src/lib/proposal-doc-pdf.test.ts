import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { PDFArray, PDFDocument, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * Smoke/golden do documento-proposta multi-página (landscape). Sem imagens reais
 * (mood boards vazios caem no placeholder do collage, sem tocar no sharp), o que
 * mantém o teste rápido e determinístico. Carregamos os bytes com
 * `PDFDocument.load`, confirmamos `%PDF-` e uma contagem de páginas plausível, e
 * exercitamos os dois templates do estúdio: "decoracao" e "organizacao".
 *
 * A exceção é a capa: aí o que interessa é o LADO onde cada foto sai impressa,
 * por isso esse teste desenha uma imagem a sério e lê a posição no conteúdo da
 * página (ver `coverPhotoXs`).
 */

/** Dimensões da página do documento (A4 paisagem), iguais às do gerador. */
const PAGE_W = 841.89;
const PAGE_H = 595.28;

/** Conteúdo (operadores) de uma página, já descomprimido. */
function pageContent(pdf: PDFDocument, index: number): string {
  const page = pdf.getPage(index);
  const contents = page.node.Contents();
  const parts: (PDFObject | undefined)[] =
    contents instanceof PDFArray ? contents.asArray() : [contents];
  let out = "";
  for (const part of parts) {
    const stream = page.node.context.lookup(part);
    if (stream instanceof PDFRawStream) {
      out += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    }
  }
  return out;
}

/** pdf-lib escreve, antes de cada imagem, três matrizes: translação, rotação e
 *  escala (largura/altura de desenho). */
const PLACEMENT =
  /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\s+1 0 0 1 0 0 cm\s+(-?[\d.]+) 0 0 (-?[\d.]+) 0 0 cm/g;

/** Os X onde foram desenhadas as fotos de CAPA — as únicas imagens que ocupam a
 *  altura toda da página, o que as distingue do logótipo e do resto. */
function coverPhotoXs(content: string): number[] {
  const xs: number[] = [];
  for (const m of content.matchAll(PLACEMENT)) {
    if (Math.abs(Number(m[4]) - PAGE_H) < 1) xs.push(Number(m[1]));
  }
  return xs;
}

/** Uma foto minúscula, em retrato como as fotos de capa reais. */
async function photoB64(): Promise<string> {
  const bytes = await sharp({
    create: { width: 120, height: 240, channels: 3, background: { r: 90, g: 110, b: 90 } },
  })
    .jpeg()
    .toBuffer();
  return bytes.toString("base64");
}

/** Doc mínimo do template Decoração (total agrupado + mood boards). */
function decoracaoDoc(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Maria & Zé 12.09.2026",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha, Évora",
    guests: "80 pax",
    ceremony: "Civil, simbólica",
    time: "16h00",
    weddingPlanners: "Equipa AMARA",
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          { label: "Cerimónia", desc: "Arco floral e passadeira com pétalas naturais." },
          { label: "Copo d'água", desc: "Centros de mesa e iluminação ambiente." },
        ],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: [], annotation: "Paleta em tons de musgo." },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'água"],
    budgetExtras: [
      { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
      { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
    ],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    coverImages: [],
  });
}

/** Doc mínimo do template Organização (cronograma + valores por linha). */
function organizacaoDoc(): ProposalDoc {
  return withProposalDefaults({
    template: "organizacao",
    ref: "Proposta Organização Casamento 12.09.2026",
    headerTitle: "Proposta de orçamento para Organização de Casamento",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Évora",
    guests: "80 pax",
    serviceGroups: [
      {
        title: "Coordenação",
        items: [{ label: "Reunião inicial" }, { label: "Gestão de fornecedores" }],
      },
    ],
    moodBoards: [],
    cronograma: [
      { title: "6-12 meses antes", items: ["Definição de conceito", "Seleção de espaço"] },
      { title: "1 mês antes", items: ["Confirmação de convidados"] },
    ],
    budgetItems: [],
    budgetRows: [
      { item: "Coordenação", price: "5.000,00 €" },
      { item: "Fornecedores", price: "7.500,00 €" },
    ],
    totalLabel: "Total Estimado",
    totalText: "",
    totalEstimatedText: "12.500,00 €",
    budgetNote: "Os valores são estimativas e podem ser ajustados.",
    coverImages: [],
  });
}

describe("renderProposalDocPdf", () => {
  it("renders the Decoração template across multiple pages", async () => {
    const bytes = await renderProposalDocPdf(decoracaoDoc());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    // cover + apresentação/serviços + mood board + orçamento + condições + … .
    expect(parsed.getPageCount()).toBeGreaterThan(3);
  });

  it("renders the Organização template (cronograma + budget rows)", async () => {
    const bytes = await renderProposalDocPdf(organizacaoDoc());
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(3);
  });

  it("BUG-GUARD: a foto do slot 1 é impressa à DIREITA (e a do slot 0 à esquerda)", async () => {
    // O bug: escolher UMA foto para a capa da direita imprimia-a à esquerda,
    // porque o array da capa era compactado e a foto passava a estar no índice
    // 0. Com as duas posições fixas ("" = vazia), o lado é sempre o escolhido.
    const photo = await photoB64();

    const onlyRight = await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: ["", photo] });
    const xsRight = coverPhotoXs(pageContent(await PDFDocument.load(onlyRight), 0));
    expect(xsRight).toHaveLength(1);
    expect(xsRight[0]).toBeGreaterThan(PAGE_W / 2);

    const onlyLeft = await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: [photo, ""] });
    const xsLeft = coverPhotoXs(pageContent(await PDFDocument.load(onlyLeft), 0));
    expect(xsLeft).toHaveLength(1);
    expect(xsLeft[0]).toBeLessThan(PAGE_W / 2);

    // Com as duas preenchidas, uma de cada lado.
    const both = await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: [photo, photo] });
    const xsBoth = coverPhotoXs(pageContent(await PDFDocument.load(both), 0));
    expect(xsBoth).toHaveLength(2);
    expect(xsBoth[0]).toBeLessThan(PAGE_W / 2);
    expect(xsBoth[1]).toBeGreaterThan(PAGE_W / 2);
  });

  it("renders budget extras (deslocação, coordenação) without throwing", async () => {
    const doc = decoracaoDoc();
    doc.budgetExtras = [
      { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
      { label: "Valor Tecidos suspensos", valueText: "4.742,50 € + IVA" },
      { label: "Mobiliário e atoalhado (opção A)", valueText: "4.169,78 € + IVA" },
      { label: "", valueText: "" }, // blank line is filtered out, never crashes
    ];
    const bytes = await renderProposalDocPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("does NOT throw on client text Helvetica can't encode (emoji/CJK)", async () => {
    const doc = decoracaoDoc();
    doc.clientNames = "Festa 🎉 dos 李明";
    doc.serviceGroups[0].items[0] = { label: "Cerimónia 💐", desc: "Detalhe 🌿 com nome 李明." };
    const bytes = await renderProposalDocPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
