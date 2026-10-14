import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const m = vi.hoisted(() => ({
  pedido: vi.fn(async (): Promise<Record<string, unknown> | null> => ({ id: "q1" })),
  propostas: vi.fn(
    async (): Promise<Record<string, unknown>[]> => [
      { id: "p-velha", status: "enviada", createdAt: "2026-08-01" },
      { id: "p-aceite", status: "aceite", createdAt: "2026-07-01", respondedAt: "2026-09-01" },
    ],
  ),
  nascer: vi.fn(
    async (): Promise<{ created: boolean; contract: Record<string, unknown> }> => ({
      created: true,
      contract: { id: "c1" },
    }),
  ),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: m.pedido }));
vi.mock("@/lib/proposals-store", () => ({ listProposalsForQuote: m.propostas }));
vi.mock("@/lib/contrato-do-ganho", () => ({ nascerContratoDoGanho: m.nascer }));

import { POST } from "./route";

const req = (body: unknown) =>
  new Request("https://liquen.test/api/contratos/criar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/contratos/criar — o botão «Criar contrato»", () => {
  it("sem sessão, 401 e não cria nada", async () => {
    const res = await POST(req({ quoteId: "q1" }));
    expect(res.status).toBe(401);
    expect(m.nascer).not.toHaveBeenCalled();
  });

  it("cria o contrato a partir da proposta ACEITE do pedido", async () => {
    authed.ok = true;
    const res = await POST(req({ quoteId: "q1" }));
    expect(res.status).toBe(200);
    expect(m.nascer).toHaveBeenCalledWith("q1", expect.objectContaining({ id: "p-aceite" }));
  });

  it("sem proposta não há termos a registar: 409", async () => {
    authed.ok = true;
    m.propostas.mockResolvedValueOnce([]);
    const res = await POST(req({ quoteId: "q1" }));
    expect(res.status).toBe(409);
    expect(m.nascer).not.toHaveBeenCalled();
  });

  it("pedido que não existe: 404; corpo sem pedido: 400", async () => {
    authed.ok = true;
    m.pedido.mockResolvedValueOnce(null);
    expect((await POST(req({ quoteId: "q9" }))).status).toBe(404);
    expect((await POST(req({}))).status).toBe(400);
  });
});
