import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderProposalPdf } from "./proposal-pdf";
import type { Proposal } from "@/lib/orcamento/types";

/**
 * Smoke/golden do renderizador da proposta (single-page A4). Não comparamos
 * pixels — carregamos os bytes produzidos com `PDFDocument.load`, confirmamos os
 * bytes mágicos `%PDF-` e a contagem de páginas, e garantimos que os campos do
 * cliente (que passam por `winAnsiSafe`) nunca fazem o `drawText` lançar.
 */
function proposal(over: Partial<Proposal> = {}): Proposal {
  return {
    id: "p-1",
    quoteId: "q-1",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    currency: "EUR",
    lineItems: [
      { description: "Decoração de cerimónia", qty: 1, unitPrice: 1500 },
      { description: "Decoração floral de mesas", qty: 10, unitPrice: 120 },
    ],
    vatRate: 0.23,
    subtotal: 2700,
    vat: 621,
    total: 3321,
    status: "enviada",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

const meta = {
  eventType: "Casamento",
  date: "2026-09-12",
  guests: 80,
  location: "Évora",
};

describe("renderProposalPdf", () => {
  it("returns a single-page PDF for a realistic proposal", async () => {
    const bytes = await renderProposalPdf(proposal(), meta);
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBe(1);
  });

  it("renders without meta, notes and validity fields", async () => {
    const bytes = await renderProposalPdf(
      proposal({ validUntil: "2026-08-01", notes: "Duas linhas.\nSegunda linha de notas." }),
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("does NOT throw on client text Helvetica can't encode (emoji/CJK)", async () => {
    const bytes = await renderProposalPdf(
      proposal({
        clientName: "Festa 🎉 dos 李明 & Sofia",
        lineItems: [
          {
            description:
              "Serviço 💐 completo com nome muito longo para forçar a quebra de linha da descrição em várias linhas no PDF",
            qty: 2,
            unitPrice: 999,
          },
        ],
        notes:
          "Nota com emoji 🌿 e um parágrafo longo repetido para exercitar a quebra de linha das notas do cliente no rodapé da proposta.",
      }),
      { eventType: "Aniversário 🎂" },
    );
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});
