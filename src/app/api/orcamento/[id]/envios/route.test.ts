import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ ok: true }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => auth.ok }));
vi.mock("@/lib/envios-de-proposta", () => ({
  listarEnvios: vi.fn(async () => [{ para: "teste@exemplo.pt", assunto: "TESTE", texto: "Olá" }]),
}));

import { GET } from "./route";

describe("GET /api/orcamento/[id]/envios — as cópias dos emails", () => {
  it("devolve as cópias guardadas do pedido", async () => {
    const res = await GET(new Request("https://liquen.test/x") as unknown as NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect((await res.json()).envios).toHaveLength(1);
  });

  it("sem sessão, 401", async () => {
    auth.ok = false;
    const res = await GET(new Request("https://liquen.test/x") as unknown as NextRequest, {
      params: Promise.resolve({ id: "q1" }),
    });
    expect(res.status).toBe(401);
    auth.ok = true;
  });
});
