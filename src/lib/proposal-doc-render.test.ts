import { describe, it, expect, vi, beforeEach } from "vitest";
import { PDFDocument } from "pdf-lib";
import sharp from "sharp";
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
// Sem miniaturas nesta instalação: o resolvedor cai para o original, que é
// exactamente o caminho que estes testes exercitam.
const fetchProposalThumbBytes = vi.fn<(ref: string) => Promise<Buffer | null>>(async () => null);
// Nem derivadas de capa: a primeira geração recorta e tenta guardar, e é
// isso que estes testes vêem — sem armazenamento por baixo.
const fetchProposalCoverBytes = vi.fn<(ref: string) => Promise<Buffer | null>>(async () => null);
/** Guarda o CAMINHO e os BYTES que lhe mandam: era por não os guardar que
 *  ninguém podia dizer sob que nome — nem com que fotografia — a derivada da
 *  capa ficava escrita. */
const uploadProposalCover = vi.fn<(ref: string, bytes: Buffer) => Promise<boolean>>(
  async () => false,
);
vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: (ref: string) => fetchProposalImageBytes(ref),
  fetchProposalThumbBytes: (ref: string) => fetchProposalThumbBytes(ref),
  fetchProposalCoverBytes: (ref: string) => fetchProposalCoverBytes(ref),
  uploadProposalCover: (ref: string, bytes: Buffer) => uploadProposalCover(ref, bytes),
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
  beforeEach(() => {
    fetchProposalImageBytes.mockReset();
    fetchProposalThumbBytes.mockClear();
    fetchProposalCoverBytes.mockClear();
    uploadProposalCover.mockClear();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * CADA FOTO PELO SEU CAMINHO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A capa e o mood board têm derivadas DIFERENTES no armazenamento — uma tira
   * alta (~617×1323) e uma miniatura de 400 px — e os caminhos não se trocam.
   * Uma foto de mood board mandada pelo caminho da capa paga o recorte da tira
   * e uma ESCRITA no armazenamento por uma fotografia que nem sequer é impressa
   * àquele tamanho; e a capa pelo caminho da miniatura sai ampliada na primeira
   * página. Cada função tem de ser chamada com a SUA fotografia.
   */
  it("pergunta pela miniatura das fotos do mood board e pela tira de capa das da capa", async () => {
    fetchProposalImageBytes.mockResolvedValue(null);
    // Dez numa página: só a esta lotação as células descem abaixo do lado da
    // miniatura e a pergunta chega a ser feita.
    const fotos = Array.from({ length: 10 }, (_, i) => `storage/mb-${i}.jpg`);
    await renderStoredProposalDocPdf({
      ...storedDoc(),
      moodBoards: [{ title: "Cerimónia", images: fotos }],
    });
    expect(fetchProposalThumbBytes.mock.calls.flat()).toEqual(fotos);
    expect(fetchProposalCoverBytes.mock.calls.flat()).toEqual([
      "storage/cover-1.jpg",
      "storage/cover-2.jpg",
    ]);
  });

  /**
   * A derivada da capa é feita à primeira vez que faltar e GUARDADA, para
   * ninguém voltar a pagar o recorte. Guardada onde? Debaixo da fotografia de
   * onde saiu — e com os bytes RECORTADOS, não com o original. Escrever ali o
   * original é a avaria silenciosa perfeita: a derivada passa a existir, o
   * atalho passa a aceitá-la, e a poupança que este caminho todo existe para
   * conseguir desaparece para sempre sem nada falhar.
   */
  it("guarda a derivada da capa debaixo da foto de onde saiu, e recortada", async () => {
    const original = await sharp({
      create: { width: 1400, height: 3000, channels: 3, background: { r: 124, g: 133, b: 75 } },
    })
      .jpeg()
      .toBuffer();
    fetchProposalImageBytes.mockResolvedValue(original);
    await renderStoredProposalDocPdf({
      ...storedDoc(),
      moodBoards: [],
      coverImages: ["storage/cover-1.jpg", ""],
    });
    const [destino, guardados] = uploadProposalCover.mock.calls[0];
    expect(destino).toBe("storage/cover-1.jpg");
    expect(guardados.equals(original)).toBe(false);
  });

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

  it("nunca resolve mais de 80 imagens, por muitas que o documento traga", async () => {
    // O teto vale por duas razões: nenhuma explosão de fetches, e — porque o
    // gerador redimensiona com o sharp cada imagem que lhe chega — nenhuma
    // explosão de trabalho de CPU a gerar o PDF.
    fetchProposalImageBytes.mockResolvedValue(null);
    await renderStoredProposalDocPdf({
      ...storedDoc(),
      moodBoards: Array.from({ length: 40 }, (_, b) => ({
        title: `Board ${b}`,
        images: Array.from({ length: 10 }, (_, i) => `storage/b${b}-${i}.jpg`),
      })),
    });
    expect(fetchProposalImageBytes.mock.calls.length).toBeLessThanOrEqual(80);
  });

  it('gera na mesma com a capa preenchida só de um lado (a outra posição é "")', async () => {
    // A capa chega SEMPRE com duas posições ("" = vazia) — ver
    // `normaliseCoverImages`. Uma posição vazia, ou bytes que não são imagem,
    // não podem rebentar a geração: o documento sai à mesma.
    fetchProposalImageBytes.mockImplementation(async (ref) =>
      ref === "storage/cover-2.jpg" ? Buffer.from("não sou uma imagem") : null,
    );
    const out = await renderStoredProposalDocPdf({
      ...storedDoc(),
      coverImages: ["", "storage/cover-2.jpg"],
    });
    expect(out.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});
