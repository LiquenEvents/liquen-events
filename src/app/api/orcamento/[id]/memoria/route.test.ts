import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A memória de preços vista pela rota. O que se prende aqui é o que a torna
 * segura de usar: não sai nada de outros clientes senão números agregados, e
 * um serviço com casos a menos não aparece de todo.
 */

const authed = vi.hoisted(() => ({ ok: true }));
const store = vi.hoisted(() => ({
  quote: vi.fn(async () => ({ id: "LIQ-9", guests: 150, location: "Évora" }) as unknown),
  quotes: vi.fn(async () => [] as unknown[]),
  propostas: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/lib/admin-auth", async (orig) => ({
  ...(await orig<typeof import("@/lib/admin-auth")>()),
  isAuthed: () => authed.ok,
}));
vi.mock("@/lib/quotes-store", () => ({ getQuote: store.quote, listQuotes: store.quotes }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: store.propostas }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

const { GET } = await import("./route");

const pedir = () => GET({} as NextRequest, { params: Promise.resolve({ id: "LIQ-9" }) });

/** Um casamento parecido com o que se está a orçamentar (150 pax, Évora). */
const parecido = (id: string, itens: string[], precos: (number | null)[]) => ({
  id: `p-${id}`,
  quoteId: id,
  status: "enviada",
  sentAt: "2026-01-01T10:00:00.000Z",
  createdAt: "2026-01-01T10:00:00.000Z",
  doc: { budgetItems: itens, budgetAmounts: precos },
});
const pedido = (id: string) => ({ id, guests: 150, location: "Évora" });

beforeEach(() => {
  authed.ok = true;
  store.quote.mockClear();
  store.quotes.mockClear();
  store.propostas.mockClear();
  store.quotes.mockResolvedValue([]);
  store.propostas.mockResolvedValue([]);
});

describe("o histórico", () => {
  it("resume o que já se cobrou pelo mesmo serviço", async () => {
    store.quotes.mockResolvedValue([pedido("a"), pedido("b"), pedido("c")]);
    store.propostas.mockResolvedValue([
      parecido("a", ["Arranjos de mesa"], [800]),
      parecido("b", ["arranjos de mesa"], [1000]),
      parecido("c", ["Arranjos das mesas"], [1200]),
    ]);
    const body = await (await pedir()).json();

    // Três formas de escrever o mesmo serviço contam como um só: é a diferença
    // entre ter memória e ter três memórias com um caso cada.
    expect(body.historico).toHaveLength(1);
    const h = body.historico[0];
    expect(h.min).toBe(800);
    expect(h.max).toBe(1200);
    expect(h.mediana).toBe(1000);
    expect(h.casos).toBe(3);
  });

  it("um serviço com casos a menos não aparece", async () => {
    store.quotes.mockResolvedValue([pedido("a")]);
    store.propostas.mockResolvedValue([parecido("a", ["Só uma vez"], [999])]);
    // Uma sugestão feita de uma proposta única tem a mesma aparência de
    // autoridade que uma feita de vinte, e é o contrário de ajudar.
    expect((await (await pedir()).json()).historico).toEqual([]);
  });

  it("não devolve nada que identifique o cliente de onde veio o número", async () => {
    store.quotes.mockResolvedValue([pedido("a"), pedido("b"), pedido("c")]);
    store.propostas.mockResolvedValue([
      parecido("a", ["Arranjos de mesa"], [800]),
      parecido("b", ["Arranjos de mesa"], [1000]),
      parecido("c", ["Arranjos de mesa"], [1200]),
    ]);
    const cru = JSON.stringify((await (await pedir()).json()).historico);
    // Nem o pedido, nem a proposta, nem o documento: só o agregado. O que sai
    // daqui vai para o ecrã de quem escreve a proposta seguinte.
    expect(cru).not.toContain("quoteId");
    expect(cru).not.toContain("budgetItems");
    expect(cru).not.toContain("p-a");
  });
});

describe("o que costuma incluir", () => {
  it("vem por filtrar, para o estúdio tirar o que já lá tem", async () => {
    store.quotes.mockResolvedValue([pedido("a"), pedido("b"), pedido("c")]);
    store.propostas.mockResolvedValue([
      parecido("a", ["Arranjos de mesa", "Arco floral"], [800, 300]),
      parecido("b", ["Arranjos de mesa", "Arco floral"], [1000, 320]),
      parecido("c", ["Arranjos de mesa", "Arco floral"], [1200, 340]),
    ]);
    const body = await (await pedir()).json();
    // O que já está no rascunho só o browser sabe — está por gravar e muda a
    // cada linha escrita. Por isso a rota manda tudo e a filtragem é lá.
    expect(body.habituais.map((o: { nome: string }) => o.nome).sort()).toEqual([
      "Arco floral",
      "Arranjos de mesa",
    ]);
  });
});

describe("as bordas", () => {
  it("um pedido que não existe dá 404", async () => {
    store.quote.mockResolvedValueOnce(null);
    expect((await pedir()).status).toBe(404);
  });

  it("sem histórico nenhum responde vazio, não em erro", async () => {
    const res = await pedir();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ historico: [], habituais: [] });
  });

  it("sem sessão não chega às propostas", async () => {
    authed.ok = false;
    expect((await pedir()).status).toBe(401);
    expect(store.propostas).not.toHaveBeenCalled();
  });
});
