import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Importar fotos da biblioteca de temas para uma proposta ────────────────
// O foco: o guarda de admin, o 503 sem Storage, e sobretudo a validação dos
// caminhos — só caminhos do bucket de TEMAS podem ser lidos, para que um
// caminho vindo do cliente nunca alcance outro bucket nem outra pasta.
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  bytes: vi.fn(async (_path: string): Promise<Buffer | null> => Buffer.from("foto")),
  upload: vi.fn(async (id: string) => ({ path: `${id}/copia.jpg`, url: "https://signed/copia" })),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/proposal-storage", () => ({ uploadProposalImage: st.upload }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/theme-storage", async () => {
  // As funções puras de caminho são as reais (é o que estamos a testar); só o
  // acesso ao Storage é substituído.
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return { ...real, fetchThemeImageBytes: st.bytes };
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
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/assets/importar", () => {
  it("rejeita quem não está autenticado e nunca lê o Storage", async () => {
    st.authed = false;
    const res = await POST(...req(["t-1/a.jpg"]));
    expect(res.status).toBe(401);
    expect(st.bytes).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...req(["t-1/a.jpg"]))).status).toBe(503);
    expect(st.bytes).not.toHaveBeenCalled();
  });

  it("copia cada foto do tema para a pasta da proposta", async () => {
    const res = await POST(...req(["t-1/a.jpg", "t-1/b.png"], "q-42"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.images).toHaveLength(2);
    expect(st.bytes).toHaveBeenCalledWith("t-1/a.jpg");
    // O content-type é derivado da extensão, para o ficheiro copiado nascer certo.
    expect(st.upload).toHaveBeenCalledWith("q-42", expect.any(Buffer), "image/jpeg");
    expect(st.upload).toHaveBeenCalledWith("q-42", expect.any(Buffer), "image/png");
  });

  it("recusa uma lista vazia ou em falta", async () => {
    expect((await POST(...req([]))).status).toBe(400);
    expect((await POST(...req(undefined))).status).toBe(400);
    expect((await POST(...req("t-1/a.jpg"))).status).toBe(400);
    expect(st.bytes).not.toHaveBeenCalled();
  });

  it("recusa caminhos com travessia de diretórios ou URLs, sem tocar no Storage", async () => {
    const res = await POST(
      ...req(["../proposal-assets/q-9/privada.jpg", "https://exemplo.pt/a.jpg", "/etc/passwd"]),
    );
    expect(res.status).toBe(400);
    expect(st.bytes).not.toHaveBeenCalled();
  });

  it("ignora os caminhos inválidos de um lote misto e importa os bons", async () => {
    const res = await POST(...req(["t-1/a.jpg", "../fora.jpg"]));
    expect(res.status).toBe(200);
    expect(st.bytes).toHaveBeenCalledTimes(1);
    expect(st.bytes).toHaveBeenCalledWith("t-1/a.jpg");
  });

  it("limita o lote a 40 imagens", async () => {
    const many = Array.from({ length: 41 }, (_, i) => `t-1/f${i}.jpg`);
    expect((await POST(...req(many))).status).toBe(400);
    expect(st.bytes).not.toHaveBeenCalled();
  });

  it("reporta sucesso parcial com honestidade quando uma foto falha", async () => {
    st.bytes.mockResolvedValueOnce(null);
    const res = await POST(...req(["t-1/a.jpg", "t-1/b.jpg"]));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.images).toHaveLength(1);
    expect(body.requested).toBe(2);
  });

  it("devolve 502 quando nenhuma foto pôde ser importada", async () => {
    st.bytes.mockResolvedValueOnce(null);
    const res = await POST(...req(["t-1/a.jpg"]));
    expect(res.status).toBe(502);
  });
});
