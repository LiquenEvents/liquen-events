import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * Bilhetes de carregamento direto do ESTÚDIO DE PROPOSTAS. Mesma forma da
 * rota dos temas; o que se prova aqui é o mesmo essencial: admin-only, o
 * caminho é do servidor, e um Storage sem esta capacidade manda o cliente de
 * volta ao multipart em vez de partir.
 */
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  quoteExists: true,
  mint: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => (st.quoteExists ? { id } : null)),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/proposal-storage", () => ({
  createProposalUploadTickets: st.mint,
  confirmProposalUploads: st.confirm,
  UPLOAD_TICKET_TTL: 7200,
  MAX_UPLOAD_TICKETS: 24,
}));

import { POST, PUT } from "./route";

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function call(method: "POST" | "PUT", id: string, payload: unknown): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/orcamento/${id}/assets/url`, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return [r as unknown as NextRequest, ctx(id)];
}

beforeEach(() => {
  vi.clearAllMocks();
  st.authed = true;
  st.dbConfigured = true;
  st.quoteExists = true;
  st.mint.mockImplementation(async (id: string, types: string[]) =>
    types.map((_, i) => ({
      path: `${id}/uuid-${i}.jpg`,
      uploadUrl: "https://up/o",
      token: "tok",
    })),
  );
  st.confirm.mockResolvedValue({ images: [], rejected: [] });
});

describe("POST — emitir bilhetes", () => {
  it("sem sessão de admin não emite nada", async () => {
    st.authed = false;
    const res = await POST(...call("POST", "q-1", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(401);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("o caminho sai do servidor, com a pasta deste pedido", async () => {
    const res = await POST(
      ...call("POST", "q-1", {
        contentTypes: ["image/jpeg"],
        path: "q-999/roubada.jpg", // ignorado
      }),
    );
    const body = await res.json();

    expect(st.mint).toHaveBeenCalledWith("q-1", ["image/jpeg"]);
    expect(body.tickets[0].path).toBe("q-1/uuid-0.jpg");
    expect(body.expiresInSeconds).toBe(7200);
  });

  it("recusa formatos que não servem", async () => {
    const res = await POST(...call("POST", "q-1", { contentTypes: ["text/html"] }));

    expect(res.status).toBe(415);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("recusa um lote acima do teto", async () => {
    const res = await POST(
      ...call("POST", "q-1", { contentTypes: Array.from({ length: 50 }, () => "image/jpeg") }),
    );

    expect(res.status).toBe(400);
  });

  it("um pedido que não existe não ganha pasta no bucket → 404", async () => {
    st.quoteExists = false;
    const res = await POST(...call("POST", "q-inventado", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(404);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("Storage sem esta capacidade → 503 a apontar para o multipart", async () => {
    st.mint.mockResolvedValue(null);
    const res = await POST(...call("POST", "q-1", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(503);
    expect((await res.json()).fallback).toBe("multipart");
  });
});

describe("PUT — confirmar", () => {
  it("sem sessão de admin não confirma nada", async () => {
    st.authed = false;
    const res = await PUT(...call("PUT", "q-1", { paths: ["q-1/a.jpg"] }));

    expect(res.status).toBe(401);
    expect(st.confirm).not.toHaveBeenCalled();
  });

  it("passa os caminhos ao guarda com o id do pedido", async () => {
    st.confirm.mockResolvedValue({
      images: [{ path: "q-1/a.jpg", url: "https://signed/a" }],
      rejected: ["q-2/b.jpg"],
    });
    const res = await PUT(...call("PUT", "q-1", { paths: ["q-1/a.jpg", "q-2/b.jpg"] }));
    const body = await res.json();

    expect(st.confirm).toHaveBeenCalledWith("q-1", ["q-1/a.jpg", "q-2/b.jpg"]);
    expect(body.rejected).toEqual(["q-2/b.jpg"]);
  });

  it("uma lista vazia é 400", async () => {
    const res = await PUT(...call("PUT", "q-1", { paths: [] }));

    expect(res.status).toBe(400);
  });
});
