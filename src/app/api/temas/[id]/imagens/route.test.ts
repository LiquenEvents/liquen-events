import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

// ── Fotos de um tema ───────────────────────────────────────────────────────
// Duas coisas a fixar aqui: o caminho que chega do cliente NUNCA pode sair da
// pasta deste tema, e uma avaria (base de dados / Storage) tem de sair como
// 503/500 tratado — nunca como uma exceção crua, e nunca a disfarçar um 404
// legítimo de "tema não encontrado".
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  throwOnGet: false,
  list: vi.fn(async () => [{ path: "t-1/a.jpg", url: "https://signed/a" }]),
  del: vi.fn(async () => true),
  upload: vi.fn(async (id: string) => ({ path: `${id}/nova.jpg`, url: "https://signed/nova" })),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/themes-store", () => ({
  getTheme: vi.fn(async (id: string) => {
    if (st.throwOnGet) throw new Error("db down");
    return st.themes.find((t) => t.id === id) ?? null;
  }),
}));
vi.mock("@/lib/theme-storage", async () => {
  // As funções puras de caminho são as reais (é o guarda que estamos a testar).
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    listThemeImages: st.list,
    deleteThemeImage: st.del,
    uploadThemeImage: st.upload,
  };
});

import { GET, POST, DELETE } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function ctx(id: string): Ctx {
  return { params: Promise.resolve({ id }) };
}

function get(id = "t-1"): [NextRequest, Ctx] {
  const url = new URL(`https://liquen.test/api/temas/${id}/imagens`);
  return [{ nextUrl: url, url: url.toString() } as unknown as NextRequest, ctx(id)];
}

function del(path: string, id = "t-1"): [NextRequest, Ctx] {
  const url = new URL(`https://liquen.test/api/temas/${id}/imagens`);
  url.searchParams.set("path", path);
  return [{ nextUrl: url, url: url.toString() } as unknown as NextRequest, ctx(id)];
}

function post(files: File[], id = "t-1"): [NextRequest, Ctx] {
  const form = new FormData();
  for (const f of files) form.append("files", f);
  const r = new Request(`https://liquen.test/api/temas/${id}/imagens`, {
    method: "POST",
    body: form,
  }) as unknown as NextRequest;
  return [r, ctx(id)];
}

const jpg = (name = "foto.jpg", bytes = 10) =>
  new File([new Uint8Array(bytes)], name, { type: "image/jpeg" });

beforeEach(() => {
  st.authed = true;
  st.dbConfigured = true;
  st.throwOnGet = false;
  st.themes = [
    {
      id: "t-1",
      name: "Terracotta",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  vi.clearAllMocks();
});

describe("GET /api/temas/[id]/imagens", () => {
  it("rejeita quem não está autenticado e nunca lê o Storage", async () => {
    st.authed = false;
    expect((await GET(...get())).status).toBe(401);
    expect(st.list).not.toHaveBeenCalled();
  });

  it("devolve as fotos do tema", async () => {
    const res = await GET(...get());
    expect(res.status).toBe(200);
    expect((await res.json()).images).toHaveLength(1);
  });

  it("devolve 404 para um tema que não existe", async () => {
    expect((await GET(...get("t-9"))).status).toBe(404);
    expect(st.list).not.toHaveBeenCalled();
  });

  it("devolve 503 (não 500) quando o Storage nem sequer está configurado", async () => {
    st.throwOnGet = true;
    st.dbConfigured = false;
    const res = await GET(...get());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Armazenamento indisponível.");
  });

  it("devolve 500 tratado (não um throw cru) quando a leitura rebenta", async () => {
    st.list.mockRejectedValueOnce(new Error("boom"));
    expect((await GET(...get())).status).toBe(500);
  });
});

describe("DELETE /api/temas/[id]/imagens", () => {
  it("rejeita quem não está autenticado e nunca apaga", async () => {
    st.authed = false;
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(401);
    expect(st.del).not.toHaveBeenCalled();
  });

  it("remove uma foto da pasta deste tema", async () => {
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(200);
    expect(st.del).toHaveBeenCalledWith("t-1/a.jpg");
  });

  it("recusa caminhos de OUTRO tema, travessias e URLs — sem tocar no Storage", async () => {
    expect((await DELETE(...del("t-2/a.jpg"))).status).toBe(400);
    expect((await DELETE(...del("../proposal-assets/q-1/privada.jpg"))).status).toBe(400);
    expect((await DELETE(...del("https://exemplo.pt/a.jpg"))).status).toBe(400);
    expect((await DELETE(...del(""))).status).toBe(400);
    expect(st.del).not.toHaveBeenCalled();
  });

  it("devolve 502 quando o Storage não confirma a remoção", async () => {
    st.del.mockResolvedValueOnce(false);
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(502);
  });

  it("devolve 500 tratado (não um throw cru) quando a remoção rebenta", async () => {
    st.del.mockRejectedValueOnce(new Error("boom"));
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(500);
  });

  it("devolve 503 quando o Storage nem sequer está configurado", async () => {
    st.dbConfigured = false;
    st.del.mockRejectedValueOnce(new Error("boom"));
    expect((await DELETE(...del("t-1/a.jpg"))).status).toBe(503);
  });
});

describe("POST /api/temas/[id]/imagens", () => {
  it("rejeita quem não está autenticado e nunca escreve", async () => {
    st.authed = false;
    expect((await POST(...post([jpg()]))).status).toBe(401);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("devolve 503 quando o Storage não está configurado", async () => {
    st.dbConfigured = false;
    expect((await POST(...post([jpg()]))).status).toBe(503);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("devolve 404 para um tema que não existe", async () => {
    expect((await POST(...post([jpg()], "t-9"))).status).toBe(404);
  });

  it("recusa um formato não suportado", async () => {
    const gif = new File([new Uint8Array(4)], "a.gif", { type: "image/gif" });
    expect((await POST(...post([gif]))).status).toBe(415);
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("carrega as fotos recebidas", async () => {
    const res = await POST(...post([jpg(), jpg("outra.jpg")]));
    expect(res.status).toBe(200);
    expect((await res.json()).images).toHaveLength(2);
  });
});
