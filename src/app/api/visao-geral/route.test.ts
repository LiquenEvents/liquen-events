import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * A rota das notas da equipa e da meta de receita.
 *
 * O que aqui se fixa não é "responde 200": é que NENHUMA falha sai daqui
 * calada. Uma gravação sobre uma versão antiga tem de ser recusada COM a
 * versão do servidor dentro (409), uma instalação sem tabela tem de dizer o
 * que fazer (503) e uma instalação sem base de dados não pode fingir que
 * guardou num ficheiro que desaparece no deploy seguinte.
 */

const authed = vi.hoisted(() => ({ ok: false }));

const store = vi.hoisted(() => ({
  read: vi.fn(),
  save: vi.fn(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));

vi.mock("@/lib/overview-settings-store", async (importOriginal) => {
  // O erro de conflito e as constantes são reais — só o armazenamento é falso.
  const actual = await importOriginal<typeof import("@/lib/overview-settings-store")>();
  return {
    ...actual,
    readOverviewSettings: store.read,
    saveOverviewField: store.save,
  };
});

import { GET, PUT } from "./route";
import { StaleWriteError, emptyField, type OverviewField } from "@/lib/overview-settings-store";

const campo = (over: Partial<OverviewField> = {}): OverviewField => ({
  id: "notas",
  value: "Confirmar o catering do Bruno",
  revision: 3,
  updatedAt: "2026-07-30T10:00:00.000Z",
  ...over,
});

function req(method: "GET" | "PUT", body?: unknown, headers?: Record<string, string>): NextRequest {
  return new Request("https://liquen.test/api/visao-geral", {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
  store.read.mockResolvedValue({ notas: campo(), meta: campo({ id: "meta", value: "15000" }) });
  store.save.mockImplementation(async (id: string, value: string, base: number) =>
    campo({ id: id as "notas", value, revision: base + 1 }),
  );
});

describe("/api/visao-geral — guardas", () => {
  it("GET e PUT recusam quem não tem sessão (401) sem tocar no armazenamento", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await PUT(req("PUT", { id: "notas", value: "x", baseRevision: 0 }))).status).toBe(401);
    expect(store.read).not.toHaveBeenCalled();
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe("/api/visao-geral — ler", () => {
  it("devolve os dois campos com a revisão sobre a qual se pode gravar", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notas.value).toBe("Confirmar o catering do Bruno");
    expect(body.notas.revision).toBe(3);
    expect(body.meta.value).toBe("15000");
  });

  it("responde 304 quando o cliente já tem esta versão (ETag)", async () => {
    authed.ok = true;
    const primeira = await GET(req("GET"));
    const etag = primeira.headers.get("etag");
    expect(etag).toBeTruthy();
    const segunda = await GET(req("GET", undefined, { "If-None-Match": etag as string }));
    expect(segunda.status).toBe(304);
  });

  it("uma tabela em falta é 503 com instruções, não um 500 mudo", async () => {
    authed.ok = true;
    store.read.mockRejectedValue(
      Object.assign(new Error('relation "public.overview_settings" does not exist'), {
        code: "42P01",
      }),
    );
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });
});

describe("/api/visao-geral — gravar", () => {
  it("grava o campo sobre a revisão indicada e devolve a nova", async () => {
    authed.ok = true;
    const res = await PUT(req("PUT", { id: "notas", value: "Novo texto", baseRevision: 3 }));
    expect(res.status).toBe(200);
    expect(store.save).toHaveBeenCalledWith("notas", "Novo texto", 3);
    expect((await res.json()).revision).toBe(4);
  });

  it("preserva o espaçamento das notas tal e qual foi escrito", async () => {
    authed.ok = true;
    await PUT(req("PUT", { id: "notas", value: "  linha 1\n\n  linha 2  ", baseRevision: 0 }));
    expect(store.save).toHaveBeenCalledWith("notas", "  linha 1\n\n  linha 2  ", 0);
  });

  it("aceita esvaziar as notas (apagar é uma decisão legítima)", async () => {
    authed.ok = true;
    const res = await PUT(req("PUT", { id: "notas", value: "", baseRevision: 2 }));
    expect(res.status).toBe(200);
    expect(store.save).toHaveBeenCalledWith("notas", "", 2);
  });

  it("recusa um campo desconhecido com 400", async () => {
    authed.ok = true;
    const res = await PUT(req("PUT", { id: "outra-coisa", value: "x", baseRevision: 0 }));
    expect(res.status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("recusa uma revisão em falta ou não numérica com 400", async () => {
    authed.ok = true;
    expect((await PUT(req("PUT", { id: "notas", value: "x" }))).status).toBe(400);
    expect((await PUT(req("PUT", { id: "notas", value: "x", baseRevision: "3" }))).status).toBe(
      400,
    );
    expect((await PUT(req("PUT", { id: "notas", value: "x", baseRevision: -1 }))).status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("recusa um corpo malformado com 400 (nunca um 500)", async () => {
    authed.ok = true;
    const mau = new Request("https://liquen.test/api/visao-geral", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: "{ isto não é json",
    }) as unknown as NextRequest;
    expect((await PUT(mau)).status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("recusa notas acima do tecto de tamanho", async () => {
    authed.ok = true;
    const res = await PUT(req("PUT", { id: "notas", value: "a".repeat(20_001), baseRevision: 0 }));
    expect(res.status).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });

  it("a meta aceita um número e limpa os espaços", async () => {
    authed.ok = true;
    const res = await PUT(req("PUT", { id: "meta", value: " 15000 ", baseRevision: 1 }));
    expect(res.status).toBe(200);
    expect(store.save).toHaveBeenCalledWith("meta", "15000", 1);
  });

  it("a meta aceita vazio (sem meta definida)", async () => {
    authed.ok = true;
    expect((await PUT(req("PUT", { id: "meta", value: "", baseRevision: 1 }))).status).toBe(200);
  });

  it("a meta recusa texto e valores absurdos com 400", async () => {
    authed.ok = true;
    expect(
      (await PUT(req("PUT", { id: "meta", value: "quinze mil", baseRevision: 1 }))).status,
    ).toBe(400);
    expect((await PUT(req("PUT", { id: "meta", value: "-5", baseRevision: 1 }))).status).toBe(400);
    expect(
      (await PUT(req("PUT", { id: "meta", value: "999999999", baseRevision: 1 }))).status,
    ).toBe(400);
    expect(store.save).not.toHaveBeenCalled();
  });
});

describe("/api/visao-geral — duas pessoas ao mesmo tempo", () => {
  it("uma gravação sobre uma versão antiga é RECUSADA (409) e devolve a do servidor", async () => {
    authed.ok = true;
    const doServidor = campo({ value: "O que a outra pessoa escreveu", revision: 7 });
    store.save.mockRejectedValue(new StaleWriteError(doServidor));

    const res = await PUT(req("PUT", { id: "notas", value: "O meu texto", baseRevision: 3 }));
    expect(res.status).toBe(409);
    const body = await res.json();
    // As DUAS coisas que o ecrã precisa: que não foi gravado, e o que lá está.
    expect(body.error).toMatch(/NÃO foi gravado/i);
    expect(body.current).toEqual(doServidor);
  });

  it("estrear o campo com uma revisão que não é 0 também é conflito", async () => {
    authed.ok = true;
    store.save.mockRejectedValue(new StaleWriteError(emptyField("notas")));
    const res = await PUT(req("PUT", { id: "notas", value: "x", baseRevision: 5 }));
    expect(res.status).toBe(409);
    expect((await res.json()).current.revision).toBe(0);
  });
});

describe("/api/visao-geral — instalação incompleta", () => {
  it("sem base de dados em produção responde 503 a dizer que faltam as chaves", async () => {
    authed.ok = true;
    store.save.mockRejectedValue(
      new Error("Persistence unavailable: Supabase not configured in production"),
    );
    const res = await PUT(req("PUT", { id: "notas", value: "x", baseRevision: 0 }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/SUPABASE_URL/);
  });

  it("sem tabela responde 503 a mandar correr o schema", async () => {
    authed.ok = true;
    store.save.mockRejectedValue(
      Object.assign(new Error("Could not find the table"), { code: "PGRST205" }),
    );
    const res = await PUT(req("PUT", { id: "notas", value: "x", baseRevision: 0 }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });

  it("uma avaria inesperada continua a ser 500 (e fica registada)", async () => {
    authed.ok = true;
    store.save.mockRejectedValue(new Error("boom"));
    const res = await PUT(req("PUT", { id: "notas", value: "x", baseRevision: 0 }));
    expect(res.status).toBe(500);
  });
});
