import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A cache que faz com que anunciar `Accept-Ranges` não seja um tiro no pé.
 *
 * O que aqui interessa provar não é "guarda coisas": é que o SEGUNDO pedido do
 * mesmo documento NÃO volta a desenhar. Um leitor de PDF faz cinco ou seis
 * pedidos parciais para abrir um ficheiro; sem isto, cada um custava ir buscar
 * até 80 fotos ao Storage e reencodá-las com o sharp.
 */

/**
 * O `desenhar` devolve só os BYTES, como sempre devolveu — o relatório é
 * embrulhado à volta dele aqui. Assim os casos que só querem provar a cache
 * continuam a ler-se como antes, e quem quiser exercitar as fotos em falta
 * mexe em `emFalta`.
 */
const desenhar = vi.fn();
/** Fotos em falta em cada passagem, por ordem. Vazia = zero, sempre. */
let filaDeFaltas: number[] = [];
vi.mock("./proposal-doc-render", () => ({
  renderStoredProposalDocPdfWithReport: async (...args: unknown[]) => {
    const pdf = await desenhar(...args);
    return { pdf, missingImages: filaDeFaltas.shift() ?? 0, truncations: [] };
  },
}));

import { pdfDaPropostaEmCache, esvaziarCachePdf, estadoCachePdf } from "./proposal-pdf-cache";
import type { ProposalDoc } from "./proposal-doc";

const doc = (ref: string) => ({ ref, clientName: "Maria" }) as unknown as ProposalDoc;
const pdfDe = (n: number, byte = 7) => Buffer.alloc(n, byte) as Buffer<ArrayBuffer>;

beforeEach(() => {
  esvaziarCachePdf();
  desenhar.mockReset();
  filaDeFaltas = [];
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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UM PDF COM BURACOS NÃO SAI DAQUI
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta cache serve o documento ao CASAL. Deitava fora o relatório do gerador:
 * uma fotografia que não resolvesse desaparecia da proposta e o ficheiro seguia
 * na mesma, bonito e incompleto — e a moldura não fica vazia, simplesmente não
 * existe, portanto ninguém dá por nada.
 */
describe("fotos em falta", () => {
  it("tenta segunda vez: a causa mais comum é passageira", async () => {
    /**
     * A primeira versão deste teste punha `emFalta = 0` logo a seguir a lançar
     * a promessa, e o mock — que lê `emFalta` DEPOIS do `await` — já via zero.
     * Não havia segunda passagem nenhuma e a asserção («chamado uma vez»)
     * passava por acidente, a medir o caso normal. Uma FILA diz mesmo o que
     * cada passagem devolveu.
     */
    filaDeFaltas = [3, 0];
    desenhar.mockResolvedValue(pdfDe(100));

    const pdf = await pdfDaPropostaEmCache(doc("LIQ-9"));
    expect(pdf).toBeTruthy();
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  it("recusa quando à segunda continuam a faltar", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [1, 1];
    await expect(pdfDaPropostaEmCache(doc("LIQ-10"))).rejects.toThrow(/em falta/i);
    expect(desenhar).toHaveBeenCalledTimes(2);
  });

  /**
   * O ERRO QUE ISTO IMPEDE: guardar a falha em cache. A falha é passageira por
   * definição; fixá-la até ao próximo arranque a frio é o mesmo "gravar uma
   * falha como se fosse um facto" que já apareceu duas vezes neste projecto.
   */
  it("uma recusa não fica guardada", async () => {
    desenhar.mockResolvedValue(pdfDe(100));
    filaDeFaltas = [1, 1];
    await expect(pdfDaPropostaEmCache(doc("LIQ-11"))).rejects.toThrow();
    expect(estadoCachePdf().entradas).toBe(0);

    await expect(pdfDaPropostaEmCache(doc("LIQ-11"))).resolves.toBeTruthy();
    expect(estadoCachePdf().entradas).toBe(1);
  });
});
