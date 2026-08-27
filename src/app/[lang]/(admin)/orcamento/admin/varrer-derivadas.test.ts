// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { esquecerVarredura, varrerDerivadasEmFundo } from "./varrer-derivadas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VARREDURA ANDA SOZINHA, E SABE PARAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito que isto veio fechar: 427 fotografias sem versão leve, e duas
 * únicas portas para as fazer — um botão que depende de alguém se lembrar, e o
 * cron dos lembretes uma vez por dia com os segundos que lhe sobrassem. Uma
 * célula sem miniatura puxa o ORIGINAL: 1099 KB contra 20 KB, na rede em que
 * ela trabalha.
 *
 * O que estes casos guardam é o que a distingue de um ciclo a gastar servidor:
 * que encadeia enquanto há trabalho E há progresso, e que PÁRA à primeira das
 * três razões para parar. Um lote que não fabrica nada, uma lista que acabou,
 * ou uma resposta que não é `ok`.
 */

const relogioReal = globalThis.setTimeout;

/** Um `setTimeout` que dispara já — a varredura espera 4 s e 1,5 s entre lotes. */
function semEsperas() {
  vi.stubGlobal("setTimeout", ((fn: () => void) =>
    relogioReal(fn, 0)) as unknown as typeof setTimeout);
}

function respostas(lista: unknown[]) {
  const chamadas: { corpo: unknown }[] = [];
  const fetchFalso = vi.fn(async (_url: string, init?: RequestInit) => {
    chamadas.push({ corpo: JSON.parse(String(init?.body ?? "{}")) });
    const proxima = lista[chamadas.length - 1];
    if (proxima === "falha-http") return { ok: false, json: async () => ({}) } as Response;
    return { ok: true, json: async () => proxima } as Response;
  });
  vi.stubGlobal("fetch", fetchFalso);
  return { chamadas, fetchFalso };
}

/** Deixa a cadeia correr: cada lote gasta duas voltas de temporizador. */
const deixarCorrer = () => new Promise((r) => relogioReal(r, 60));

beforeEach(() => {
  esquecerVarredura();
  semEsperas();
});
afterEach(() => {
  vi.unstubAllGlobals();
  esquecerVarredura();
});

describe("a varredura das versões leves", () => {
  it("encadeia lotes enquanto houver trabalho, e leva a retoma consigo", async () => {
    const { chamadas } = respostas([
      {
        ok: true,
        fotografiasFeitas: 200,
        restantesEssenciais: 227,
        retoma: { caminho: "a/1.jpg" },
      },
      { ok: true, fotografiasFeitas: 200, restantesEssenciais: 27, retoma: { caminho: "b/2.jpg" } },
      { ok: true, fotografiasFeitas: 27, restantesEssenciais: 0, retoma: null },
    ]);
    varrerDerivadasEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(3);
    // O segundo lote continua de onde o primeiro parou — sem isto, cada lote
    // recomeçava do princípio da biblioteca.
    expect(chamadas[1].corpo).toEqual({ retoma: { caminho: "a/1.jpg" } });
    expect(chamadas[2].corpo).toEqual({ retoma: { caminho: "b/2.jpg" } });
  });

  it("pára quando a lista acaba, sem pedir um lote a mais", async () => {
    const { chamadas } = respostas([{ ok: true, fotografiasFeitas: 5, restantesEssenciais: 0 }]);
    varrerDerivadasEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
  });

  it("pára quando um lote não fabrica nada — insistir era um ciclo em silêncio", async () => {
    const { chamadas } = respostas([
      { ok: true, fotografiasFeitas: 0, restantesEssenciais: 400 },
      { ok: true, fotografiasFeitas: 200, restantesEssenciais: 200 },
    ]);
    varrerDerivadasEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
  });

  it("pára em silêncio quando não há sessão ou armazenamento (401 · 503)", async () => {
    const { chamadas } = respostas(["falha-http", { ok: true, fotografiasFeitas: 9 }]);
    varrerDerivadasEmFundo();
    await deixarCorrer();
    expect(chamadas).toHaveLength(1);
  });

  it("não deixa duas varreduras ao mesmo tempo na mesma página", async () => {
    const { chamadas } = respostas([
      { ok: true, fotografiasFeitas: 200, restantesEssenciais: 10 },
      { ok: true, fotografiasFeitas: 10, restantesEssenciais: 0 },
    ]);
    varrerDerivadasEmFundo();
    varrerDerivadasEmFundo();
    varrerDerivadasEmFundo();
    await deixarCorrer();
    // Três chamadas ao arrancador, mas uma só cadeia: dois lotes, não seis.
    expect(chamadas).toHaveLength(2);
  });

  it("a limpeza do efeito interrompe a cadeia a meio", async () => {
    const { chamadas } = respostas([
      {
        ok: true,
        fotografiasFeitas: 200,
        restantesEssenciais: 227,
        retoma: { caminho: "a/1.jpg" },
      },
      { ok: true, fotografiasFeitas: 200, restantesEssenciais: 27 },
    ]);
    const parar = varrerDerivadasEmFundo();
    parar();
    await deixarCorrer();
    expect(chamadas).toHaveLength(0);
  });

  it("pede só as miniaturas — são elas que evitam a queda para o original", async () => {
    const { fetchFalso } = respostas([{ ok: true, fotografiasFeitas: 1, restantesEssenciais: 0 }]);
    varrerDerivadasEmFundo();
    await deixarCorrer();
    expect(fetchFalso.mock.calls[0][0]).toBe("/api/admin/derivadas?papel=essencial");
  });
});
