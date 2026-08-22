import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

// A lista de temas junta a base de dados (metadados) ao Storage (contagem de
// fotos). Mockamos ambos para testar o guarda de admin, a validação do nome, a
// recusa de duplicados e o facto de a contagem vir mesmo da pasta.
//
// Do Storage mockamos a LISTAGEM (`listThemeFiles`, sem assinaturas) e a
// assinatura em bloco (`signThemePaths`): é essa a divisão que faz a lista
// custar uma assinatura por tema em vez de uma por foto.
const st = vi.hoisted(() => ({
  authed: false,
  throwOnList: null as unknown,
  themes: [] as ProposalTheme[],
  files: {} as Record<string, { names: string[]; ok: boolean; truncated: boolean }>,
  create: vi.fn(async (input: { name: string; notes?: string }) => ({
    id: "t-new",
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...input,
  })),
  sign: vi.fn(
    async (paths: string[]) => new Map(paths.map((p) => [p, `https://signed/${p}`] as const)),
  ),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: vi.fn(async () => {
    if (st.throwOnList) throw st.throwOnList;
    return st.themes;
  }),
  createTheme: st.create,
}));
vi.mock("@/lib/theme-storage", async () => {
  // As funções puras (pasta, normalização do nome) são as reais; só o acesso
  // ao Storage é substituído.
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    listThemeFiles: vi.fn(
      async (id: string) => st.files[id] ?? { names: [], ok: true, truncated: false },
    ),
    signThemePaths: st.sign,
  };
});
// Mesmo reconhecedor de 23505 do módulo real, sem arrastar a loja de faturas.
vi.mock("@/lib/invoices-store", () => ({
  isUniqueViolation: (err: unknown) =>
    !!err && typeof err === "object" && (err as { code?: string }).code === "23505",
}));
// O detetor de "tabela em falta" é o REAL: é ele que está a ser testado.
vi.mock("@/lib/repository", async () =>
  vi.importActual<typeof import("@/lib/repository")>("@/lib/repository"),
);

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

const folder = (names: string[], over: Partial<{ ok: boolean; truncated: boolean }> = {}) => ({
  names,
  ok: true,
  truncated: false,
  ...over,
});

beforeEach(() => {
  st.authed = false;
  st.throwOnList = null;
  st.themes = [];
  st.files = {};
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
    st.files = { "t-1": folder(["a.jpg", "b.jpg"]) };
    const body = await (await GET(req("GET"))).json();
    expect(body[0]).toMatchObject({
      id: "t-1",
      imageCount: 2,
      coverUrl: "https://signed/t-1/a.jpg",
    });
    // Pasta vazia é mesmo zero (≠ ilegível), e o tema aparece à mesma.
    expect(body[1]).toMatchObject({ id: "t-2", imageCount: 0 });
    expect(body[1].coverUrl).toBeUndefined();
  });

  /**
   * A garantia que aqui interessa é o UM: desenhar a lista de temas nunca pode
   * custar uma assinatura por tema, quanto mais uma por foto. O cartão passou a
   * mostrar a capa mais três fotos (para dar ideia do conjunto e não de uma
   * imagem só), e isso muda o número de CAMINHOS — não o número de idas ao
   * Storage, que continua a ser um pedido para a página inteira.
   */
  it("assina num único pedido para todos os temas", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta"), theme("t-2", "Itália")];
    st.files = { "t-1": folder(["a.jpg", "b.jpg", "c.jpg"]), "t-2": folder(["d.jpg"]) };
    await GET(req("GET"));
    expect(st.sign).toHaveBeenCalledTimes(1);
    expect(st.sign).toHaveBeenCalledWith(["t-1/a.jpg", "t-2/d.jpg"]);
  });

  /**
   * ── UMA FOTOGRAFIA POR CARTÃO ─────────────────────────────────────────
   *
   * Decisão dela na Fase 2. Aqui assinavam-se mais TRÊS fotos por tema para
   * uma tira ao lado da capa — 41 px de largura na grelha compacta, pequena
   * de mais para se ler como fotografia. Numa biblioteca de 25 temas são 75
   * pedidos de imagem e 75 assinaturas que deixam de existir.
   *
   * Este teste é o guarda dessa poupança: só a capa é assinada, mesmo com a
   * pasta cheia.
   */
  it("as fotos que não são capa não se assinam", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta")];
    st.files = { "t-1": folder(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]) };
    const body = await (await GET(req("GET"))).json();
    expect(body[0].coverUrl).toBe("https://signed/t-1/a.jpg");
    expect(st.sign).toHaveBeenCalledWith(["t-1/a.jpg"]);
    expect(body[0].previewUrls).toBeUndefined();
  });

  it("uma pasta ILEGÍVEL não é '0 fotos' nem derruba os outros temas", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta"), theme("t-2", "Itália")];
    st.files = {
      "t-1": { names: [], ok: false, truncated: false },
      "t-2": folder(["d.jpg"]),
    };
    const body = await (await GET(req("GET"))).json();
    expect(body[0]).toMatchObject({ id: "t-1", imageCount: null });
    expect(body[0].coverUrl).toBeUndefined();
    expect(body[1]).toMatchObject({
      id: "t-2",
      imageCount: 1,
      coverUrl: "https://signed/t-2/d.jpg",
    });
    expect(st.sign).toHaveBeenCalledWith(["t-2/d.jpg"]);
  });

  it("usa a capa ESCOLHIDA em vez da foto mais recente", async () => {
    st.authed = true;
    st.themes = [{ ...theme("t-1", "Terracotta"), coverPath: "t-1/escolhida.jpg" }];
    st.files = { "t-1": folder(["recente.jpg", "antiga.jpg"]) };
    const body = await (await GET(req("GET"))).json();
    expect(body[0].coverUrl).toBe("https://signed/t-1/escolhida.jpg");
    // As duas hipóteses de capa — a escolhida e a mais recente, para o caso de
    // a escolhida já não existir — vão na MESMA assinatura.
    expect(st.sign).toHaveBeenCalledTimes(1);
    expect(st.sign).toHaveBeenCalledWith(["t-1/escolhida.jpg", "t-1/recente.jpg"]);
  });

  it("volta à foto mais recente quando a capa escolhida já não existe", async () => {
    st.authed = true;
    st.themes = [{ ...theme("t-1", "Terracotta"), coverPath: "t-1/apagada.jpg" }];
    st.files = { "t-1": folder(["recente.jpg"]) };
    // O Storage não assina o que não existe.
    st.sign.mockResolvedValueOnce(new Map([["t-1/recente.jpg", "https://signed/t-1/recente.jpg"]]));
    const body = await (await GET(req("GET"))).json();
    expect(body[0].coverUrl).toBe("https://signed/t-1/recente.jpg");
  });

  it("ignora uma capa que aponte para fora da pasta do tema", async () => {
    st.authed = true;
    st.themes = [{ ...theme("t-1", "Terracotta"), coverPath: "t-9/de-outro.jpg" }];
    st.files = { "t-1": folder(["recente.jpg"]) };
    await GET(req("GET"));
    expect(st.sign).toHaveBeenCalledWith(["t-1/recente.jpg"]);
  });

  it("marca como mínimo a contagem de uma pasta que bateu no limite da página", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta")];
    st.files = { "t-1": folder(["a.jpg"], { truncated: true }) };
    const body = await (await GET(req("GET"))).json();
    expect(body[0]).toMatchObject({ imageCount: 1, truncated: true });
  });

  it("devolve 500 tratado (não um throw cru) quando a base de dados falha", async () => {
    st.authed = true;
    st.throwOnList = new Error("db down");
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

  it("recusa um nome duplicado só pelos ACENTOS (Italia ≠ Itália era um tema a mais)", async () => {
    st.authed = true;
    st.themes = [theme("t-1", "Itália")];
    const res = await POST(req("POST", { name: "Italia" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Já existe um tema com um nome equivalente a "Italia".');
    expect(st.create).not.toHaveBeenCalled();
  });

  it("traduz o 23505 do índice único num 409 (corrida entre a verificação e o insert)", async () => {
    st.authed = true;
    st.create.mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));
    const res = await POST(req("POST", { name: "Itália" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toBe('Já existe um tema com um nome equivalente a "Itália".');
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

// ── Publicado sem correr o schema ──────────────────────────────────────────
// O sintoma que a equipa viu: criar um tema devolvia "Erro interno", que não
// indica caminho nenhum. Uma tabela em falta é recuperável — e a resposta tem
// de dizer o passo que falta.
describe("a tabela ainda não existe na base de dados", () => {
  const missing = Object.assign(new Error('relation "public.proposal_themes" does not exist'), {
    code: "42P01",
  });

  it("o GET explica o passo em falta, em vez de 'Erro interno'", async () => {
    st.authed = true;
    st.throwOnList = missing;
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });

  it("o POST explica o mesmo passo (foi por aqui que a equipa bateu)", async () => {
    st.authed = true;
    st.throwOnList = missing;
    const res = await POST(req("POST", { name: "Terracotta" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Supabase/);
    expect(st.create).not.toHaveBeenCalled();
  });

  it("reconhece também a resposta do PostgREST (cache do esquema)", async () => {
    st.authed = true;
    st.throwOnList = Object.assign(
      new Error("Could not find the table 'public.proposal_themes' in the schema cache"),
      { code: "PGRST205" },
    );
    expect((await GET(req("GET"))).status).toBe(503);
  });

  it("uma avaria a sério continua a ser 500 — não se disfarça de instalação", async () => {
    st.authed = true;
    st.throwOnList = new Error("connection reset");
    expect((await GET(req("GET"))).status).toBe(500);
  });

  // O schema cresce por `alter table ... add column`: uma COLUNA em falta é o
  // mesmo problema e a mesma solução de uma tabela em falta.
  it("reconhece uma COLUNA em falta (cover_path) como schema por correr", async () => {
    st.authed = true;
    st.throwOnList = Object.assign(
      new Error("Could not find the 'cover_path' column of 'proposal_themes' in the schema cache"),
      { code: "PGRST204" },
    );
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });

  it("reconhece também o 42703 do Postgres", async () => {
    st.authed = true;
    st.throwOnList = Object.assign(new Error('column "cover_path" does not exist'), {
      code: "42703",
    });
    expect((await GET(req("GET"))).status).toBe(503);
  });
});

// ── Publicado sem base de dados nenhuma ────────────────────────────────────
// Em produção a aplicação RECUSA escrever num ficheiro efémero (perder-se-ia
// no deploy seguinte, depois de dizer à equipa que tinha guardado). Isso é uma
// instalação incompleta, não uma avaria — e tem de o dizer.
describe("a base de dados não está ligada", () => {
  const refused = new Error("Persistence unavailable: Supabase not configured in production");

  it("o POST explica que faltam as chaves, em vez de 'Erro interno'", async () => {
    st.authed = true;
    st.create.mockRejectedValueOnce(refused);
    const res = await POST(req("POST", { name: "Terracotta" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/base de dados não está ligada/i);
  });

  it("o GET diz o mesmo", async () => {
    st.authed = true;
    st.throwOnList = refused;
    const res = await GET(req("GET"));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Supabase/);
  });
});

/**
 * ── A LISTA QUE NÃO MUDA, PEDIDA EM TODOS OS ECRÃS ────────────────────────
 *
 * A biblioteca de temas é lida em quase todo o lado e muda muito pouco — o
 * caso de manual para uma resposta condicional, como já faziam /api/propostas,
 * /api/propostas e as outras listas do back office. Aqui não fazia: cada
 * revalidação descarregava a lista inteira outra vez.
 *
 * A ARMADILHA que estes testes prendem: as capas e as tiras vêm em URLs
 * ASSINADOS, e uma assinatura leva a hora em que foi feita. Um ETag tirado do
 * corpo mudava a cada pedido e o 304 nunca acontecia — teria ficado um
 * cabeçalho a não fazer nada, com ar de estar a fazer. O carimbo é tirado do
 * que está POR BAIXO das assinaturas: que temas há e que ficheiros são a capa
 * e as tiras.
 */
describe("GET /api/temas — resposta condicional", () => {
  function reqCom(etag: string): NextRequest {
    return new Request("https://liquen.test/api/temas", {
      method: "GET",
      headers: { "If-None-Match": etag },
    }) as unknown as NextRequest;
  }

  /** Assina como o Storage assina: o mesmo ficheiro, um token novo de cada vez. */
  function assinaturasSempreNovas() {
    let n = 0;
    st.sign.mockImplementation(async (paths: string[]) => {
      n += 1;
      return new Map(paths.map((p) => [p, `https://signed/${p}?token=${n}`] as const));
    });
  }

  beforeEach(() => {
    st.authed = true;
    st.themes = [theme("t-1", "Terracotta")];
    st.files = { "t-1": folder(["a.jpg", "b.jpg"]) };
    assinaturasSempreNovas();
  });

  it("carimba a resposta com um ETag", async () => {
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(res.headers.get("etag")).toMatch(/^W\//);
  });

  it("responde 304 sem corpo quando a biblioteca é a mesma — apesar de as assinaturas serem novas", async () => {
    const primeira = await GET(req("GET"));
    const segunda = await GET(reqCom(primeira.headers.get("etag")!));
    expect(segunda.status).toBe(304);
    expect(await segunda.text()).toBe("");
  });

  it("uma foto nova muda o carimbo e a lista volta a vir inteira", async () => {
    const primeira = await GET(req("GET"));
    st.files = { "t-1": folder(["nova.jpg", "a.jpg", "b.jpg"]) };
    const segunda = await GET(reqCom(primeira.headers.get("etag")!));
    expect(segunda.status).toBe(200);
    expect((await segunda.json())[0].coverUrl).toMatch(/t-1\/nova\.jpg/);
  });

  it("um tema novo também", async () => {
    const primeira = await GET(req("GET"));
    st.themes = [theme("t-1", "Terracotta"), theme("t-2", "Itália")];
    expect((await GET(reqCom(primeira.headers.get("etag")!))).status).toBe(200);
  });

  it("o corpo de um 200 leva sempre assinaturas frescas, nunca as do carimbo", async () => {
    const primeira = await GET(req("GET"));
    const segunda = await GET(req("GET"));
    const a = (await primeira.json())[0].coverUrl;
    const b = (await segunda.json())[0].coverUrl;
    expect(a).not.toBe(b);
    expect(a.split("?")[0]).toBe(b.split("?")[0]);
  });
});
