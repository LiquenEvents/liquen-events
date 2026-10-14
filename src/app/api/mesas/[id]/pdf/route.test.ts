import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rota do PDF do mapa de mesas: só com sessão; um pedido sem mesas não dá
 * folha nenhuma (409, com a frase); e o «Imprimir» (`?ver=1`) abre-o no
 * separador em vez de o descarregar.
 */

const estado = vi.hoisted(() => ({
  authed: true,
  pedido: { id: "q1", name: "TESTE Ana" } as { id: string; name: string } | null,
  pdf: { bytes: new Uint8Array([37, 80, 68, 70]), ficheiro: "mapa-de-mesas-teste-ana.pdf" } as {
    bytes: Uint8Array;
    ficheiro: string;
  } | null,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => estado.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: vi.fn(async () => estado.pedido) }));
vi.mock("@/lib/orcamento/mapa-de-mesas-pdf", () => ({ pdfDoMapa: vi.fn(async () => estado.pdf) }));

const { GET } = await import("./route");

const pedir = (url = "https://liquen.test/api/mesas/q1/pdf") =>
  GET(new Request(url) as unknown as NextRequest, { params: Promise.resolve({ id: "q1" }) });

beforeEach(() => {
  estado.authed = true;
  estado.pedido = { id: "q1", name: "TESTE Ana" };
  estado.pdf = { bytes: new Uint8Array([37, 80, 68, 70]), ficheiro: "mapa-de-mesas-teste-ana.pdf" };
});

describe("GET /api/mesas/[id]/pdf", () => {
  it("sem sessão, 401", async () => {
    estado.authed = false;
    expect((await pedir()).status).toBe(401);
  });

  it("pedido que não existe, 404", async () => {
    estado.pedido = null;
    expect((await pedir()).status).toBe(404);
  });

  it("um mapa sem mesas não dá folha: 409 com a razão", async () => {
    estado.pdf = null;
    const r = await pedir();
    expect(r.status).toBe(409);
    expect((await r.json()).error).toMatch(/ainda não tem mesas/);
  });

  it("descarrega por omissão, com o nome limpo, o tamanho e sem cache", async () => {
    const r = await pedir();
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Type")).toBe("application/pdf");
    expect(r.headers.get("Content-Disposition")).toBe(
      'attachment; filename="mapa-de-mesas-teste-ana.pdf"',
    );
    expect(r.headers.get("Content-Length")).toBe("4");
    expect(r.headers.get("Cache-Control")).toBe("no-store");
  });

  it("«Imprimir» (?ver=1) abre-o no separador", async () => {
    const r = await pedir("https://liquen.test/api/mesas/q1/pdf?ver=1");
    expect(r.headers.get("Content-Disposition")).toMatch(/^inline;/);
  });
});
