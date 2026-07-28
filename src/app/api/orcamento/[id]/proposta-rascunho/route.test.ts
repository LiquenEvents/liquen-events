import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * O rascunho da proposta no servidor.
 *
 * O que isto protege: até aqui a montagem de uma proposta — mood boards, fotos
 * colocadas, textos, valores — vivia só no `localStorage`. Começar no portátil
 * e continuar no tablet não funcionava, e limpar o histórico apagava trabalho.
 * Estes testes fixam as três coisas que fazem a diferença: o guarda de admin,
 * o teto de tamanho, e o aviso quando duas pessoas gravam a mesma proposta.
 */
const st = vi.hoisted(() => ({
  authed: false,
  stored: null as { doc: unknown; updatedAt: string; savedBy?: string } | null,
  throwOnGet: false,
  save: vi.fn(),
  clear: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => st.authed,
  ADMIN_NAME_COOKIE: "liquen_user",
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/proposal-drafts", () => ({
  getProposalDraft: vi.fn(async () => {
    if (st.throwOnGet) throw new Error("db down");
    return st.stored;
  }),
  saveProposalDraft: vi.fn(async (id: string, doc: unknown, savedBy?: string) => {
    st.save(id, doc, savedBy);
    const draft = { doc, updatedAt: "2026-07-28T23:00:00.000Z", ...(savedBy ? { savedBy } : {}) };
    st.stored = draft;
    return draft;
  }),
  clearProposalDraft: vi.fn(async (id: string) => {
    st.clear(id);
    st.stored = null;
  }),
}));

import { GET, PUT, DELETE } from "./route";

type Ctx = { params: Promise<{ id: string }> };

function req(
  method: "GET" | "PUT" | "DELETE",
  body?: unknown,
  cookie?: string,
): [NextRequest, Ctx] {
  const r = new Request("https://liquen.test/api/orcamento/q-1/proposta-rascunho", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
  // O `NextRequest` real expõe `cookies`; um `Request` simples não. É de lá
  // que sai o nome de quem gravou, por isso o duplo tem de o ter.
  Object.defineProperty(r, "cookies", {
    value: {
      get: (name: string) => (cookie && name === "liquen_user" ? { value: cookie } : undefined),
    },
  });
  return [r, { params: Promise.resolve({ id: "q-1" }) }];
}

beforeEach(() => {
  st.authed = true;
  st.stored = null;
  st.throwOnGet = false;
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id]/proposta-rascunho", () => {
  it("rejeita quem não está autenticado", async () => {
    st.authed = false;
    expect((await GET(...req("GET"))).status).toBe(401);
  });

  it("devolve null quando ainda não há rascunho — não é um erro", async () => {
    const res = await GET(...req("GET"));
    expect(res.status).toBe(200);
    expect((await res.json()).draft).toBeNull();
  });

  it("devolve o rascunho guardado", async () => {
    st.stored = { doc: { ref: "Casamento Maria" }, updatedAt: "2026-07-28T22:00:00.000Z" };
    const body = await (await GET(...req("GET"))).json();
    expect(body.draft.doc).toEqual({ ref: "Casamento Maria" });
  });

  it("devolve 500 tratado quando a leitura falha", async () => {
    st.throwOnGet = true;
    expect((await GET(...req("GET"))).status).toBe(500);
  });
});

describe("PUT /api/orcamento/[id]/proposta-rascunho", () => {
  it("rejeita quem não está autenticado e nunca grava", async () => {
    st.authed = false;
    expect((await PUT(...req("PUT", { doc: {} }))).status).toBe(401);
    expect(st.save).not.toHaveBeenCalled();
  });

  it("grava o rascunho e devolve a marca de tempo", async () => {
    const res = await PUT(...req("PUT", { doc: { ref: "X" } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.updatedAt).toBe("2026-07-28T23:00:00.000Z");
    expect(body.overwrote).toBe(false);
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, undefined);
  });

  it("regista quem gravou, para o aviso poder dizer o nome", async () => {
    await PUT(...req("PUT", { doc: { ref: "X" } }, "Catarina"));
    expect(st.save).toHaveBeenCalledWith("q-1", { ref: "X" }, "Catarina");
  });

  it("avisa quando alguém gravou entre a leitura e a escrita", async () => {
    st.stored = {
      doc: { ref: "antiga" },
      updatedAt: "2026-07-28T22:30:00.000Z",
      savedBy: "Catarina",
    };
    // Estávamos a editar a partir de uma versão mais antiga.
    const res = await PUT(
      ...req("PUT", { doc: { ref: "nova" }, baseUpdatedAt: "2026-07-28T22:00:00.000Z" }),
    );
    const body = await res.json();
    // A última escrita vence — mas não em silêncio.
    expect(body.overwrote).toBe(true);
    expect(body.previousBy).toBe("Catarina");
    expect(st.save).toHaveBeenCalled();
  });

  it("não avisa quando ninguém mexeu no meio", async () => {
    st.stored = { doc: { ref: "a" }, updatedAt: "2026-07-28T22:30:00.000Z" };
    const res = await PUT(
      ...req("PUT", { doc: { ref: "b" }, baseUpdatedAt: "2026-07-28T22:30:00.000Z" }),
    );
    expect((await res.json()).overwrote).toBe(false);
  });

  it("recusa um corpo sem rascunho", async () => {
    expect((await PUT(...req("PUT", { qualquer: 1 }))).status).toBe(400);
    expect(st.save).not.toHaveBeenCalled();
  });

  it("recusa um rascunho absurdamente grande, em vez de o guardar", async () => {
    const huge = { texto: "x".repeat(600 * 1024) };
    const res = await PUT(...req("PUT", { doc: huge }));
    expect(res.status).toBe(413);
    expect(st.save).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/orcamento/[id]/proposta-rascunho", () => {
  it("rejeita quem não está autenticado e nunca apaga", async () => {
    st.authed = false;
    expect((await DELETE(...req("DELETE"))).status).toBe(401);
    expect(st.clear).not.toHaveBeenCalled();
  });

  it("descarta o rascunho do pedido", async () => {
    const res = await DELETE(...req("DELETE"));
    expect(res.status).toBe(200);
    expect(st.clear).toHaveBeenCalledWith("q-1");
  });
});
