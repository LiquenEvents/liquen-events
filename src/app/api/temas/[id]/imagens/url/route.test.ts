import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

/**
 * BILHETES DE CARREGAMENTO DIRETO.
 *
 * O que se prova aqui é o que separa esta rota de um buraco de segurança:
 *   · sem sessão de admin não sai bilhete nenhum;
 *   · o caminho NUNCA vem do cliente — ele só diz o tipo do ficheiro;
 *   · um tema que não existe não abre pasta nenhuma no bucket;
 *   · a confirmação não aceita caminhos fora da pasta do tema;
 *   · e quando o Storage não sabe emitir estes URLs, a resposta é um 503 que
 *     diz "usa o multipart" — nunca um erro que pare o estúdio.
 */
const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  tickets: null as unknown,
  mint: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => st.dbConfigured }));
vi.mock("@/lib/themes-store", () => ({
  getTheme: vi.fn(async (id: string) => st.themes.find((t) => t.id === id) ?? null),
}));
vi.mock("@/lib/theme-storage", () => ({
  createThemeUploadTickets: st.mint,
  confirmThemeUploads: st.confirm,
}));

import { POST, PUT } from "./route";

type Ctx = { params: Promise<{ id: string }> };
const ctx = (id: string): Ctx => ({ params: Promise.resolve({ id }) });

function req(id: string, payload: unknown): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}/imagens/url`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return [r as unknown as NextRequest, ctx(id)];
}

beforeEach(() => {
  vi.clearAllMocks();
  st.authed = true;
  st.dbConfigured = true;
  st.themes = [{ id: "t-1", nome: "Boho" } as unknown as ProposalTheme];
  st.mint.mockImplementation(async (id: string, types: string[]) =>
    types.map((_, i) => ({
      path: `${id}/uuid-${i}.jpg`,
      original: { path: `${id}/uuid-${i}.jpg`, uploadUrl: "https://up/o", token: "tok" },
      thumb: { path: `${id}/uuid-${i}.jpg`, uploadUrl: "https://up/t", token: "tuk" },
    })),
  );
  st.confirm.mockResolvedValue({ images: [], rejected: [] });
});

describe("POST — emitir bilhetes", () => {
  it("sem sessão de admin não emite nada", async () => {
    st.authed = false;
    const res = await POST(...req("t-1", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(401);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("o cliente manda TIPOS, não caminhos — e o caminho vem do servidor", async () => {
    const res = await POST(
      ...req("t-1", {
        contentTypes: ["image/jpeg"],
        // Tentativa de mandar o destino: tem de ser pura e simplesmente ignorada.
        path: "../proposal-assets/q-1/roubada.jpg",
        paths: ["outro-tema/x.jpg"],
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    // A camada de Storage só recebeu o id do tema e os tipos.
    expect(st.mint).toHaveBeenCalledWith("t-1", ["image/jpeg"]);
    expect(body.tickets[0].path).toBe("t-1/uuid-0.jpg");
  });

  it("um tema inexistente é 404 — não se abre pasta a um id inventado", async () => {
    const res = await POST(...req("nao-existe", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(404);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("recusa formatos que não servem", async () => {
    const res = await POST(...req("t-1", { contentTypes: ["image/jpeg", "application/pdf"] }));

    expect(res.status).toBe(415);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("recusa um lote acima do teto", async () => {
    const res = await POST(
      ...req("t-1", { contentTypes: Array.from({ length: 200 }, () => "image/jpeg") }),
    );

    expect(res.status).toBe(400);
    expect(st.mint).not.toHaveBeenCalled();
  });

  it("um corpo que não é JSON é 400, não 500", async () => {
    const r = new Request("https://liquen.test/api/temas/t-1/imagens/url", {
      method: "POST",
      body: "isto não é json",
    });
    const res = await POST(r as unknown as NextRequest, ctx("t-1"));

    expect(res.status).toBe(400);
  });

  it("Storage sem esta capacidade → 503 com o sinal de recurso", async () => {
    st.mint.mockResolvedValue(null);
    const res = await POST(...req("t-1", { contentTypes: ["image/jpeg"] }));
    const body = await res.json();

    expect(res.status).toBe(503);
    // É por este campo que o cliente sabe voltar ao multipart.
    expect(body.fallback).toBe("multipart");
  });

  it("Storage nem sequer configurado → o mesmo recurso, não um 500", async () => {
    st.dbConfigured = false;
    const res = await POST(...req("t-1", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(503);
    expect((await res.json()).fallback).toBe("multipart");
  });

  it("uma avaria a emitir não sai como exceção crua", async () => {
    st.mint.mockRejectedValue(new Error("storage em baixo"));
    const res = await POST(...req("t-1", { contentTypes: ["image/jpeg"] }));

    expect(res.status).toBe(503);
    expect((await res.json()).fallback).toBe("multipart");
  });
});

describe("PUT — confirmar", () => {
  function put(id: string, payload: unknown): [NextRequest, Ctx] {
    const r = new Request(`https://liquen.test/api/temas/${id}/imagens/url`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return [r as unknown as NextRequest, ctx(id)];
  }

  it("sem sessão de admin não confirma nada", async () => {
    st.authed = false;
    const res = await PUT(...put("t-1", { paths: ["t-1/a.jpg"] }));

    expect(res.status).toBe(401);
    expect(st.confirm).not.toHaveBeenCalled();
  });

  it("entrega os caminhos ao guarda, com o id do tema", async () => {
    st.confirm.mockResolvedValue({
      images: [{ path: "t-1/a.jpg", url: "https://signed/a" }],
      rejected: ["t-2/b.jpg"],
    });
    const res = await PUT(...put("t-1", { paths: ["t-1/a.jpg", "t-2/b.jpg"] }));
    const body = await res.json();

    // A rota não decide sozinha o que é "da pasta deste tema": passa o id, e
    // é `confirmThemeUploads` que corta — um só sítio a fazer essa conta.
    expect(st.confirm).toHaveBeenCalledWith("t-1", ["t-1/a.jpg", "t-2/b.jpg"]);
    expect(body.images).toHaveLength(1);
    expect(body.rejected).toEqual(["t-2/b.jpg"]);
  });

  it("uma lista vazia é 400", async () => {
    const res = await PUT(...put("t-1", { paths: [] }));

    expect(res.status).toBe(400);
    expect(st.confirm).not.toHaveBeenCalled();
  });

  it("um tema inexistente é 404", async () => {
    const res = await PUT(...put("nao-existe", { paths: ["x/a.jpg"] }));

    expect(res.status).toBe(404);
    expect(st.confirm).not.toHaveBeenCalled();
  });
});
