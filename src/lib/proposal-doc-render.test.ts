import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * `renderStoredProposalDocPdf` é a costura entre um `ProposalDoc` ARMAZENADO
 * (campos de imagem = caminhos no Storage) e o gerador storage-agnóstico:
 * preenche o boilerplate, resolve cada referência de imagem para bytes e
 * renderiza. O seam testável é `fetchProposalImageBytes` (server-only/Supabase),
 * aqui mockado — assim cobrimos a orquestração sem tocar na rede: referências em
 * falta são simplesmente descartadas e o PDF sai na mesma.
 */
const fetchProposalImageBytes = vi.fn<(ref: string) => Promise<Buffer | null>>();
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: (ref: string) => fetchProposalImageBytes(ref),
}));

// Import DEPOIS do mock (a factory acima é elevada pelo Vitest).
const { renderStoredProposalDocPdf } = await import("./proposal-doc-render");

function storedDoc(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento 12.09.2026",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Évora",
    guests: "80 pax",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: [{ title: "Cerimónia", images: ["storage/mb-1.jpg", "storage/mb-2.jpg"] }],
    budgetItems: ["Decor"],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    coverImages: ["storage/cover-1.jpg", "storage/cover-2.jpg"],
  });
}

describe("renderStoredProposalDocPdf", () => {
  beforeEach(() => fetchProposalImageBytes.mockReset());

  it("resolves every image reference and returns a PDF Buffer even when they're missing", async () => {
    fetchProposalImageBytes.mockResolvedValue(null); // todas em falta → descartadas
    const out = await renderStoredProposalDocPdf(storedDoc());
    expect(Buffer.isBuffer(out)).toBe(true);
    expect(out.subarray(0, 5).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(out);
    expect(parsed.getPageCount()).toBeGreaterThan(1);
    // Cada cover (2) + cada imagem de mood board (2) foi resolvida via o seam.
    expect(fetchProposalImageBytes).toHaveBeenCalledWith("storage/cover-1.jpg");
    expect(fetchProposalImageBytes).toHaveBeenCalledWith("storage/mb-2.jpg");
    expect(fetchProposalImageBytes).toHaveBeenCalledTimes(4);
  });
});
