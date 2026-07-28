import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

// A lista de temas junta a base de dados (metadados) ao Storage (contagem de
// fotos). Mockamos ambos para testar o guarda de admin, a validação do nome, a
// recusa de duplicados e o facto de a contagem vir mesmo da pasta.
const st = vi.hoisted(() => ({
  authed: false,
  throwOnList: false,
  themes: [] as ProposalTheme[],
  images: {} as Record<string, { path: string; url: string }[]>,
  create: vi.fn(async (input: { name: string; notes?: string }) => ({
    id: "t-new",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...input,
  })),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: vi.fn(async () => {
    if (st.throwOnList) throw new Error("db down");
    return st.themes;
  }),
  createTheme: st.create,
}));
vi.mock("@/lib/theme-storage", () => ({
  listThemeImages: vi.fn(async (id: string) => st.images[id] ?? []),
}));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/temas", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const theme = (id: string, name: string): ProposalTheme => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

beforeEach(() => {
  st.authed = false;
  st.throwOnList = false;
  st.themes = [];
  st.images = {};
  vi.clearAllMocks();
});

describe("GET /api/temas", () => {
  it("rejeita quem não está autenticado", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
  });

  it("devolve lista vazia quando ainda não há temas", async () => {
    st.authed = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("junta a contagem de fotos e a capa vindas do Storage", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta"), theme("t-2", "Itália")];
    st.images = {
      "t-1": [
        { path: "t-1/a.jpg", url: "https://signed/a" },
        { path: "t-1/b.jpg", url: "https://signed/b" },
      ],
    };
    const body = await (await GET(req("GET"))).json();
    expect(body[0]).toMatchObject({ id: "t-1", imageCount: 2, coverUrl: "https://signed/a" });
    // Sem Storage / sem fotos o tema aparece à mesma, com zero.
    expect(body[1]).toMatchObject({ id: "t-2", imageCount: 0 });
    expect(body[1].coverUrl).toBeUndefined();
  });

  it("devolve 500 tratado (não um throw cru) quando a base de dados falha", async () => {
    st.authed = true;
    st.throwOnList = true;
    expect((await GET(req("GET"))).status).toBe(500);
  });
});

describe("POST /api/temas", () => {
  it("rejeita quem não está autenticado e nunca escreve", async () => {
    expect((await POST(req("POST", { name: "Itália" }))).status).toBe(401);
    expect(st.create).not.toHaveBeenCalled();
  });

  it("cria um tema com nome e nota", async () => {
    st.authed = true;
    const res = await POST(req("POST", { name: "Itália", notes: "limões, cerâmica" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ name: "Itália", imageCount: 0 });
    expect(st.create).toHaveBeenCalledWith({ name: "Itália", notes: "limões, cerâmica" });
  });

  it("recusa nome vazio ou só com espaços", async () => {
    st.authed = true;
    expect((await POST(req("POST", { name: "" }))).status).toBe(400);
    expect((await POST(req("POST", { name: "   " }))).status).toBe(400);
    expect((await POST(req("POST", {}))).status).toBe(400);
    expect(st.create).not.toHaveBeenCalled();
  });

  it("recusa um nome duplicado (ignorando maiúsculas) com 409", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta")];
    const res = await POST(req("POST", { name: "  terracotta " }));
    expect(res.status).toBe(409);
    expect(st.create).not.toHaveBeenCalled();
  });

  it("corta um nome absurdamente longo em vez de o guardar inteiro", async () => {
    st.authed = true;
    await POST(req("POST", { name: "x".repeat(500) }));
    expect(st.create).toHaveBeenCalledWith(expect.objectContaining({ name: "x".repeat(60) }));
  });

  it("trata JSON malformado como 400, não 500", async () => {
    st.authed = true;
    expect((await POST(req("POST", "{ isto não é json", true))).status).toBe(400);
    expect(st.create).not.toHaveBeenCalled();
  });
});
