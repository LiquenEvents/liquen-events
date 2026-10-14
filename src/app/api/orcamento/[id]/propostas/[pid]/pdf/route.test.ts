import { describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const auth = vi.hoisted(() => ({ ok: true }));
const guardado = vi.hoisted(() => ({ resposta: null as Response | null }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => auth.ok }));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (pid: string) =>
    pid === "p1"
      ? { id: "p1", quoteId: "q1", doc: { clientNames: "TESTE", eventDate: "" }, sentAt: "x" }
      : pid === "sem-doc"
        ? { id: "sem-doc", quoteId: "q1" }
        : null,
  ),
}));
vi.mock("@/lib/pdf-do-armazenamento", () => ({
  pdfGuardadoEmFluxo: vi.fn(async () => guardado.resposta),
}));
vi.mock("@/lib/proposal-pdf-chave", () => ({
  chaveDoPdf: () => "chave",
  PropostaIncompleta: class extends Error {},
}));
vi.mock("@/lib/proposal-pdf-cache", () => ({
  pdfDaPropostaEmCache: vi.fn(async () => Buffer.from("%PDF-1.4 desenhado")),
}));

import { GET } from "./route";

const pedir = (id: string, pid: string) =>
  GET(new Request("https://liquen.test/x") as unknown as NextRequest, {
    params: Promise.resolve({ id, pid }),
  });

describe("GET /api/orcamento/[id]/propostas/[pid]/pdf — o PDF que seguiu", () => {
  it("sem sessão, 401", async () => {
    auth.ok = false;
    expect((await pedir("q1", "p1")).status).toBe(401);
    auth.ok = true;
  });

  it("uma proposta de OUTRO pedido responde 404, como se não existisse", async () => {
    expect((await pedir("q2", "p1")).status).toBe(404);
  });

  it("sem documento guardado não há PDF", async () => {
    expect((await pedir("q1", "sem-doc")).status).toBe(404);
  });

  it("serve o ficheiro guardado no envio, quando está lá", async () => {
    guardado.resposta = new Response("guardado", { status: 200 });
    const res = await pedir("q1", "p1");
    expect(await res.text()).toBe("guardado");
    guardado.resposta = null;
  });

  it("senão desenha-o a partir do documento guardado", async () => {
    const res = await pedir("q1", "p1");
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toMatch(/^inline/);
  });
});
