import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(
    async (): Promise<Record<string, unknown>[]> => [
      { id: "c1", status: "aceite", quoteId: "q1", proposalId: "p1", createdAt: "2026-09-01" },
    ],
  ),
  pedidos: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
  propostas: vi.fn(async (): Promise<Record<string, unknown>[]> => []),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/contracts-store", () => ({ listContracts: store.list }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: store.pedidos }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: store.propostas }));

import { GET } from "./route";

function req(): NextRequest {
  return new Request("https://liquen.test/api/contratos", {
    method: "GET",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("GET /api/contratos", () => {
  it("rejects the unauthenticated with 401 and never lists", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
  });

  it("returns the contracts list (read-only audit view) for an admin", async () => {
    authed.ok = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([
      {
        id: "c1",
        status: "aceite",
        quoteId: "q1",
        proposalId: "p1",
        createdAt: "2026-09-01",
        tipo: "contrato",
      },
    ]);
  });

  it("junta os pedidos ganhos que ainda não têm contrato", async () => {
    // «aqui devem estar todas as propostas que nós marcamos como ganhas»
    authed.ok = true;
    store.pedidos.mockResolvedValueOnce([
      { id: "q2", status: "aceite", name: "TESTE Ganho", email: "g@exemplo.pt" },
    ]);
    const itens = (await (await GET(req())).json()) as { tipo: string; quoteId: string }[];
    expect(itens.map((i) => [i.tipo, i.quoteId])).toEqual(
      expect.arrayContaining([
        ["contrato", "q1"],
        ["sem-contrato", "q2"],
      ]),
    );
  });

  it("returns 500 when the store throws", async () => {
    authed.ok = true;
    store.list.mockRejectedValueOnce(new Error("db down"));
    const res = await GET(req());
    expect(res.status).toBe(500);
  });
});
