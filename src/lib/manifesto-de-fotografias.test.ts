import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SABER O QUE SE PERDEU É A PRIMEIRA COISA QUE FALTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As fotografias são a única categoria sem cópia nenhuma. Copiar os bytes é
 * outra conversa (gigabytes, e pertence ao Supabase — está escrito no
 * RESILIENCE.md); o que NÃO custa nada e hoje não existe é a LISTA: que
 * ficheiros existiam, com que tamanho e com que assinatura.
 *
 * Sem ela, o dia em que um bucket desaparecer é o dia em que ninguém consegue
 * responder à única pergunta que interessa — «o que é que faltou?». Uma
 * proposta reposta aponta para `q-1/abc.jpg` e mais nada se sabe: nem se essa
 * foto alguma vez existiu, nem quantas eram, nem quais.
 *
 * O que estes testes prendem, e é tudo o que este módulo promete:
 *
 *  1. lista os ORIGINAIS e não as derivadas (as derivadas refazem-se — pô-las
 *     aqui era encher o manifesto com o que não é preciso salvar);
 *  2. NÃO transfere bytes — a listagem já traz tamanho e assinatura, e um
 *     manifesto que descarregasse as fotos deixava de ser barato e ninguém o
 *     correria;
 *  3. quando não conseguiu ver tudo, DIZ que não conseguiu. Um manifesto
 *     truncado a passar por completo é pior do que não haver manifesto: faz
 *     dar por perdidas fotos que existem, ou por salvas fotos que não estão lá.
 */

const st = vi.hoisted(() => ({
  /** Conteúdo por bucket: caminho → tamanho. */
  conteudo: {} as Record<string, Record<string, number>>,
  /** Buckets que respondem com erro à listagem. */
  rebenta: new Set<string>(),
  /** Quantas chamadas de listagem foram feitas (o custo do manifesto). */
  listagens: 0,
  /** Descarregamentos — tem de ficar em ZERO. */
  descarregamentos: 0,
  cliente: null as unknown,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { construirManifesto, LIMITE_DE_ENTRADAS } from "./manifesto-de-fotografias";
import { PROPOSAL_BUCKET } from "./proposal-storage";
import { THEME_BUCKET } from "./theme-ref";

/**
 * Um Storage de mentira com a MESMA forma do verdadeiro: `list(prefixo)`
 * devolve as entradas imediatas — as pastas sem `id` e sem `metadata`, os
 * ficheiros com ambos —, e pagina.
 */
function storageFalso() {
  return {
    storage: {
      from(bucket: string) {
        return {
          async list(prefixo: string, opcoes?: { limit?: number; offset?: number }) {
            st.listagens++;
            if (st.rebenta.has(bucket)) {
              return { data: null, error: { message: "Bucket not found" } };
            }
            const todos = Object.keys(st.conteudo[bucket] ?? {});
            const base = prefixo ? `${prefixo}/` : "";
            const nomes = new Set<string>();
            const entradas: unknown[] = [];
            for (const caminho of todos) {
              if (!caminho.startsWith(base)) continue;
              const resto = caminho.slice(base.length);
              const barra = resto.indexOf("/");
              const nome = barra === -1 ? resto : resto.slice(0, barra);
              if (nomes.has(nome)) continue;
              nomes.add(nome);
              entradas.push(
                barra === -1
                  ? {
                      name: nome,
                      id: `id-${caminho}`,
                      updated_at: "2026-08-01T10:00:00.000Z",
                      metadata: {
                        size: st.conteudo[bucket][caminho],
                        eTag: `"soma-${caminho}"`,
                        mimetype: "image/jpeg",
                      },
                    }
                  : { name: nome, id: null, updated_at: null, metadata: null },
              );
            }
            const inicio = opcoes?.offset ?? 0;
            const fim = inicio + (opcoes?.limit ?? 100);
            return { data: entradas.slice(inicio, fim), error: null };
          },
          async download() {
            st.descarregamentos++;
            return { data: null, error: { message: "não devia ser chamado" } };
          },
        };
      },
    },
  };
}

beforeEach(() => {
  st.conteudo = {
    [PROPOSAL_BUCKET]: {
      "LIQ-1/capa.jpg": 2_000_000,
      "LIQ-1/mood-1.jpg": 1_500_000,
      "LIQ-2/capa.jpg": 900_000,
    },
    [THEME_BUCKET]: { "italia/a.jpg": 800_000, "italia/b.jpg": 700_000 },
    // As derivadas EXISTEM no Storage e não podem aparecer no manifesto.
    "proposal-thumbs": { "LIQ-1/capa.jpg": 20_000 },
    "theme-thumbs": { "italia/a.jpg": 18_000 },
    "theme-micro": { "italia/a.jpg": 2_000 },
  };
  st.rebenta = new Set();
  st.listagens = 0;
  st.descarregamentos = 0;
  st.cliente = storageFalso();
});

describe("o que o manifesto leva", () => {
  it("leva os originais, com chave, tamanho e assinatura", async () => {
    const m = await construirManifesto();

    expect(m.ficheiros).toBe(5);
    expect(m.bytes).toBe(2_000_000 + 1_500_000 + 900_000 + 800_000 + 700_000);
    expect(m.completo).toBe(true);

    const uma = m.entradas.find((e) => e.chave === `${PROPOSAL_BUCKET}/LIQ-1/capa.jpg`);
    expect(uma).toBeDefined();
    expect(uma?.bytes).toBe(2_000_000);
    // A assinatura vem da própria listagem — é ela que distingue "a foto está
    // lá" de "está lá uma foto com o mesmo nome".
    expect(uma?.soma).toBe("soma-LIQ-1/capa.jpg");
  });

  it("NÃO leva as derivadas — essas refazem-se, e insubstituível é o original", async () => {
    const m = await construirManifesto();
    for (const e of m.entradas) {
      expect(e.chave).not.toMatch(/^(proposal-thumbs|theme-thumbs|theme-micro|.*-capas)\//);
    }
    expect(m.buckets.map((b) => b.bucket).sort()).toEqual([PROPOSAL_BUCKET, THEME_BUCKET].sort());
  });

  it("não transfere um único byte — é isso que o faz barato de correr todos os dias", async () => {
    await construirManifesto();
    expect(st.descarregamentos).toBe(0);
    // E o custo é uma listagem por pasta, não uma pergunta por ficheiro.
    expect(st.listagens).toBeLessThan(10);
  });

  it("conta por bucket, para o email dizer de que tamanho é o que está por copiar", async () => {
    const m = await construirManifesto();
    const propostas = m.buckets.find((b) => b.bucket === PROPOSAL_BUCKET);
    expect(propostas).toEqual({ bucket: PROPOSAL_BUCKET, ficheiros: 3, bytes: 4_400_000 });
  });
});

/**
 * A honestidade do manifesto é toda aqui. Um ficheiro que diz «estas são as
 * fotografias que existem» e omite metade é o que faz alguém dar por perdidas
 * fotos que estão lá — ou o contrário, que é pior.
 */
describe("quando não se conseguiu ver tudo, diz-se", () => {
  it("um bucket que não responde não passa por um bucket vazio", async () => {
    st.rebenta.add(THEME_BUCKET);
    const m = await construirManifesto();
    expect(m.completo).toBe(false);
    expect(m.avisos.join(" ")).toContain(THEME_BUCKET);
    // E o que se conseguiu ver continua a valer.
    expect(m.ficheiros).toBe(3);
  });

  it("sem base de dados não há Storage — e isso também se diz", async () => {
    st.cliente = null;
    const m = await construirManifesto();
    expect(m.completo).toBe(false);
    expect(m.entradas).toHaveLength(0);
    expect(m.avisos.join(" ")).toMatch(/Storage|base de dados/i);
  });

  it("acima do tecto de entradas pára e admite que parou", async () => {
    /**
     * Um bucket infinito, fabricado à medida do pedido em vez de montado em
     * memória: o que se está a testar é o TECTO, e construir cinquenta mil
     * entradas de mentira para lá chegar tornava este teste mais caro do que
     * tudo o resto do ficheiro junto.
     */
    st.cliente = {
      storage: {
        from: () => ({
          list: async (prefixo: string, opcoes?: { limit?: number }) => {
            const limite = opcoes?.limit ?? 100;
            const data = Array.from({ length: limite }, (_, i) => ({
              name: `foto-${prefixo}-${i}.jpg`,
              id: `id-${i}`,
              updated_at: "2026-08-01T10:00:00.000Z",
              metadata: { size: 1000, eTag: '"x"' },
            }));
            return { data, error: null };
          },
        }),
      },
    };
    const m = await construirManifesto();
    expect(m.completo).toBe(false);
    expect(m.entradas.length).toBeLessThanOrEqual(LIMITE_DE_ENTRADAS);
    expect(m.avisos.join(" ")).toMatch(/tecto|limite/i);
  });
});
