import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";
import { MAX_DUPLICATE_CHECK } from "@/lib/theme-types";

/**
 * PRÉ-VERIFICAÇÃO DE REPETIDAS.
 *
 * O que aqui se fixa é o que separa "poupar 195 MB" de "fazer desaparecer uma
 * foto boa": a rota só responde "já lá está" quando LEU mesmo a pasta, nunca
 * devolve o índice todo, e um índice truncado sai marcado como tal para a UI
 * não anunciar poupanças que não pode garantir.
 */
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  index: {
    hashes: new Set<string>(),
    md5s: new Map<string, string>(),
    ok: true,
    complete: true,
    legacy: false,
  },
  throws: false,
  read: vi.fn(async () => {
    if (st.throws) throw new Error("boom");
    return st.index;
  }),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  getTheme: vi.fn(async (id: string) => st.themes.find((t) => t.id === id) ?? null),
}));
vi.mock("@/lib/theme-storage", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return { ...real, readThemeFingerprints: st.read };
});

import { POST } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function req(body: unknown, id = "t-1"): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}/repetidas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return [r, { params: Promise.resolve({ id }) }];
}

const A = "0123456789abcdef0123456789abcdef";
const B = "fedcba9876543210fedcba9876543210";
const C = "11111111222222223333333344444444";

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.themes = [
    {
      id: "t-1",
      name: "Terracotta",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  st.index = {
    hashes: new Set([A, B]),
    md5s: new Map(),
    ok: true,
    complete: true,
    legacy: false,
  };
  st.throws = false;
  vi.clearAllMocks();
});

describe("POST /api/temas/[id]/repetidas", () => {
  it("rejeita quem não está autenticado e nunca lê a pasta", async () => {
    st.authed = false;
    expect((await POST(...req({ hashes: [A] }))).status).toBe(401);
    expect(st.read).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...req({ hashes: [A] }))).status).toBe(503);
    expect(st.read).not.toHaveBeenCalled();
  });

  it("404 para um tema que não existe", async () => {
    expect((await POST(...req({ hashes: [A] }, "t-9"))).status).toBe(404);
    expect(st.read).not.toHaveBeenCalled();
  });

  it("diz QUAIS já estão no tema — e mais nada", async () => {
    const res = await POST(...req({ hashes: [A, C, B] }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.known).toEqual([A, B]);
    expect(body.complete).toBe(true);
    // NUNCA o índice todo: 4000 resumos por arrasto não fazem sentido, e a
    // lógica da pasta tem de ficar do lado do servidor.
    expect(Object.keys(body)).not.toContain("hashes");
  });

  it("nenhuma conhecida devolve uma lista vazia, não um erro", async () => {
    const body = await (await POST(...req({ hashes: [C] }))).json();
    expect(body.known).toEqual([]);
  });

  it("descarta silenciosamente o que não é um resumo bem formado", async () => {
    const body = await (await POST(...req({ hashes: ["../../etc/passwd", 42, null, A] }))).json();
    expect(body.known).toEqual([A]);
  });

  it("uma pasta ILEGÍVEL responde 'não se pôde verificar', não 'não há repetidas'", async () => {
    // A diferença é tudo: com `read: false` o cliente sobe tudo e não anuncia
    // poupança nenhuma; com uma lista vazia diria "verifiquei, nenhuma".
    st.index = { ...st.index, ok: false };
    const body = await (await POST(...req({ hashes: [A] }))).json();
    expect(body).toEqual({ ok: true, known: [], complete: false, legacy: false, read: false });
  });

  it("um índice TRUNCADO sai marcado — a UI não pode prometer o número", async () => {
    st.index = { ...st.index, complete: false };
    const body = await (await POST(...req({ hashes: [A] }))).json();
    expect(body.known).toEqual([A]);
    expect(body.complete).toBe(false);
  });

  it("assinala a biblioteca antiga, para a UI o poder dizer uma vez", async () => {
    st.index = { ...st.index, legacy: true };
    expect((await (await POST(...req({ hashes: [A] }))).json()).legacy).toBe(true);
  });

  it("recusa acima do teto por pedido", async () => {
    const many = Array.from({ length: MAX_DUPLICATE_CHECK + 1 }, () => A);
    expect((await POST(...req({ hashes: many }))).status).toBe(400);
    expect(st.read).not.toHaveBeenCalled();
  });

  it("400 sem resumos nenhuns", async () => {
    expect((await POST(...req({ hashes: [] }))).status).toBe(400);
    expect((await POST(...req({}))).status).toBe(400);
  });

  it("500 tratado (não um throw cru) quando a leitura rebenta", async () => {
    st.throws = true;
    expect((await POST(...req({ hashes: [A] }))).status).toBe(500);
  });
});
