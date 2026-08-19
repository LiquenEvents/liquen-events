import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REDE: nenhum tema no ecrã não pode voltar a ser um mistério
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «nós tínhamos já imensos temas lá, e diz que não é possível
 * carregar os temas». Nenhum tema no ecrã e uma frase que não nomeia nada.
 *
 * Este ficheiro prende as duas metades do que se corrigiu, e prende-as como
 * REGRA e não como caso:
 *
 *   1. UMA FALHA ACESSÓRIA NUNCA APAGA A LISTA. As fotos são um extra: uma
 *      pasta ilegível, uma assinatura falhada, um Storage que não responde
 *      dentro do orçamento — nada disso pode tirar um tema do ecrã. Um tema sem
 *      capa é um problema pequeno; nenhum tema é o trabalho dela desaparecido.
 *
 *   2. NENHUMA CAUSA CONHECIDA CAI NO GENÉRICO. A tabela abaixo é a lista das
 *      avarias que se conseguiram provocar contra um Supabase de mentira. Cada
 *      uma tem de sair com o seu título e o seu passo seguinte — e os títulos
 *      têm de ser DISTINTOS entre si, senão voltamos a ter uma frase só a
 *      cobrir sete problemas diferentes.
 *
 * Uma causa nova que apareça e não seja reconhecida também não fica anónima: o
 * teste do fim exige que a resposta traga a descrição técnica, que é o que ela
 * copia para uma mensagem a pedir ajuda.
 */

const st = vi.hoisted(() => ({
  themes: [] as ProposalTheme[],
  erroDaLista: null as unknown,
  listar: null as null | ((id: string) => Promise<unknown>),
  assinar: null as null | ((paths: string[]) => Promise<Map<string, string>>),
  configurada: true,
  papel: "service_role" as "service_role" | "anon" | "desconhecido" | "ausente",
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  listThemes: vi.fn(async () => {
    if (st.erroDaLista) throw st.erroDaLista;
    return st.themes;
  }),
  createTheme: vi.fn(),
}));
vi.mock("@/lib/supabase", () => ({
  isDatabaseConfigured: () => st.configurada,
  papelDaChaveSupabase: () => st.papel,
  getSupabase: () => null,
}));
vi.mock("@/lib/theme-storage", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  const vazio = async () => new Map<string, string>();
  return {
    ...real,
    listThemeFiles: vi.fn(async (id: string) =>
      st.listar ? st.listar(id) : { names: ["a.jpg"], ok: true, truncated: false },
    ),
    signThemePaths: vi.fn(async (p: string[]) => (st.assinar ? st.assinar(p) : vazio())),
    signThemeThumbs: vi.fn(async (p: string[]) => (st.assinar ? st.assinar(p) : vazio())),
    signThemeMicros: vi.fn(async (p: string[]) => (st.assinar ? st.assinar(p) : vazio())),
  };
});

import { GET } from "./route";

const req = () => new Request("https://liquen.test/api/temas") as unknown as NextRequest;

const tema = (id: string, name: string): ProposalTheme => ({
  id,
  name,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
});

const TRES = [tema("t1", "Itália"), tema("t2", "Terracotta"), tema("t3", "Bouquets")];

beforeEach(() => {
  st.themes = [];
  st.erroDaLista = null;
  st.listar = null;
  st.assinar = null;
  st.configurada = true;
  st.papel = "service_role";
});
afterEach(() => {
  vi.useRealTimers();
});

// ── 1. A lista aguenta tudo o que for acessório ───────────────────────────
describe("os temas aparecem mesmo quando as fotos não", () => {
  it("uma listagem de pasta que LANÇA não tira nenhum tema do ecrã", async () => {
    st.themes = TRES;
    st.listar = async () => {
      throw new Error("Storage: 500 Internal");
    };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; imageCount: number | null }[];
    expect(body.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    // Nunca "0 fotos" — isso lia-se como "as minhas fotos desapareceram".
    expect(body.every((t) => t.imageCount === null)).toBe(true);
  });

  it("uma assinatura que LANÇA deixa os temas sem capa, não sem lista", async () => {
    st.themes = TRES;
    st.assinar = async () => {
      throw new Error("Storage: assinatura recusada");
    };
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; coverUrl?: string }[];
    expect(body.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(body.every((t) => !t.coverUrl)).toBe(true);
  });

  it("um Storage que NUNCA responde não segura a lista para além do orçamento", async () => {
    st.themes = TRES;
    // Uma pasta que fica pendurada. Sem orçamento, a função morre ao fim do
    // tempo da plataforma e o que chega ao ecrã é um 504 sem corpo — que é
    // exactamente a resposta que não sabe dizer nada.
    st.listar = () => new Promise(() => {});
    vi.useFakeTimers();
    const pedido = GET(req());
    await vi.advanceTimersByTimeAsync(10_000);
    const res = await pedido;
    expect(res.status).toBe(200);
    const body = (await res.json()) as { id: string; imageCount: number | null }[];
    expect(body.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(body.every((t) => t.imageCount === null)).toBe(true);
  });
});

// ── 2. Nenhuma causa conhecida cai no genérico ────────────────────────────
/**
 * As formas medidas contra o cliente REAL do Supabase, apontado a um servidor
 * que responde o que o Supabase responde. O `status` é o que a camada de
 * repositório passou a colar ao erro — sem ele um 401 e um 500 chegam iguais.
 */
const CAUSAS: { nome: string; erro: unknown; esperado: string }[] = [
  {
    nome: "a tabela não existe (o schema nunca correu)",
    erro: { code: "PGRST205", message: "Could not find the table 'public.proposal_themes'" },
    esperado: "Falta um passo de instalação",
  },
  {
    nome: "falta uma coluna que o código lê",
    erro: { code: "42703", message: "column proposal_themes.cover_path does not exist" },
    esperado: "Falta um passo de instalação",
  },
  {
    nome: "as chaves do Supabase não estão configuradas",
    erro: new Error("Persistence unavailable: Supabase not configured in production"),
    esperado: "Falta um passo de instalação",
  },
  {
    nome: "a chave do Supabase foi recusada",
    erro: { message: "Invalid API key", status: 401 },
    esperado: "A base de dados recusou a chave",
  },
  {
    nome: "a sessão do PostgREST caducou",
    erro: { code: "PGRST301", message: "JWT expired", status: 401 },
    esperado: "A ligação à base de dados caducou",
  },
  {
    nome: "o projecto Supabase está em pausa (responde HTML)",
    erro: { message: "<html><body>Project is paused</body></html>", status: 540 },
    esperado: "A base de dados não respondeu",
  },
  {
    nome: "o projecto Supabase recusa a ligação",
    erro: { message: "TypeError: fetch failed", code: "", status: 0 },
    esperado: "A base de dados não respondeu",
  },
  {
    nome: "a consulta passou do tempo da base de dados",
    erro: { code: "57014", message: "canceling statement due to statement timeout", status: 500 },
    esperado: "A base de dados demorou demasiado",
  },
  {
    nome: "o RLS negou a leitura ao papel usado",
    erro: { code: "42501", message: "permission denied for table proposal_themes", status: 403 },
    esperado: "A base de dados recusou a leitura",
  },
];

describe("cada causa conhecida diz o que falhou e o que fazer", () => {
  for (const { nome, erro, esperado } of CAUSAS) {
    it(nome, async () => {
      st.erroDaLista = erro;
      const res = await GET(req());
      const body = (await res.json()) as { error?: string; titulo?: string };
      expect(res.status, `${nome}: uma causa que alguém pode resolver é 503`).toBe(503);
      expect(body.titulo, nome).toBe(esperado);
      expect(body.error, `${nome}: a frase tem de dizer o passo seguinte`).toBeTruthy();
      expect(body.error, nome).not.toBe("Erro interno");
      // Uma frase de trabalho: nomeia onde ir. Sem isto voltamos a ter um aviso
      // que não indica caminho nenhum.
      expect(
        body.error!.length,
        `${nome}: a frase é curta demais para ter um passo`,
      ).toBeGreaterThan(80);
    });
  }

  /**
   * Dois problemas com a MESMA resolução podem partilhar a frase; dois com
   * resoluções diferentes, nunca. Antes desta correcção sete das nove causas
   * partilhavam «Erro interno», e é essa a regressão que isto apanha — a
   * contagem é a medida de quantos caminhos distintos o ecrã sabe indicar.
   */
  it("as nove causas dão seis caminhos distintos, não um só", async () => {
    const titulos = new Set<string>();
    for (const { erro } of CAUSAS) {
      st.erroDaLista = erro;
      const body = (await (await GET(req())).json()) as { titulo: string };
      titulos.add(body.titulo);
    }
    expect([...titulos].sort()).toEqual(
      [
        "A base de dados demorou demasiado",
        "A base de dados não respondeu",
        "A base de dados recusou a chave",
        "A base de dados recusou a leitura",
        "A ligação à base de dados caducou",
        "Falta um passo de instalação",
      ].sort(),
    );
  });

  it("uma causa DESCONHECIDA também não fica anónima", async () => {
    st.erroDaLista = { code: "XX000", message: "internal error do Postgres", status: 500 };
    const res = await GET(req());
    const body = (await res.json()) as { error: string; titulo: string };
    expect(res.status).toBe(500);
    expect(body.error).not.toBe("Erro interno");
    expect(body.titulo).toBeTruthy();
    // O que ela copia para pedir ajuda.
    expect(body.error).toContain("XX000");
    expect(body.error).toContain("internal error do Postgres");
  });
});

// ── 3. As duas maneiras de a lista vir vazia POR AVARIA ───────────────────
describe("uma lista vazia por avaria não se disfarça de biblioteca vazia", () => {
  it("a chave configurada é a anon: os temas existem, é a chave que não os vê", async () => {
    st.themes = [];
    st.configurada = true;
    st.papel = "anon";
    const res = await GET(req());
    const body = (await res.json()) as { error: string; titulo: string };
    expect(res.status).toBe(503);
    expect(body.titulo).toBe("A chave usada não vê os dados");
    expect(body.error).toContain("service_role");
  });

  it("em produção sem base de dados configurada, a lista vazia é dita", async () => {
    const antes = process.env.NODE_ENV;
    vi.stubEnv("NODE_ENV", "production");
    st.themes = [];
    st.configurada = false;
    const res = await GET(req());
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toContain("SUPABASE_URL");
    vi.stubEnv("NODE_ENV", antes ?? "test");
  });

  it("uma biblioteca mesmo vazia continua a ser uma lista vazia, sem alarme", async () => {
    st.themes = [];
    st.configurada = true;
    st.papel = "service_role";
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
