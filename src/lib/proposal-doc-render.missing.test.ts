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
/** O gerador, aqui de mentira: guarda o documento que RECEBEU (para se ver o
 *  que sobrou depois da resolução das fotos) e devolve o relatório de conteúdo
 *  cortado que cada teste quiser. */
const pdfMock = vi.hoisted(() => ({
  docs: [] as unknown[],
  truncations: [] as { where: string; dropped: number; unit: "fotos" | "linhas" }[],
}));

vi.mock("@/lib/proposal-storage", () => ({
  fetchProposalImageBytes: fetchMock,
  fetchProposalThumbBytes: async () => null,
}));
vi.mock("@/lib/proposal-doc-pdf", async (importOriginal) => ({
  // A GEOMETRIA é real. É ela que o resolvedor usa para decidir o tamanho de
  // cada ficheiro; substituí-la por um duplo mediria outra coisa qualquer.
  caixasDoCollage: (await importOriginal<typeof import("./proposal-doc-pdf")>()).caixasDoCollage,
  renderProposalDocPdfWithReport: vi.fn(async (doc: unknown) => {
    pdfMock.docs.push(doc);
    return { bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]), truncations: pdfMock.truncations };
  }),
}));

const { renderStoredProposalDocPdfWithReport } = await import("./proposal-doc-render");

const docWith = (cover: string[], board: string[]) =>
  ({
    ref: "LIQ-TESTE",
    clientNames: "Teste",
    coverImages: cover,
    moodBoards: board.length ? [{ title: "Board", images: board }] : [],
  }) as unknown as Parameters<typeof renderStoredProposalDocPdfWithReport>[0];

beforeEach(() => {
  fetchMock.mockReset();
  pdfMock.docs = [];
  pdfMock.truncations = [];
});

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

/**
 * A OUTRA maneira de a proposta seguir incompleta: o conteúdo CHEGA e o desenho
 * não o mostra todo (a sétima foto de um mood board, a terceira linha do
 * "Local"). Também tem de chegar a quem envia — mas por um caminho seu, porque
 * a correcção é outra: uma foto em falta tenta-se de novo, um mood board com
 * fotos a mais tem de perder fotos.
 */
describe("conteúdo cortado pelo desenho", () => {
  it("não relata nada quando o gerador não corta nada", async () => {
    fetchMock.mockResolvedValue(Buffer.from("foto"));
    const { truncations } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["b.jpg"]),
    );
    expect(truncations).toEqual([]);
  });

  it("o que o gerador cortou viaja no relatório, ao lado das fotos em falta", async () => {
    pdfMock.truncations = [{ where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" }];
    fetchMock.mockImplementation(async (ref: string) =>
      ref === "x.jpg" ? null : Buffer.from("f"),
    );
    const { missingImages, truncations } = await renderStoredProposalDocPdfWithReport(
      docWith(["a.jpg"], ["x.jpg", "b.jpg"]),
    );
    // As duas perdas convivem e continuam distintas: uma é avaria, outra é
    // composição — e a mensagem que a Catarina lê precisa de saber qual é qual.
    expect(missingImages).toBe(1);
    expect(truncations).toEqual([{ where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" }]);
  });

  it("uma foto EM FALTA nunca é contada também como cortada", async () => {
    // O gerador só vê as fotos que RESOLVERAM — as outras já foram descartadas
    // aqui e contadas em `missingImages`. Sem isto, um mood board com fotos em
    // falta arriscava-se a ser avisado duas vezes pela mesma foto.
    fetchMock.mockImplementation(async (ref: string) =>
      ref.startsWith("mau") ? null : Buffer.from("f"),
    );
    const board = ["mau1.jpg", "mau2.jpg", "mau3.jpg", "b1.jpg", "b2.jpg"];
    const { missingImages } = await renderStoredProposalDocPdfWithReport(docWith([], board));
    expect(missingImages).toBe(3);
    const recebido = pdfMock.docs[0] as { moodBoards: { images: string[] }[] };
    expect(recebido.moodBoards[0].images).toHaveLength(2); // só as que resolveram
  });
});
