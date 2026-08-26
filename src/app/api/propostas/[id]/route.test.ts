import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  update: vi.fn(
    async (
      id: string,
      patch: Record<string, unknown>,
    ): Promise<Record<string, unknown> | null> => ({ id, ...patch }),
  ),
  remove: vi.fn(async (): Promise<void> => {}),
}));
/**
 * O pedido de que esta proposta é filha, e a escrita que o move. `pedido.actual`
 * é o que está GRAVADO — a rota lê-o de dentro do `updateQuoteWith`, que é
 * precisamente o ponto: a regra é avaliada contra o servidor e não contra o
 * retrato que o browser tinha.
 */
const pedido = vi.hoisted(() => ({
  actual: { id: "q1", status: "pendente", activityLog: [] } as Record<string, unknown>,
}));
const quotes = vi.hoisted(() => ({
  updateWith: vi.fn(),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", () => ({
  updateProposal: store.update,
  deleteProposal: store.remove,
}));
vi.mock("@/lib/quotes-store", () => ({ updateQuoteWith: quotes.updateWith }));

import { DELETE, PATCH } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function delReq(): NextRequest {
  return new Request("https://liquen.test/api/propostas/p1", {
    method: "DELETE",
  }) as unknown as NextRequest;
}
function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/propostas/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}
function rawReq(raw: string): NextRequest {
  return new Request("https://liquen.test/api/propostas/p1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: raw,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
  pedido.actual = { id: "q1", status: "pendente", activityLog: [] };
  // A proposta que a loja devolve traz o `quoteId` — sem ele não há pedido
  // nenhum a mover, e este ficheiro estaria a testar o caso vazio sem dar por isso.
  store.update.mockImplementation(async (id: string, patch: Record<string, unknown>) => ({
    id,
    quoteId: "q1",
    total: 12000,
    ...patch,
  }));
  quotes.updateWith.mockImplementation(
    async (_id: string, mutate: (q: Record<string, unknown>) => Record<string, unknown>) => {
      pedido.actual = mutate(pedido.actual);
      return pedido.actual;
    },
  );
});

describe("PATCH /api/propostas/[id]", () => {
  it("rejects the unauthenticated with 401 and never updates", async () => {
    const res = await PATCH(req({ status: "aceite" }), ctx("p1"));
    expect(res.status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("updates an allow-listed status for an authenticated admin", async () => {
    authed.ok = true;
    const res = await PATCH(req({ status: "aceite", respondedAt: "2026-07-19" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith("p1", {
      status: "aceite",
      respondedAt: "2026-07-19",
    });
  });

  it("blocks mass-assignment: only status + respondedAt pass through", async () => {
    authed.ok = true;
    await PATCH(
      req({ status: "aceite", total: 999999, id: "evil", clientEmail: "hacker@x.com" }),
      ctx("p1"),
    );
    expect(store.update).toHaveBeenCalledWith("p1", { status: "aceite" });
  });

  it("rejects an invalid status value with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req({ status: "concluida" }), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  /**
   * O `respondedAt` é um `timestamptz` na base (ver db/schema.sql) e estava ao
   * lado de quatro campos validados, sem verificação nenhuma: uma string
   * qualquer fazia a escrita rebentar lá dentro e sair daqui um 500.
   */
  it("recusa uma data de resposta que não é uma data", async () => {
    authed.ok = true;
    const res = await PATCH(req({ respondedAt: "logo à tarde" }), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("aceita uma data de resposta real, e o vazio continua a limpar", async () => {
    authed.ok = true;
    expect((await PATCH(req({ respondedAt: "2026-07-20T10:00:00.000Z" }), ctx("p1"))).status).toBe(
      200,
    );
    expect((await PATCH(req({ respondedAt: "" }), ctx("p1"))).status).toBe(200);
  });

  it("as notas são texto, e com tecto — não um objecto de 50 MB", async () => {
    authed.ok = true;
    const mau = await PATCH(req({ followUpNote: { nao: "é texto" } }), ctx("p1"));
    expect(mau.status).toBe(400);

    await PATCH(req({ lostNote: "x".repeat(9000) }), ctx("p1"));
    const patch = store.update.mock.calls.at(-1)![1] as Record<string, string>;
    expect(patch.lostNote.length).toBe(2000);
  });

  it("returns 404 when the proposal does not exist", async () => {
    authed.ok = true;
    store.update.mockResolvedValueOnce(null);
    const res = await PATCH(req({ status: "aceite" }), ctx("ghost"));
    expect(res.status).toBe(404);
  });

  it("returns 400 (not 500) for a malformed JSON body", async () => {
    authed.ok = true;
    const res = await PATCH(rawReq("not-json{"), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });

  it("returns 400 for a non-object body (null) instead of crashing on `in`", async () => {
    authed.ok = true;
    const res = await PATCH(rawReq("null"), ctx("p1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PEDIDO SEGUE A PROPOSTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O defeito que estes testes prendem: uma auditoria em produção encontrou a
 * Margarida Serra com duas propostas enviadas por email e o pedido dela ainda
 * na coluna «Novo». Marcar uma proposta como enviada — no ecrã «Propostas» ou
 * no «Acompanhamento» — não mexia no pedido, e só o «Aceite» de UM dos ecrãs o
 * fazia, num segundo pedido HTTP disparado pelo browser.
 *
 * Cada um destes cai com a alteração revertida. Verificado: sem o
 * `moverOPedido`, `quotes.updateWith` nunca é chamado e os cinco primeiros
 * falham na primeira asserção.
 */
describe("o estado do pedido segue o estado da proposta", () => {
  it("marcar a proposta como ENVIADA põe o pedido em «Proposta enviada»", async () => {
    authed.ok = true;
    const res = await PATCH(req({ status: "enviada" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(quotes.updateWith).toHaveBeenCalledWith("q1", expect.any(Function));
    expect(pedido.actual.status).toBe("cotado");
  });

  it("marcar como ACEITE fecha o pedido, sem o browser ter de o pedir à parte", async () => {
    authed.ok = true;
    await PATCH(req({ status: "aceite" }), ctx("p1"));
    expect(pedido.actual.status).toBe("aceite");
  });

  it("«em negociação» conta como proposta saída — o mesmo tecto", async () => {
    authed.ok = true;
    await PATCH(req({ status: "em_negociacao" }), ctx("p1"));
    expect(pedido.actual.status).toBe("cotado");
  });

  /**
   * A linha do histórico é o que lhe permite ver a coluna mudar sozinha e
   * saber o que a mudou. Sem ela, a mudança é indistinguível de um engano.
   */
  it("deixa no histórico a linha que explica a mudança, com o valor", async () => {
    authed.ok = true;
    await PATCH(req({ status: "enviada" }), ctx("p1"));
    const log = pedido.actual.activityLog as { kind: string; summary: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].kind).toBe("status_change");
    expect(log[0].summary).toContain("proposta enviada ao cliente");
    expect(log[0].summary).toContain("12"); // o total da proposta, em euros
  });

  /**
   * O `actor` é a única coisa que o browser ainda manda para esta transição, e
   * manda-a porque o servidor não a sabe: a sessão do back office é uma só e
   * não tem nome. Sem ele a linha dizia «Sistema», que é a palavra que esta
   * casa reserva para o que não foi ninguém — e aqui foi ela.
   */
  it("a linha do histórico fica com o nome de quem marcou, não com «Sistema»", async () => {
    authed.ok = true;
    await PATCH(req({ status: "aceite", actor: "Catarina" }), ctx("p1"));
    const log = pedido.actual.activityLog as { actor: string }[];
    expect(log[0].actor).toBe("Catarina");
    // E o `actor` NÃO é campo da proposta: não pode entrar na escrita dela.
    expect(store.update).toHaveBeenCalledWith("p1", { status: "aceite" });
  });

  it("sem nome, a linha volta a «Sistema» em vez de ficar vazia", async () => {
    authed.ok = true;
    await PATCH(req({ status: "aceite" }), ctx("p1"));
    expect((pedido.actual.activityLog as { actor: string }[])[0].actor).toBe("Sistema");
  });

  /** Quem chamou recebe o pedido já gravado — não tem de o ir buscar outra vez. */
  it("devolve o pedido movido junto com a proposta", async () => {
    authed.ok = true;
    const res = await PATCH(req({ status: "enviada" }), ctx("p1"));
    const corpo = (await res.json()) as { id: string; pedido?: { status: string } };
    expect(corpo.id).toBe("p1");
    expect(corpo.pedido?.status).toBe("cotado");
  });

  /**
   * A regra 1 da máquina de estados, vista daqui: reenviar o documento de um
   * casamento já ganho não o devolve a «Proposta enviada».
   */
  it("nunca faz o pedido andar para trás", async () => {
    authed.ok = true;
    pedido.actual = { id: "q1", status: "aceite", activityLog: [] };
    const res = await PATCH(req({ status: "enviada" }), ctx("p1"));
    expect(pedido.actual.status).toBe("aceite");
    expect(pedido.actual.activityLog).toHaveLength(0);
    // Sem transição não há `pedido` na resposta: não houve nada a contar.
    expect((await res.json()).pedido).toBeUndefined();
  });

  /**
   * A regra 3: `rejeitado` é uma decisão de uma pessoa. Uma proposta recusada
   * pode ser renegociada, e dar o pedido por perdido em nome dela tirava-o da
   * lista onde ela ainda ia atrás dele.
   */
  it("recusar a proposta NÃO dá o pedido por perdido", async () => {
    authed.ok = true;
    await PATCH(req({ status: "rejeitada" }), ctx("p1"));
    expect(quotes.updateWith).not.toHaveBeenCalled();
    expect(pedido.actual.status).toBe("pendente");
  });

  it("um PATCH que não mexe no estado não toca no pedido", async () => {
    authed.ok = true;
    await PATCH(req({ followUpAt: "2026-09-01" }), ctx("p1"));
    expect(quotes.updateWith).not.toHaveBeenCalled();
  });

  /**
   * A proposta JÁ ficou gravada. Devolver 500 aqui fazia o ecrã dizer que o
   * gesto falhou sobre uma escrita que passou — e o gesto seguinte dela é
   * repeti-lo.
   */
  it("se o pedido não gravar, o PATCH não falha — a proposta já lá está", async () => {
    authed.ok = true;
    quotes.updateWith.mockRejectedValueOnce(new Error("db down"));
    const res = await PATCH(req({ status: "enviada" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect((await res.json()).pedido).toBeUndefined();
  });

  it("uma proposta sem pedido associado não rebenta", async () => {
    authed.ok = true;
    store.update.mockResolvedValueOnce({ id: "p1", status: "enviada" });
    const res = await PATCH(req({ status: "enviada" }), ctx("p1"));
    expect(res.status).toBe(200);
    expect(quotes.updateWith).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/propostas/[id]", () => {
  it("rejects the unauthenticated with 401 and never deletes", async () => {
    const res = await DELETE(delReq(), ctx("p1"));
    expect(res.status).toBe(401);
    expect(store.remove).not.toHaveBeenCalled();
  });

  it("deletes the proposal for an authenticated admin", async () => {
    authed.ok = true;
    const res = await DELETE(delReq(), ctx("p1"));
    expect(res.status).toBe(200);
    expect(store.remove).toHaveBeenCalledWith("p1");
  });

  it("returns 500 when the store throws", async () => {
    authed.ok = true;
    store.remove.mockRejectedValueOnce(new Error("db down"));
    const res = await DELETE(delReq(), ctx("p1"));
    expect(res.status).toBe(500);
  });
});
