import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LOTE TEM DE CABER NUMA FUNÇÃO — E NÃO PODE PAGAR TUDO DUAS VEZES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel ficou parado em «A gerar as versões leves — 0 de 765», e ela disse
 * que não funciona. Não era o ecrã: era o servidor a não chegar ao fim do
 * primeiro lote.
 *
 * Duas contas, ambas de REDE — o `sharp` não tem culpa nenhuma (medido: 25
 * codificações AVIF a esforço 4 são ~9,7 s no total):
 *
 *  1. **O original era descarregado uma vez por DERIVADA.** Uma fotografia que
 *     precisa do AVIF grande e do AVIF micro descarregava os mesmos ~2 MB duas
 *     vezes. Nas 389 fotografias dela são ~1,5 GB a atravessar a função para
 *     fazer trabalho que precisava de ~780 MB.
 *  2. **Cada lote varria a biblioteca inteira outra vez.** Uma listagem por
 *     pasta e por bucket, do princípio, em CADA um dos ~31 lotes — centenas de
 *     idas ao Storage antes de a primeira imagem ser gerada.
 *
 * Somadas, o lote não cabia nos 60 s da função. Morria, e o que ela via era uma
 * barra a zero.
 *
 * O que estes testes prendem:
 *
 *  1. uma fotografia é descarregada UMA vez, faça ela uma derivada ou quatro;
 *  2. o bucket confirma-se uma vez por lote, não uma vez por derivada;
 *  3. o lote pára pelo RELÓGIO e não por um número fixo — é o relógio que
 *     conhece o tecto da função, e é ele que muda quando a rede está má;
 *  4. mesmo com o tempo esgotado faz sempre pelo menos uma, porque um lote que
 *     devolve zero pára o ciclo de quem chama e a geração nunca acabaria;
 *  5. o que falta é dito também em FOTOGRAFIAS, que é a unidade dos botões.
 */

const st = vi.hoisted(() => ({
  conteudo: {} as Record<string, Set<string>>,
  descarregados: [] as string[],
  bucketsConfirmados: [] as string[],
  escritos: [] as string[],
  cliente: null as unknown,
}));

vi.mock("./supabase", () => ({ getSupabase: () => st.cliente }));
vi.mock("./logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));
vi.mock("./theme-storage", () => ({
  garantirBucketDeDerivadas: async (bucket: string) => {
    st.bucketsConfirmados.push(bucket);
    return true;
  },
}));
vi.mock("sharp", () => {
  const falso = () => ({
    rotate: () => falso(),
    resize: () => falso(),
    webp: () => falso(),
    avif: () => falso(),
    toBuffer: async () => Buffer.from("bytes"),
  });
  return { default: falso };
});

import { gerarLoteDeDerivadas } from "./derivadas";
import { THEME_BUCKET } from "./theme-ref";

function storageFalso() {
  return {
    storage: {
      async getBucket() {
        return { data: { name: "existe" }, error: null };
      },
      from(bucket: string) {
        return {
          async list(prefixo: string, opcoes?: { limit?: number; offset?: number }) {
            const base = prefixo ? `${prefixo}/` : "";
            const nomes = new Set<string>();
            const entradas: unknown[] = [];
            for (const caminho of st.conteudo[bucket] ?? []) {
              if (!caminho.startsWith(base)) continue;
              const resto = caminho.slice(base.length);
              const barra = resto.indexOf("/");
              const nome = barra === -1 ? resto : resto.slice(0, barra);
              if (nomes.has(nome)) continue;
              nomes.add(nome);
              entradas.push(
                barra === -1
                  ? { name: nome, id: `id-${caminho}`, metadata: { size: 10 } }
                  : { name: nome, id: null, metadata: null },
              );
            }
            const inicio = opcoes?.offset ?? 0;
            return { data: entradas.slice(inicio, inicio + (opcoes?.limit ?? 100)), error: null };
          },
          async download(caminho: string) {
            st.descarregados.push(`${bucket}/${caminho}`);
            return { data: new Blob([Buffer.from("original")]), error: null };
          },
          async upload(caminho: string) {
            st.escritos.push(`${bucket}/${caminho}`);
            (st.conteudo[bucket] ??= new Set()).add(caminho);
            return { error: null };
          },
        };
      },
    },
  };
}

function tema(pasta: string, quantas: number) {
  st.conteudo[THEME_BUCKET] ??= new Set();
  for (let i = 0; i < quantas; i += 1) st.conteudo[THEME_BUCKET].add(`${pasta}/f${i}.jpg`);
}

/** Um relógio que anda `passo` ms a cada leitura — sem temporizadores falsos. */
function relogio(passo: number) {
  let t = 0;
  return () => {
    t += passo;
    return t;
  };
}

beforeEach(() => {
  st.conteudo = {};
  st.descarregados = [];
  st.bucketsConfirmados = [];
  st.escritos = [];
  st.cliente = storageFalso();
});

describe("um lote de derivadas", () => {
  it("descarrega a fotografia UMA vez, e não uma vez por derivada", async () => {
    tema("tema-a", 3);

    await gerarLoteDeDerivadas("leve");

    // Três fotografias, duas derivadas AVIF cada: seis escritas, três downloads.
    expect(st.escritos).toHaveLength(6);
    expect(st.descarregados).toHaveLength(3);
    expect(new Set(st.descarregados).size).toBe(3);
  });

  it("confirma cada bucket uma vez por lote, e não uma vez por fotografia", async () => {
    tema("tema-a", 5);

    await gerarLoteDeDerivadas("essencial");

    // Dois buckets essenciais. Sem memória, eram dois por fotografia — dez.
    expect(st.bucketsConfirmados).toHaveLength(2);
    expect(new Set(st.bucketsConfirmados).size).toBe(2);
  });

  it("pára pelo relógio, e diz o que ficou por fazer", async () => {
    tema("tema-a", 20);

    // Cada leitura do relógio avança 1 s; o tecto é 5 s. O lote tem de parar
    // muito antes das 20 fotografias.
    const r = await gerarLoteDeDerivadas("essencial", { tectoMs: 5_000, agora: relogio(1_000) });

    expect(r.fotografiasFeitas).toBeGreaterThan(0);
    expect(r.fotografiasFeitas).toBeLessThan(20);
    // O resto é dito nas duas unidades, e batem certo entre si: cada
    // fotografia destas deve duas derivadas essenciais.
    expect(r.fotografiasRestantes).toBe(20 - r.fotografiasFeitas);
    expect(r.restantes).toBe(r.fotografiasRestantes * 2);
    expect(r.restantesEssenciais).toBe(r.restantes);
  });

  it("com o tempo já esgotado faz sempre uma — senão a geração nunca acabava", async () => {
    tema("tema-a", 4);

    // O relógio já vai à frente do tecto na primeira leitura.
    const r = await gerarLoteDeDerivadas("essencial", { tectoMs: 0, agora: relogio(10_000) });

    // Quem chama pára o ciclo quando um lote devolve zero geradas. Um lote que
    // nunca gera nada por já estar atrasado seria uma geração que não avança.
    expect(r.fotografiasFeitas).toBe(1);
    expect(r.geradas).toBe(2);
    expect(r.fotografiasRestantes).toBe(3);
  });

  it("uma fotografia a que só falta metade das derivadas não regenera a outra metade", async () => {
    tema("tema-a", 2);
    await gerarLoteDeDerivadas("essencial");
    const antes = st.escritos.length;
    st.descarregados = [];

    // Segunda passagem: já não falta nada de essencial.
    const r = await gerarLoteDeDerivadas("essencial");

    expect(st.escritos).toHaveLength(antes);
    expect(st.descarregados).toHaveLength(0);
    expect(r.geradas).toBe(0);
    expect(r.fotografiasRestantes).toBe(0);
  });
});
