import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Importar fotos da biblioteca de temas para uma proposta ────────────────
// O foco: o guarda de admin, o 503 sem Storage, a validação dos caminhos — só
// caminhos do bucket de TEMAS podem ser copiados, e nada toca no Storage antes
// disso — e a ORDEM: o lote é copiado em paralelo, mas a ordem por que a
// Catarina tocou nas fotos é a ordem por que elas saem no PDF.
//
// A cópia em si (dentro do Storage, com recurso a descarregar+carregar quando
// o Storage a recusa) é testada em `src/lib/theme-storage.test.ts`; aqui ela é
// um duplo, para podermos encenar falhas e atrasos.
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
  copy: vi.fn(async (themePath: string, quoteId: string) => {
    st.inFlight++;
    st.peak = Math.max(st.peak, st.inFlight);
    await new Promise((r) => setTimeout(r, st.delays[themePath] ?? 0));
    st.inFlight--;
    if (st.fails.has(themePath)) return null;
    const name = themePath.slice(themePath.indexOf("/") + 1);
    return { path: `${quoteId}/copia-de-${name}`, url: `https://signed/${name}` };
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
  return { ...real, copyThemeImageToProposal: st.copy };
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
    expect(st.copy).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...req(["t-1/a.jpg"]))).status).toBe(503);
    expect(st.copy).not.toHaveBeenCalled();
  });

  it("copia cada foto do tema para a pasta da proposta", async () => {
    const res = await POST(...req(["t-1/a.jpg", "t-1/b.png"], "q-42"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.images).toHaveLength(2);
    expect(body.failed).toEqual([]);
    // O destino é construído no servidor a partir do id do pedido.
    expect(st.copy).toHaveBeenCalledWith("t-1/a.jpg", "q-42");
    expect(st.copy).toHaveBeenCalledWith("t-1/b.png", "q-42");
    // Garante o bucket de destino uma vez por lote, não uma vez por foto.
    expect(st.bucket).toHaveBeenCalledTimes(1);
  });

  it("recusa uma lista vazia ou em falta", async () => {
    expect((await POST(...req([]))).status).toBe(400);
    expect((await POST(...req(undefined))).status).toBe(400);
    expect((await POST(...req("t-1/a.jpg"))).status).toBe(400);
    expect(st.copy).not.toHaveBeenCalled();
  });

  it("recusa caminhos com travessia de diretórios ou URLs, sem tocar no Storage", async () => {
    const res = await POST(
      ...req(["../proposal-assets/q-9/privada.jpg", "https://exemplo.pt/a.jpg", "/etc/passwd"]),
    );
    expect(res.status).toBe(400);
    expect(st.copy).not.toHaveBeenCalled();
    expect(st.bucket).not.toHaveBeenCalled();
  });

  it("ignora os caminhos inválidos de um lote misto e importa os bons", async () => {
    const res = await POST(...req(["t-1/a.jpg", "../fora.jpg"]));
    expect(res.status).toBe(200);
    expect(st.copy).toHaveBeenCalledTimes(1);
    expect(st.copy).toHaveBeenCalledWith("t-1/a.jpg", "q-1");
  });

  it("limita o lote a 40 imagens", async () => {
    const many = Array.from({ length: 41 }, (_, i) => `t-1/f${i}.jpg`);
    expect((await POST(...req(many))).status).toBe(400);
    expect(st.copy).not.toHaveBeenCalled();
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

  it("mantém a ordem PEDIDA mesmo com as cópias a terminar ao contrário", async () => {
    const paths = ["t-1/a.jpg", "t-1/b.jpg", "t-1/c.jpg", "t-1/d.jpg"];
    // A primeira é a mais lenta: sem escrita por posição, sairia em último.
    st.delays = { "t-1/a.jpg": 30, "t-1/b.jpg": 20, "t-1/c.jpg": 10, "t-1/d.jpg": 0 };
    const body = await (await POST(...req(paths))).json();
    expect(body.images.map((i: { path: string }) => i.path)).toEqual([
      "q-1/copia-de-a.jpg",
      "q-1/copia-de-b.jpg",
      "q-1/copia-de-c.jpg",
      "q-1/copia-de-d.jpg",
    ]);
  });

  it("mantém a ordem pedida com as falhas pelo meio (sem buracos nem trocas)", async () => {
    const paths = ["t-1/a.jpg", "t-1/b.jpg", "t-1/c.jpg", "t-1/d.jpg"];
    st.fails.add("t-1/b.jpg");
    st.delays = { "t-1/a.jpg": 20, "t-1/c.jpg": 5 };
    const body = await (await POST(...req(paths))).json();
    expect(body.images.map((i: { path: string }) => i.path)).toEqual([
      "q-1/copia-de-a.jpg",
      "q-1/copia-de-c.jpg",
      "q-1/copia-de-d.jpg",
    ]);
    expect(body.requested).toBe(4);
    expect(body.failed).toEqual(["t-1/b.jpg"]);
  });

  it("copia em paralelo, mas com um teto de 5 de cada vez", async () => {
    const paths = Array.from({ length: 12 }, (_, i) => `t-1/f${i}.jpg`);
    for (const p of paths) st.delays[p] = 5;
    await POST(...req(paths));
    expect(st.copy).toHaveBeenCalledTimes(12);
    expect(st.peak).toBe(5);
  });
});
