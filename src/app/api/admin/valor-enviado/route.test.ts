// @vitest-environment node
import { describe, expect, it, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ROTA QUE REPÕE O VALOR QUE SAIU NO PDF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A aritmética está em `lib/orcamento/valor-enviado.ts` e tem os seus testes.
 * O que se guarda aqui são as decisões da ROTA, e todas elas existem para
 * impedir que uma ferramenta que corrige dinheiro estrague dinheiro:
 *
 *  · relê a lista antes de escrever, em vez de acreditar no ecrã;
 *  · escreve UM campo, e deixa rasto de cada escrita;
 *  · um pedido que falha não leva os outros atrás.
 */

const listQuotes = vi.fn();
const listAllProposals = vi.fn();
const updateQuoteWith = vi.fn();

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({
  listQuotes: () => listQuotes(),
  updateQuoteWith: (id: string, fn: unknown) => updateQuoteWith(id, fn),
}));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: () => listAllProposals() }));

const pedir = (corpo?: unknown) =>
  ({
    json: async () => corpo ?? {},
  }) as unknown as NextRequest;

beforeEach(() => {
  vi.clearAllMocks();
  listQuotes.mockResolvedValue([
    { id: "q1", name: "Rita e João", quotedPrice: 3140 },
    { id: "q2", name: "Ana Braz", quotedPrice: 2000 },
  ]);
  listAllProposals.mockResolvedValue([
    { id: "p1", quoteId: "q1", subtotal: 3000, sentAt: "2026-05-02T10:00:00Z" },
    { id: "p2", quoteId: "q2", subtotal: 2000, sentAt: "2026-05-02T10:00:00Z" },
  ]);
  updateQuoteWith.mockImplementation(async (_id: string, fn: (q: unknown) => unknown) => {
    fn({ id: "q1", quotedPrice: 3140, activityLog: [] });
    return null;
  });
});

describe("GET /api/admin/valor-enviado", () => {
  it("lista só os que divergem, e não escreve nada", async () => {
    const { GET } = await import("./route");
    const res = await GET(pedir());
    const corpo = await res.json();
    expect(corpo.divergentes).toHaveLength(1);
    expect(corpo.divergentes[0]).toMatchObject({ quoteId: "q1", noPedido: 3140, enviado: 3000 });
    expect(updateQuoteWith, "o GET escreveu").not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/valor-enviado", () => {
  it("põe o pedido no valor que saiu, e só esse", async () => {
    const { POST } = await import("./route");
    const res = await POST(pedir({}));
    const corpo = await res.json();
    expect(corpo.feitos).toEqual([{ quoteId: "q1", de: 3140, para: 3000 }]);
    expect(updateQuoteWith).toHaveBeenCalledTimes(1);
    expect(updateQuoteWith.mock.calls[0][0]).toBe("q1");
  });

  it("escreve o valor DA LEITURA FRESCA, não o que o ecrã mandar", async () => {
    // Entre o «Procurar» e o carregar no botão pode ter passado tempo, e nesse
    // tempo ela pode ter corrigido à mão noutro separador. Se a rota
    // acreditasse nos números do ecrã, punha o valor velho por cima do novo —
    // e seria esta ferramenta a criar o defeito que veio fechar.
    const { POST } = await import("./route");
    await POST(pedir({ quoteIds: ["q1"], enviado: 99999 }));
    const mutar = updateQuoteWith.mock.calls[0][1] as (q: unknown) => { quotedPrice: number };
    expect(mutar({ id: "q1", quotedPrice: 3140, activityLog: [] }).quotedPrice).toBe(3000);
  });

  it("deixa rasto de cada correcção no histórico do pedido", async () => {
    // Um valor de dinheiro que muda sem deixar rasto é a avaria que esta
    // ferramenta existe para fechar.
    const { POST } = await import("./route");
    await POST(pedir({}));
    const mutar = updateQuoteWith.mock.calls[0][1] as (q: unknown) => {
      activityLog: { kind: string; summary: string }[];
    };
    const registo = mutar({ id: "q1", quotedPrice: 3140, activityLog: [] }).activityLog;
    expect(registo).toHaveLength(1);
    expect(registo[0].kind).toBe("price_set");
    expect(registo[0].summary).toContain("3140.00");
    expect(registo[0].summary).toContain("3000.00");
  });

  it("aplica só os pedidos escolhidos quando o corpo os nomeia", async () => {
    listQuotes.mockResolvedValue([
      { id: "q1", name: "Rita e João", quotedPrice: 3140 },
      { id: "q2", name: "Ana Braz", quotedPrice: 1111 },
    ]);
    const { POST } = await import("./route");
    await POST(pedir({ quoteIds: ["q2"] }));
    expect(updateQuoteWith).toHaveBeenCalledTimes(1);
    expect(updateQuoteWith.mock.calls[0][0]).toBe("q2");
  });

  it("um pedido que falha não leva os outros atrás", async () => {
    listQuotes.mockResolvedValue([
      { id: "q1", name: "Rita e João", quotedPrice: 3140 },
      { id: "q2", name: "Ana Braz", quotedPrice: 1111 },
    ]);
    updateQuoteWith.mockImplementation(async (id: string) => {
      if (id === "q1") throw new Error("base em baixo");
      return null;
    });
    const { POST } = await import("./route");
    const corpo = await (await POST(pedir({}))).json();
    expect(corpo.falhados).toEqual(["q1"]);
    expect(corpo.feitos.map((f: { quoteId: string }) => f.quoteId)).toEqual(["q2"]);
  });

  it("não escreve nada quando não há nada a corrigir", async () => {
    listQuotes.mockResolvedValue([{ id: "q1", name: "Rita", quotedPrice: 3000 }]);
    const { POST } = await import("./route");
    const corpo = await (await POST(pedir({}))).json();
    expect(corpo.feitos).toEqual([]);
    expect(updateQuoteWith).not.toHaveBeenCalled();
  });
});
