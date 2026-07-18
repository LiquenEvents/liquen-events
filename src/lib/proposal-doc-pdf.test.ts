import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * Smoke/golden do documento-proposta multi-página (landscape). Sem imagens reais
 * (mood boards vazios caem no placeholder do collage, sem tocar no sharp), o que
 * mantém o teste rápido e determinístico. Carregamos os bytes com
 * `PDFDocument.load`, confirmamos `%PDF-` e uma contagem de páginas plausível, e
 * exercitamos os dois templates do estúdio: "decoracao" e "organizacao".
 */

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

  it("does NOT throw on client text Helvetica can't encode (emoji/CJK)", async () => {
    const doc = decoracaoDoc();
    doc.clientNames = "Festa 🎉 dos 李明";
    doc.serviceGroups[0].items[0] = { label: "Cerimónia 💐", desc: "Detalhe 🌿 com nome 李明." };
    const bytes = await renderProposalDocPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
