import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «GRAVADO» SÓ SE PODE DIZER QUANDO FOI MESMO GRAVADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que aconteceu: o `setState` apanhava o erro da escrita, registava-o e fazia
 * `return` — indistinguível, de fora, de uma gravação bem sucedida. Enquanto
 * isto guardou marcadores de operação, o pior era uma notificação repetida.
 * Depois passaram a viver aqui os RASCUNHOS do estúdio, e uma proposta inteira
 * — fotos, textos, orçamento — ficou presa no `localStorage` de um portátil,
 * com a rota a responder OK e o ecrã a dizer «guardado às 14:32», porque a
 * tabela `app_state` não existia naquela instalação.
 *
 * Estes testes prendem o primeiro elo: uma escrita recusada pelo Supabase deixa
 * de sair daqui como se tivesse acontecido.
 */

const st = vi.hoisted(() => ({
  cliente: null as unknown,
  /** Os erros que o `upsert` devolve, um por chamada (`null` = aceitou). */
  respostas: [] as (unknown | null)[],
  chamadas: 0,
  ficheiroRebenta: false,
  escritoNoFicheiro: null as string | null,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(async () => "{}"),
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (_p: string, conteudo: string) => {
      if (st.ficheiroRebenta) throw new Error("EROFS: read-only file system");
      st.escritoNoFicheiro = conteudo;
    }),
  },
}));

import { setState } from "./app-state";

/** Um duplo do cliente do Supabase que responde o que `st.respostas` mandar. */
function supabaseQueResponde() {
  return {
    from: () => ({
      upsert: async () => {
        const error = st.respostas[st.chamadas] ?? null;
        st.chamadas++;
        return { error };
      },
    }),
  };
}

beforeEach(() => {
  st.cliente = supabaseQueResponde();
  st.respostas = [];
  st.chamadas = 0;
  st.ficheiroRebenta = false;
  st.escritoNoFicheiro = null;
});

describe("setState diz onde é que a coisa ficou", () => {
  it("aceite pelo Supabase: gravado no servidor", async () => {
    const r = await setState("proposal-draft:LQ-1", { doc: {} });
    expect(r).toEqual({ gravado: true, onde: "servidor" });
  });

  /** O caso da colaboradora, tal e qual: o `db/schema.sql` por correr. */
  it("tabela em falta: NÃO é dado como gravado, e diz-se porquê", async () => {
    st.respostas = [
      { code: "42P01", message: 'relation "public.app_state" does not exist' },
      { code: "42P01", message: 'relation "public.app_state" does not exist' },
      { code: "42P01", message: 'relation "public.app_state" does not exist' },
    ];
    const r = await setState("proposal-draft:LQ-1", { doc: {} });
    expect(r.gravado).toBe(false);
    expect(r.onde).toBe("nenhures");
    expect(r.motivo).toBe("tabela-em-falta");
  });

  it("uma tabela em falta não se repete — responderia o mesmo três vezes", async () => {
    st.respostas = [{ code: "PGRST205", message: "Could not find the table 'public.app_state'" }];
    await setState("k", 1);
    expect(st.chamadas).toBe(1);
  });

  it("uma permissão recusada também não é uma gravação", async () => {
    st.respostas = [{ code: "42501", message: "permission denied for table app_state" }];
    const r = await setState("k", 1);
    expect(r.gravado).toBe(false);
    expect(r.motivo).toBe("sem-permissao");
    // Tal como a tabela, repetir dá o mesmo.
    expect(st.chamadas).toBe(1);
  });

  /** O contrário: uma falha de rede não pode custar o rascunho à primeira. */
  it("uma falha passageira é repetida, e a segunda tentativa vale", async () => {
    st.respostas = [{ message: "fetch failed" }, null];
    const r = await setState("k", 1);
    expect(r).toEqual({ gravado: true, onde: "servidor" });
    expect(st.chamadas).toBe(2);
  });

  it("três falhas passageiras seguidas já não são passageiras", async () => {
    st.respostas = [{ message: "fetch failed" }, { message: "fetch failed" }, { message: "boom" }];
    const r = await setState("k", 1);
    expect(r.gravado).toBe(false);
    expect(r.motivo).toBe("escrita-recusada");
    expect(st.chamadas).toBe(3);
  });

  it("um `upsert` que rebenta conta como falha, não como gravação", async () => {
    st.cliente = {
      from: () => ({
        upsert: async () => {
          st.chamadas++;
          throw new Error("socket hang up");
        },
      }),
    };
    const r = await setState("k", 1);
    expect(r.gravado).toBe(false);
    expect(st.chamadas).toBe(3);
  });
});

describe("setState sem base de dados (o recurso de desenvolvimento)", () => {
  it("o ficheiro conta como gravado — é o servidor local, e é visível de qualquer navegador", async () => {
    st.cliente = null;
    const r = await setState("k", { a: 1 });
    expect(r).toEqual({ gravado: true, onde: "ficheiro" });
    expect(st.escritoNoFicheiro ?? "").toContain('"a": 1');
  });

  it("um ficheiro que não se deixa escrever também não é uma gravação", async () => {
    st.cliente = null;
    st.ficheiroRebenta = true;
    const r = await setState("k", { a: 1 });
    expect(r.gravado).toBe(false);
    expect(r.onde).toBe("nenhures");
  });
});
