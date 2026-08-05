import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A cache que faz com que anunciar `Accept-Ranges` não seja um tiro no pé.
 *
 * O que aqui interessa provar não é "guarda coisas": é que o SEGUNDO pedido do
 * mesmo documento NÃO volta a desenhar. Um leitor de PDF faz cinco ou seis
 * pedidos parciais para abrir um ficheiro; sem isto, cada um custava ir buscar
 * até 80 fotos ao Storage e reencodá-las com o sharp.
 */

const desenhar = vi.fn();
vi.mock("./proposal-doc-render", () => ({
  renderStoredProposalDocPdf: (...args: unknown[]) => desenhar(...args),
}));

import { pdfDaPropostaEmCache, esvaziarCachePdf, estadoCachePdf } from "./proposal-pdf-cache";
import type { ProposalDoc } from "./proposal-doc";

const doc = (ref: string) => ({ ref, clientName: "Maria" }) as unknown as ProposalDoc;
const pdfDe = (n: number, byte = 7) => Buffer.alloc(n, byte) as Buffer<ArrayBuffer>;

beforeEach(() => {
  esvaziarCachePdf();
  desenhar.mockReset();
});

describe("pdfDaPropostaEmCache", () => {
  it("desenha uma vez e serve as seguintes de memória", async () => {
    desenhar.mockResolvedValue(pdfDe(1000));
    const a = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const b = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const c = await pdfDaPropostaEmCache(doc("LIQ-1"));
    // Um leitor de PDF a abrir um ficheiro faz vários pedidos. Um desenho.
    expect(desenhar).toHaveBeenCalledTimes(1);
    expect(b).toBe(a);
    expect(c).toBe(a);
  });

  it("um documento REVISTO tem chave nova — nunca serve a versão velha", async () => {
    desenhar.mockResolvedValueOnce(pdfDe(10, 1)).mockResolvedValueOnce(pdfDe(10, 2));
    const antes = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const depois = await pdfDaPropostaEmCache({ ...doc("LIQ-1"), total: 999 } as ProposalDoc);
    expect(desenhar).toHaveBeenCalledTimes(2);
    expect(depois).not.toEqual(antes);
  });

  it("documentos diferentes não se atropelam", async () => {
    desenhar.mockResolvedValueOnce(pdfDe(10, 1)).mockResolvedValueOnce(pdfDe(10, 2));
    const um = await pdfDaPropostaEmCache(doc("LIQ-1"));
    const dois = await pdfDaPropostaEmCache(doc("LIQ-2"));
    expect(um).not.toEqual(dois);
    // E o primeiro continua lá, sem voltar a desenhar.
    expect(await pdfDaPropostaEmCache(doc("LIQ-1"))).toBe(um);
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("uma proposta anormalmente grande serve-se mas NÃO fica guardada", async () => {
    // Senão uma só entrada expulsava todas as outras e a cache deixava de
    // servir para o caso normal.
    desenhar.mockResolvedValue(pdfDe(9 * 1024 * 1024));
    const a = await pdfDaPropostaEmCache(doc("enorme"));
    expect(a.length).toBe(9 * 1024 * 1024);
    expect(estadoCachePdf().entradas).toBe(0);
    await pdfDaPropostaEmCache(doc("enorme"));
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("ao passar do tecto de memória sai a entrada usada há mais tempo", async () => {
    // O tecto é por BYTES e não por número de entradas: é a memória que acaba.
    desenhar.mockImplementation(() => Promise.resolve(pdfDe(5 * 1024 * 1024)));
    for (const r of ["a", "b", "c", "d", "e"]) await pdfDaPropostaEmCache(doc(r));
    const { entradas, bytes } = estadoCachePdf();
    expect(bytes).toBeLessThanOrEqual(24 * 1024 * 1024);
    expect(entradas).toBe(4); // 4 x 5 MB = 20 MB; a quinta expulsou a primeira

    desenhar.mockClear();
    await pdfDaPropostaEmCache(doc("a")); // a mais antiga já saiu
    expect(desenhar).toHaveBeenCalledTimes(1);
  });

  it("usar uma entrada põe-na no fim da fila", async () => {
    desenhar.mockImplementation(() => Promise.resolve(pdfDe(5 * 1024 * 1024)));
    for (const r of ["a", "b", "c", "d"]) await pdfDaPropostaEmCache(doc(r));
    await pdfDaPropostaEmCache(doc("a")); // "a" volta a ser a mais recente
    await pdfDaPropostaEmCache(doc("e")); // expulsa a mais antiga, que agora é "b"

    desenhar.mockClear();
    await pdfDaPropostaEmCache(doc("a"));
    expect(desenhar, '"a" foi usada há pouco e não devia ter saído').not.toHaveBeenCalled();
    await pdfDaPropostaEmCache(doc("b"));
    expect(desenhar, '"b" era a mais antiga e devia ter saído').toHaveBeenCalledTimes(1);
  });
});
