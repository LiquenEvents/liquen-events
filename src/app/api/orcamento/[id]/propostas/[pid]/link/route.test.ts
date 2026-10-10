import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const corte = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (pid: string) =>
    pid === "enviada"
      ? { id: "enviada", quoteId: "q1", sentAt: "2026-10-01T10:00:00Z" }
      : pid === "rascunho"
        ? { id: "rascunho", quoteId: "q1" }
        : null,
  ),
}));
vi.mock("@/lib/proposta-link-curto", () => ({
  enderecoDaProposta: vi.fn(async () => "https://liquen.test/proposta/ABC"),
}));
vi.mock("@/lib/links-cortados", () => ({ corteDoPedido: vi.fn(async () => corte.valor) }));

import { GET } from "./route";

const pedir = async (id: string, pid: string) => {
  const res = await GET(new Request("https://liquen.test/x") as unknown as NextRequest, {
    params: Promise.resolve({ id, pid }),
  });
  return { status: res.status, corpo: await res.json() };
};

describe("GET /api/orcamento/[id]/propostas/[pid]/link — o link do casal", () => {
  it("devolve o link de uma proposta que seguiu", async () => {
    const r = await pedir("q1", "enviada");
    expect(r).toEqual({
      status: 200,
      corpo: { ok: true, url: "https://liquen.test/proposta/ABC", cortado: false },
    });
  });

  it("diz quando os links do pedido foram cortados", async () => {
    corte.valor = { cortadoEm: "2026-10-02T10:00:00Z" };
    expect((await pedir("q1", "enviada")).corpo.cortado).toBe(true);
    corte.valor = null;
  });

  it("uma por enviar não tem link (409), e uma de outro pedido não existe (404)", async () => {
    expect((await pedir("q1", "rascunho")).status).toBe(409);
    expect((await pedir("q2", "enviada")).status).toBe(404);
  });
});
