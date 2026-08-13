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
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/proposals-store", () => ({
  updateProposal: store.update,
  deleteProposal: store.remove,
}));

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
