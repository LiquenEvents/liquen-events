import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "p1", status: "enviada" }]),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: store.list }));

import { GET } from "./route";

function req(query = ""): NextRequest {
  return new Request(`https://liquen.test/api/propostas${query}`, {
    method: "GET",
  }) as unknown as NextRequest;
}

/** Uma proposta com documento — o `doc` é o que pesa e o que a lista não usa. */
const comDoc = {
  id: "p1",
  quoteId: "q1",
  clientName: "Maria",
  clientEmail: "maria@exemplo.pt",
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 1000,
  vat: 230,
  total: 1230,
  status: "enviada",
  createdAt: "2026-03-01T10:00:00.000Z",
  followUpAt: "2026-03-20",
  doc: {
    ref: "PO Casamento",
    clientNames: "Maria & Pedro",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Monte da Oliveirinha",
    guests: "150 pax",
    serviceGroups: [{ title: "Cerimónia", items: ["Arco de flores"] }],
    moodBoards: [{ title: "Cerimónia", images: [{ path: "a.jpg" }, { path: "b.jpg" }] }],
    budgetItems: ["Decor Cerimónia", "Copo de água"],
    budgetOpcional: [false, true],
    coverImages: [{ path: "capa.jpg" }, { path: "" }],
    totalLabel: "Valor Total",
    totalText: "3000,00 € + IVA",
    notasImportantes: [],
    incluido: [],
    naoIncluido: [],
    condicoesGerais: [],
    observacoesGerais: [],
    faseamento: [],
    cancelamento: [],
  },
};

/** A mesma proposta sem o documento — o que o modo leve tem de devolver. */
function semODoc<T extends { doc?: unknown }>(p: T): Omit<T, "doc"> {
  const resto = { ...p };
  delete resto.doc;
  return resto;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("GET /api/propostas", () => {
  it("rejects the unauthenticated with 401 and never lists", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("returns the proposals list for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "p1", status: "enviada" }]);
  });

  it("returns 500 (not a crash) when the store throws", async () => {
    authed.ok = true;
    store.list.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});

/**
 * ── O MODO LEVE, `?semDoc=1` ──────────────────────────────────────────────
 *
 * Três painéis (Propostas, Acompanhamento, Análise) desenham listas de nomes,
 * estados e valores a partir desta rota, e nenhum deles imprime o documento —
 * que é quase tudo o que se descarrega. O modo leve existe para eles.
 *
 * O que estes testes prendem é o que torna a mudança segura de fazer:
 *   · sem parâmetro, a resposta é EXACTAMENTE a de hoje (é isso que permite
 *     mudar a rota antes de mudar quem a consome);
 *   · com `semDoc=1`, o documento não vai — nem inteiro nem pela metade;
 *   · e os dois factos que as listas TIRAM do documento continuam a chegar,
 *     senão a mudança deixava de ser neutra e ninguém daria por isso.
 */
describe("GET /api/propostas?semDoc=1", () => {
  beforeEach(() => {
    authed.ok = true;
    store.list.mockResolvedValue([comDoc] as never);
  });

  it("por omissão a resposta continua a trazer o documento inteiro", async () => {
    const res = await GET(req());
    expect(await res.json()).toEqual([comDoc]);
  });

  it("não manda o documento — nem um `doc` truncado", async () => {
    const [p] = await (await GET(req("?semDoc=1"))).json();
    expect("doc" in p).toBe(false);
    expect(JSON.stringify(p)).not.toContain("moodBoards");
    expect(JSON.stringify(p)).not.toContain("Arco de flores");
  });

  it("mantém tudo o que as listas desenham", async () => {
    const [p] = await (await GET(req("?semDoc=1"))).json();
    expect(p).toMatchObject(semODoc(comDoc));
  });

  it("traz os dois factos que as listas tiravam do documento", async () => {
    const [p] = await (await GET(req("?semDoc=1"))).json();
    // O Acompanhamento pergunta «qual das versões é que eles ficaram?» só às
    // propostas que tinham extras — aqui a segunda linha está marcada.
    expect(p.temDoc).toBe(true);
    expect(p.temOpcionais).toBe(true);
  });

  it("uma proposta de linhas antiga (sem documento) diz que não o tem", async () => {
    store.list.mockResolvedValue([semODoc(comDoc)] as never);
    const [p] = await (await GET(req("?semDoc=1"))).json();
    expect(p.temDoc).toBe(false);
    expect(p.temOpcionais).toBe(false);
  });

  it("uma proposta sem linhas marcadas não é dada como tendo extras", async () => {
    store.list.mockResolvedValue([
      { ...comDoc, doc: { ...comDoc.doc, budgetOpcional: [false, false] } },
    ] as never);
    const [p] = await (await GET(req("?semDoc=1"))).json();
    expect(p.temDoc).toBe(true);
    expect(p.temOpcionais).toBe(false);
  });

  it("é MUITO mais leve — é essa a razão de existir", async () => {
    const pesado = JSON.stringify(await (await GET(req())).json()).length;
    const leve = JSON.stringify(await (await GET(req("?semDoc=1"))).json()).length;
    expect(leve).toBeLessThan(pesado / 2);
  });
});
