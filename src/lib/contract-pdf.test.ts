import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { renderContractPdf } from "./contract-pdf";
import { termsToPlainText } from "./contract-terms";
import type { Contract } from "./contract-types";

/** Contrato aceite realista — snapshot congelado a partir dos termos padrão. */
function acceptedContract(over: Partial<Contract> = {}): Contract {
  return {
    id: "c-1",
    quoteId: "q-1",
    proposalId: "p-1",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    termsVersion: "2026-01",
    termsSnapshot: termsToPlainText(),
    status: "aceite",
    createdAt: "2026-07-01T10:00:00.000Z",
    acceptedAt: "2026-07-02T14:32:00.000Z",
    acceptedName: "Maria Silva",
    acceptedIp: "203.0.113.7",
    ...over,
  };
}

describe("renderContractPdf", () => {
  it("returns a non-empty PDF buffer for an accepted contract", async () => {
    const pdf = await renderContractPdf(acceptedContract());
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(1000);
    // Magic bytes — it really is a PDF.
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("renders a pendente (unaccepted) contract without throwing", async () => {
    const pdf = await renderContractPdf(
      acceptedContract({
        status: "pendente",
        acceptedAt: undefined,
        acceptedName: undefined,
        acceptedIp: undefined,
      }),
    );
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it("page-breaks a very long termsSnapshot across multiple pages", async () => {
    // 60 fat sections force well beyond one A4 page.
    const long = Array.from(
      { length: 60 },
      (_, i) =>
        `${i + 1}. Secção de teste\n${"Texto longo repetido para forçar a quebra de linha e de página. ".repeat(6)}`,
    ).join("\n\n");
    const pdf = await renderContractPdf(acceptedContract({ termsSnapshot: long }));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    // Re-parse and confirm the content spilled onto more than one page.
    const parsed = await PDFDocument.load(pdf);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
  });
});
