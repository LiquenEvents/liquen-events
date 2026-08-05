import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Importar fotos da biblioteca de temas para uma proposta ────────────────
// O foco DESTA rota: o guarda de admin, o 503 sem Storage, a validação dos
// caminhos — só caminhos do bucket de TEMAS entram, e nada toca no Storage
// antes disso —, o tecto do lote, e a honestidade do relatório (sucesso
// parcial, e 502 quando não entrou nada).
//
// A importação em si — as cópias, a ORDEM pedida, o tecto de concorrência e as
// duas assinaturas em lote — é propriedade de `importarFotosDaBiblioteca` e
// está testada em `src/lib/theme-storage.test.ts`. Aqui é um duplo do LOTE
// inteiro, que é a forma como a rota a usa.
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  /** Caminhos de tema cuja cópia falha. */
  fails: new Set<string>(),
  /** Atraso (ms) por caminho, para terminarem fora da ordem pedida. */
  delays: {} as Record<string, number>,
  inFlight: 0,
  peak: 0,
  bucket: vi.fn(async () => true),
  /** Duplo do LOTE: recebe todos os caminhos e devolve o que entrou e o que
   *  falhou, preservando a ordem — tal como a função verdadeira. */
  importar: vi.fn(async (themePaths: readonly string[], quoteId: string) => {
    const entraram = themePaths.filter((p) => !st.fails.has(p));
    return {
      images: entraram.map((p) => {
        const name = p.slice(p.indexOf("/") + 1);
        return { path: `${quoteId}/copia-de-${name}`, url: `https://signed/${name}` };
      }),
      failed: themePaths.filter((p) => st.fails.has(p)),
    };
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/proposal-storage", () => ({ ensureBucket: st.bucket }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/theme-storage", async () => {
  // As funções puras de caminho são as reais (é o que estamos a testar); só o
  // acesso ao Storage é substituído.
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return { ...real, importarFotosDaBiblioteca: st.importar };
});

import { POST } from "./route";

function req(paths: unknown, id = "q-1"): [NextRequest, { params: Promise<{ id: string }> }] {
  const r = new Request(`https://liquen.test/api/orcamento/${id}/assets/importar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ paths }),
  }) as unknown as NextRequest;
  return [r, { params: Promise.resolve({ id }) }];
}

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.fails = new Set();
  st.delays = {};
  st.inFlight = 0;
  st.peak = 0;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/assets/importar", () => {
  it("rejeita quem não está autenticado e nunca lê o Storage", async () => {
    st.authed = false;
    const res = await POST(...req(["t-1/a.jpg"]));
    expect(res.status).toBe(401);
    expect(st.importar).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...req(["t-1/a.jpg"]))).status).toBe(503);
    expect(st.importar).not.toHaveBeenCalled();
  });

  it("copia cada foto do tema para a pasta da proposta", async () => {
    const res = await POST(...req(["t-1/a.jpg", "t-1/b.png"], "q-42"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.images).toHaveLength(2);
    expect(body.failed).toEqual([]);
    // UM pedido para o lote todo, com o id do pedido — e não um por foto.
    expect(st.importar).toHaveBeenCalledTimes(1);
    expect(st.importar).toHaveBeenCalledWith(["t-1/a.jpg", "t-1/b.png"], "q-42");
  });

  it("recusa uma lista vazia ou em falta", async () => {
    expect((await POST(...req([]))).status).toBe(400);
    expect((await POST(...req(undefined))).status).toBe(400);
    expect((await POST(...req("t-1/a.jpg"))).status).toBe(400);
    expect(st.importar).not.toHaveBeenCalled();
  });

  it("recusa caminhos com travessia de diretórios ou URLs, sem tocar no Storage", async () => {
    const res = await POST(
      ...req(["../proposal-assets/q-9/privada.jpg", "https://exemplo.pt/a.jpg", "/etc/passwd"]),
    );
    expect(res.status).toBe(400);
    expect(st.importar).not.toHaveBeenCalled();
    expect(st.bucket).not.toHaveBeenCalled();
  });

  it("ignora os caminhos inválidos de um lote misto e importa os bons", async () => {
    const res = await POST(...req(["t-1/a.jpg", "../fora.jpg"]));
    expect(res.status).toBe(200);
    expect(st.importar).toHaveBeenCalledWith(["t-1/a.jpg"], "q-1");
  });

  it("limita o lote a 40 imagens", async () => {
    const many = Array.from({ length: 41 }, (_, i) => `t-1/f${i}.jpg`);
    expect((await POST(...req(many))).status).toBe(400);
    expect(st.importar).not.toHaveBeenCalled();
  });

  it("reporta sucesso parcial com honestidade quando uma foto falha", async () => {
    st.fails.add("t-1/a.jpg");
    const res = await POST(...req(["t-1/a.jpg", "t-1/b.jpg"]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images).toHaveLength(1);
    expect(body.requested).toBe(2);
    expect(body.failed).toEqual(["t-1/a.jpg"]);
  });

  it("devolve 502 quando nenhuma foto pôde ser importada", async () => {
    st.fails.add("t-1/a.jpg");
    const res = await POST(...req(["t-1/a.jpg"]));
    expect(res.status).toBe(502);
  });
});
