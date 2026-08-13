import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * "CRIAR A PARTIR DE…" e a inserção de um bloco de modelo. O que se prova aqui
 * é o guarda do ramo das FOTOS: a lista vem do cliente e ia direita ao
 * `duplicarFotosParaPedido` sem tecto nem forma — as rotas comparáveis
 * (`/api/temas/[id]/imagens/copiar`, o etiquetar da biblioteca) limitam o lote
 * e validam o caminho, e esta passou a fazer o mesmo.
 */
const st = vi.hoisted(() => ({
  authed: true,
  duplicar: vi.fn(async (caminhos: readonly string[], destino: string) => {
    return new Map(caminhos.map((p) => [p, `${destino}/copia-${p.replace(/\W/g, "")}.jpg`]));
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/proposals-store", () => ({ getProposal: vi.fn(async () => null) }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: vi.fn(async (id: string) => ({ id })) }));
vi.mock("@/lib/proposal-templates", () => ({ listarModelos: vi.fn(async () => []) }));
vi.mock("@/lib/proposal-copy", () => ({
  copiarParaPedido: vi.fn(() => ({ doc: {}, camposAMudar: [], fotosParaRecopiar: [] })),
  trocarFotos: vi.fn((doc: unknown) => doc),
}));
vi.mock("@/lib/proposal-storage", () => ({ duplicarFotosParaPedido: st.duplicar }));

import { POST } from "./route";

function req(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/propostas/copiar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  st.authed = true;
  vi.clearAllMocks();
});

describe("POST /api/propostas/copiar — as fotos", () => {
  it("sem sessão de admin não copia nada", async () => {
    st.authed = false;
    const res = await POST(req({ quoteId: "q-2", fotos: ["q-1/a.jpg"] }));
    expect(res.status).toBe(401);
    expect(st.duplicar).not.toHaveBeenCalled();
  });

  it("copia as fotos bem formadas e devolve o mapa", async () => {
    const res = await POST(req({ quoteId: "q-2", fotos: ["q-1/a.jpg", "q-1/b.png"] }));
    expect(res.status).toBe(200);
    expect(st.duplicar).toHaveBeenCalledWith(["q-1/a.jpg", "q-1/b.png"], "q-2");
    expect((await res.json()).fotosCopiadas).toBe(2);
  });

  it("recusa um lote acima do tecto em vez de o cortar em silêncio", async () => {
    const muitas = Array.from({ length: 200 }, (_, i) => `q-1/foto-${i}.jpg`);
    const res = await POST(req({ quoteId: "q-2", fotos: muitas }));
    expect(res.status).toBe(400);
    expect(st.duplicar).not.toHaveBeenCalled();
  });

  it("um caminho mal formado nunca chega ao Storage", async () => {
    const res = await POST(
      req({
        quoteId: "q-2",
        fotos: ["../../etc/passwd", "q-1/a.jpg?x=1", "q-1/a.exe", "sem-barra.jpg", 42, null],
      }),
    );
    expect(res.status).toBe(400);
    expect(st.duplicar).not.toHaveBeenCalled();
  });

  it("os caminhos válidos passam, os inválidos ficam de fora do mesmo pedido", async () => {
    const res = await POST(
      req({ quoteId: "q-2", fotos: ["q-1/a.jpg", "../../etc/passwd", "q-1/a.jpg"] }),
    );
    expect(res.status).toBe(200);
    // Sem repetidos, e sem o que não tem forma de caminho.
    expect(st.duplicar).toHaveBeenCalledWith(["q-1/a.jpg"], "q-2");
  });
});
