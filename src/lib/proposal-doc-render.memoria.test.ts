import { describe, it, expect, vi, beforeEach } from "vitest";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * A fotografia reduzida a 1 800 px fica em memória pelo caminho: o segundo
 * desenho da mesma proposta não volta a descarregar nem a reduzir os originais.
 */
const fetchProposalImageBytes = vi.fn<(ref: string) => Promise<Buffer | null>>();
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: (ref: string) => fetchProposalImageBytes(ref),
  fetchProposalThumbBytes: async () => null,
  fetchProposalCoverBytes: async () => null,
  uploadProposalCover: async () => false,
}));

const { renderStoredEditorialPdfWithReport, esvaziarFotosEditoriais } =
  await import("./proposal-doc-render");

function doc(imagens: string[]): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO TESTE",
    clientNames: "TESTE Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2099",
    location: "TESTE Évora",
    guests: "80 pax",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: [{ title: "Cerimónia", images: imagens }],
    budgetItems: ["Decor"],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    coverImages: ["", ""],
  });
}

let foto: Buffer;

beforeEach(async () => {
  esvaziarFotosEditoriais();
  fetchProposalImageBytes.mockReset();
  foto ??= await sharp({
    create: { width: 2400, height: 1600, channels: 3, background: { r: 124, g: 133, b: 75 } },
  })
    .jpeg()
    .toBuffer();
});

describe("as fotografias reduzidas ficam em memória", () => {
  it("o segundo desenho não volta ao armazenamento", async () => {
    fetchProposalImageBytes.mockResolvedValue(foto);
    const d = doc(["proposal-assets/q1/a.jpg", "proposal-assets/q1/b.jpg"]);
    await renderStoredEditorialPdfWithReport(d, "pt");
    expect(fetchProposalImageBytes).toHaveBeenCalledTimes(2);
    const segundo = await renderStoredEditorialPdfWithReport(d, "pt");
    expect(fetchProposalImageBytes).toHaveBeenCalledTimes(2);
    expect(segundo.missingImages).toBe(0);
  });

  it("uma foto que falhou não fica: o desenho seguinte tenta outra vez", async () => {
    fetchProposalImageBytes.mockResolvedValueOnce(null);
    const d = doc(["proposal-assets/q1/a.jpg"]);
    const primeiro = await renderStoredEditorialPdfWithReport(d, "pt");
    expect(primeiro.missingImages).toBe(1);
    fetchProposalImageBytes.mockResolvedValue(foto);
    const segundo = await renderStoredEditorialPdfWithReport(d, "pt");
    expect(segundo.missingImages).toBe(0);
    expect(fetchProposalImageBytes).toHaveBeenCalledTimes(2);
  });

  it("uma imagem embutida (data:) não é guardada pelo caminho", async () => {
    const embutida = `data:image/jpeg;base64,${foto.toString("base64")}`;
    fetchProposalImageBytes.mockResolvedValue(foto);
    const d = doc([embutida]);
    await renderStoredEditorialPdfWithReport(d, "pt");
    await renderStoredEditorialPdfWithReport(d, "pt");
    expect(fetchProposalImageBytes).toHaveBeenCalledTimes(2);
  });
});
