import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * UMA PROPOSTA NÃO PODE SEGUIR PARA O CLIENTE COM FOTOS A MENOS EM SILÊNCIO.
 *
 * O gerador salta a foto que não consegue resolver: `fetchProposalImageBytes`
 * devolve `null` e quem desenha ignora-a. O PDF sai na mesma, com ar de estar
 * bem, e a primeira pessoa a dar pela falta é quem o abre. Foi exactamente
 * assim que a Catarina o encontrou.
 *
 * Estes testes fixam a contagem que agora acompanha o PDF, para o estúdio poder
 * avisar ANTES de a proposta ser enviada.
 */

const fetchMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/proposal-storage", () => ({ fetchProposalImageBytes: fetchMock }));
vi.mock("@/lib/proposal-doc-pdf", () => ({
  renderProposalDocPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));

const { renderStoredProposalDocPdfWithReport } = await import("./proposal-doc-render");

const docWith = (cover: string[], board: string[]) =>
  ({
    ref: "LIQ-TESTE",
    clientNames: "Teste",
    coverImages: cover,
    moodBoards: board.length ? [{ title: "Board", images: board }] : [],
  }) as unknown as Parameters<typeof renderStoredProposalDocPdfWithReport>[0];

beforeEach(() => fetchMock.mockReset());

describe("contagem de fotos em falta", () => {
  it("conta zero quando todas resolvem", async () => {
    fetchMock.mockResolvedValue(Buffer.from("foto"));
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", "b.jpg"], ["c.jpg"]),
    );
    expect(missingImages).toBe(0);
  });

  it("conta uma foto de capa que não resolve", async () => {
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "b.jpg" ? null : Buffer.from("x"),
    );
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", "b.jpg"], []),
    );
    expect(missingImages).toBe(1);
  });

  it("conta uma foto de mood board que não resolve", async () => {
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "c.jpg" ? null : Buffer.from("x"),
    );
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["c.jpg", "d.jpg"]),
    );
    expect(missingImages).toBe(1);
  });

  it("um LUGAR de capa vazio não conta como falta", async () => {
    // A capa tem duas posições fixas; deixar uma por preencher é uma escolha da
    // Catarina, não uma avaria. Contá-la faria o aviso disparar sempre.
    fetchMock.mockResolvedValue(Buffer.from("x"));
    const { missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg", ""], []),
    );
    expect(missingImages).toBe(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("conta as que passam do tecto de imagens por documento", async () => {
    // O tecto também era uma perda silenciosa: acima dele as fotos deixavam
    // simplesmente de entrar.
    fetchMock.mockResolvedValue(Buffer.from("x"));
    const muitas = Array.from({ length: 90 }, (_, i) => `f${i}.jpg`);
    const { missingImages } = await renderStoredProposalDocPdfWithReport(docWith([], muitas));
    expect(missingImages).toBe(10); // 90 pedidas, tecto de 80
  });

  it("o PDF sai à mesma, mesmo com fotos em falta", async () => {
    // Recusar o PDF seria pior: ela fica sem nada. Sai, mas avisado.
    fetchMock.mockResolvedValue(null);
    const { pdf, missingImages } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["b.jpg"]),
    );
    expect(missingImages).toBe(2);
    expect(pdf.byteLength).toBeGreaterThan(0);
  });
});
