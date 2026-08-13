import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
  /** Faz rebentar SÓ a escrita que traga esta chave — para se poder encenar uma
   *  falha a meio de uma fila sem derrubar as escritas seguintes. */
  rebentaSeContiver: null as string | null,
  escritoNoFicheiro: null as string | null,
  /** O ficheiro DE VERDADE: o que lá está agora. Sem isto, um duplo que devolve
   *  sempre "{}" à leitura esconde precisamente o defeito da escrita perdida. */
  conteudo: "{}",
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("fs", () => ({
  promises: {
    readFile: vi.fn(async () => {
      // Ler do disco leva tempo, e é nessa fresta que o defeito vive: sem fila,
      // as escritas em paralelo lêem TODAS o mapa antes de alguma o escrever.
      await new Promise((r) => setTimeout(r, 1));
      return st.conteudo;
    }),
    mkdir: vi.fn(async () => undefined),
    writeFile: vi.fn(async (_p: string, conteudo: string) => {
      await new Promise((r) => setTimeout(r, 1));
      if (st.ficheiroRebenta || (st.rebentaSeContiver && conteudo.includes(st.rebentaSeContiver))) {
        throw new Error("EROFS: read-only file system");
      }
      st.conteudo = conteudo;
      st.escritoNoFicheiro = conteudo;
    }),
  },
}));

import { setState, oFicheiroEhEfemero } from "./app-state";

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
  st.rebentaSeContiver = null;
  st.escritoNoFicheiro = null;
  st.conteudo = "{}";
});

describe("setState diz onde é que a coisa ficou", () => {
  it("aceite pelo Supabase: gravado no servidor", async () => {
    const r = await setState("proposal-draft:LQ-1", { doc: {} });
    expect(r).toEqual({ gravado: true, duradouro: true, onde: "servidor" });
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
    expect(r).toEqual({ gravado: true, duradouro: true, onde: "servidor" });
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
    expect(r).toEqual({ gravado: true, duradouro: true, onde: "ficheiro" });
    expect(st.escritoNoFicheiro ?? "").toContain('"a": 1');
  });

  it("um ficheiro que não se deixa escrever também não é uma gravação", async () => {
    st.cliente = null;
    st.ficheiroRebenta = true;
    const r = await setState("k", { a: 1 });
    expect(r.gravado).toBe(false);
    expect(r.onde).toBe("nenhures");
    expect(r.duradouro).toBe(false);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VINTE E CINCO ESCRITAS AO MESMO TEMPO NÃO PODEM DAR UMA SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O caminho do ficheiro grava o mapa INTEIRO: lê, põe a chave, escreve. Com um
 * `await` no meio, duas chamadas em paralelo lêem ambas o mapa antes de
 * qualquer uma escrever, e a segunda grava por cima sem a chave da primeira.
 *
 * Isto não é hipotético nem raro: a REPOSIÇÃO de uma cópia de segurança repõe
 * os rascunhos do estúdio em lotes de 25 chamadas paralelas
 * (`proposal-drafts.ts`). Sobrevivia UM de cada 25 — e a reposição reportava
 * sucesso total, porque cada escrita aconteceu mesmo; foi a seguinte que a
 * apagou. É o mesmo defeito que o `FileBackend` do `repository.ts` já tinha
 * resolvido com uma fila, e é a mesma fila que aqui se usa.
 */
describe("o ficheiro não pode perder escritas em paralelo", () => {
  it("25 rascunhos gravados ao mesmo tempo estão TODOS lá no fim", async () => {
    st.cliente = null;
    const chaves = Array.from({ length: 25 }, (_, i) => `proposal-draft:LQ-${i}`);

    const resultados = await Promise.all(chaves.map((k, i) => setState(k, { n: i })));

    // Cada uma diz que gravou — e isso continua a ser verdade.
    expect(resultados.every((r) => r.gravado)).toBe(true);
    // O que mudou: agora também é verdade DEPOIS de todas terem gravado.
    const final = JSON.parse(st.conteudo) as Record<string, { n: number }>;
    expect(Object.keys(final).sort()).toEqual([...chaves].sort());
    expect(final["proposal-draft:LQ-0"]).toEqual({ n: 0 });
    expect(final["proposal-draft:LQ-24"]).toEqual({ n: 24 });
  });

  it("uma escrita que rebenta não entope a fila das seguintes", async () => {
    st.cliente = null;
    st.rebentaSeContiver = "k-ma";
    const [rMá, rBoa] = await Promise.all([setState("k-ma", 1), setState("k-boa", 2)]);

    expect(rMá.gravado).toBe(false);
    expect(rBoa.gravado).toBe(true);
    expect(JSON.parse(st.conteudo)).toEqual({ "k-boa": 2 });
  });

  it("escritas seguidas à mesma chave ficam na última, não numa qualquer", async () => {
    st.cliente = null;
    await Promise.all([setState("k", 1), setState("k", 2), setState("k", 3)]);
    // A fila preserva a ORDEM de chegada: a última a entrar é a que fica.
    expect(JSON.parse(st.conteudo)).toEqual({ k: 3 });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UM SÍTIO EFÉMERO NÃO CONTA COMO GUARDADO ONDE NÃO DURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O mesmo defeito do «Guardado» que era mentira, com outra roupa. Ali a mentira
 * era sobre ter escrito; aqui é sobre o SÍTIO durar: em Vercel o
 * `data/app-state.json` vive no disco da função, que não sobrevive a um deploy
 * e muitas vezes nem à invocação seguinte — o contentor é reciclado. O
 * `setState` respondia `{ gravado: true, onde: "ficheiro" }` com a mesma
 * confiança com que responde `"servidor"`.
 *
 * Na máquina de alguém o mesmo ficheiro é legítimo e tem de continuar a
 * funcionar. A diferença é o AMBIENTE, e é aí que a distinção vive — na mesma
 * regra que o `repository.assertWritableInProd` e o restauro já usam.
 */
describe("o ficheiro em produção não é um sítio", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("em produção uma escrita que só foi ao ficheiro NÃO é dada como guardada no servidor", async () => {
    vi.stubEnv("NODE_ENV", "production");
    st.cliente = null;
    const r = await setState("proposal-draft:LQ-1", { doc: {} });
    // Aconteceu — o rascunho está lá para esta invocação, e isso é melhor do
    // que nada. Mas não é o servidor, e não dura.
    expect(r.onde).toBe("ficheiro-efemero");
    expect(r.duradouro).toBe(false);
    expect(r.onde).not.toBe("servidor");
  });

  it("fora de produção o mesmo ficheiro continua a ser um sítio", async () => {
    vi.stubEnv("NODE_ENV", "development");
    st.cliente = null;
    const r = await setState("k", 1);
    expect(r.onde).toBe("ficheiro");
    expect(r.duradouro).toBe(true);
  });

  it("a regra de ambiente é a mesma do resto do código, e lê-se na hora", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(oFicheiroEhEfemero()).toBe(true);
    vi.stubEnv("NODE_ENV", "development");
    expect(oFicheiroEhEfemero()).toBe(false);
  });

  it("o servidor dura em qualquer ambiente", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const r = await setState("k", 1);
    expect(r).toEqual({ gravado: true, duradouro: true, onde: "servidor" });
  });
});
