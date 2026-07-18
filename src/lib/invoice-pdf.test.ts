import { describe, it, expect } from "vitest";
import { renderInvoicePdf, type InvoiceData } from "./invoice-pdf";
import { winAnsiSafe } from "./pdf-text";

/** Recibo realista, com o mínimo obrigatório preenchido. */
function invoiceData(over: Partial<InvoiceData> = {}): InvoiceData {
  return {
    number: "FT 2026/0007",
    date: "2026-07-18",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    description: "Decoração de casamento",
    amount: 3690,
    vatRate: 0.23,
    kindLabel: "Sinal",
    paid: false,
    ...over,
  };
}

describe("winAnsiSafe", () => {
  it("keeps ASCII and Latin-1 (Portuguese accents) intact", () => {
    expect(winAnsiSafe("Ação São João — €50 · 100%")).toBe("Ação São João — €50 · 100%");
  });

  it("replaces characters the WinAnsi/Helvetica encoding can't render with '?'", () => {
    // Emoji + CJK são exatamente os que faziam `drawText` lançar.
    expect(winAnsiSafe("Festa 🎉 do 李明")).toBe("Festa ? do ??");
    expect(winAnsiSafe("💐")).toBe("?");
  });

  it("never throws and returns a string for any input", () => {
    expect(typeof winAnsiSafe("")).toBe("string");
    expect(typeof winAnsiSafe("𝕏 𝟙 ℝ")).toBe("string");
  });
});

describe("renderInvoicePdf — WinAnsi safety (FIX 5)", () => {
  it("returns a non-empty PDF buffer for a plain Latin client name", async () => {
    const bytes = await renderInvoicePdf(invoiceData());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });

  it("does NOT throw (500) on a client name Helvetica can't encode — emoji/CJK", async () => {
    // Antes da sanitização, `page.drawText` lançava e o recibo/​email dava 500,
    // deixando a linha do livro escrita mas sem documento gerado.
    const bytes = await renderInvoicePdf(
      invoiceData({
        clientName: "Festa 🎉 dos 李明 & Sofia",
        description: "Serviço 💐 completo",
        clientNif: "PT🙂123",
      }),
    );
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
