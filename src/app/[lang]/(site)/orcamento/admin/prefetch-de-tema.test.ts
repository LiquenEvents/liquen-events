// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREFETCH_LIMITE,
  PREFETCH_VALIDADE_MS,
  adiantarTema,
  esquecerAdiantadas,
  paginaDaResposta,
  usarAdiantada,
} from "./prefetch-de-tema";
import { THEME_PAGE_SIZE } from "@/lib/theme-types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PASSAR O RATO NUM TEMA COMEÇA A IR BUSCAR AS FOTOS DELE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do briefing: «prefetch on hover». Abrir um tema são duas esperas em fila — a
 * listagem da pasta e só DEPOIS as miniaturas —, e enquanto a primeira não
 * volta a grelha nem tem endereços para pedir.
 *
 * O que se prende aqui é o contrato de um adiantamento: que não custe duas
 * idas, que não sirva uma listagem velha, e que uma falha dele não estrague a
 * abertura a sério.
 */

const pedidos: string[] = [];

beforeEach(() => {
  pedidos.length = 0;
  esquecerAdiantadas();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      pedidos.push(url);
      return {
        ok: true,
        json: async () => ({ images: [{ path: "a.jpg" }], total: 7 }),
      } as unknown as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("adiantar um tema", () => {
  it("pede a primeira página com o MESMO limite da abertura a sério", () => {
    // Um número escrito à mão divergia um dia, e o sintoma seria mudo: o
    // adiantamento continuava a acontecer e deixava de servir para nada.
    expect(PREFETCH_LIMITE).toBe(THEME_PAGE_SIZE);
    adiantarTema("t1");
    expect(pedidos[0]).toBe(`/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`);
  });

  it("o rato a passar duas vezes não pede duas vezes", () => {
    adiantarTema("t1");
    adiantarTema("t1");
    expect(pedidos).toHaveLength(1);
  });

  it("e a abertura recebe o que se adiantou, sem uma segunda ida", async () => {
    adiantarTema("t1");
    const pagina = await usarAdiantada("t1");
    expect(pagina?.images).toHaveLength(1);
    expect(pedidos).toHaveLength(1);
  });

  /**
   * A MESMA LISTAGEM NÃO SERVE DUAS ABERTURAS.
   *
   * Entre uma e outra pode ter-se carregado fotos, apagado outras, mudado uma
   * capa. Consome-se.
   */
  it("consome-se", async () => {
    adiantarTema("t1");
    await usarAdiantada("t1");
    expect(await usarAdiantada("t1")).toBeNull();
  });

  it("uma listagem velha não se usa", async () => {
    const agora = 1_000_000;
    adiantarTema("t1", agora);
    expect(await usarAdiantada("t1", agora + PREFETCH_VALIDADE_MS + 1)).toBeNull();
  });

  it("e passado o prazo, o rato volta a poder adiantar", () => {
    const agora = 1_000_000;
    adiantarTema("t1", agora);
    adiantarTema("t1", agora + PREFETCH_VALIDADE_MS + 1);
    expect(pedidos).toHaveLength(2);
  });

  /**
   * UMA FALHA DO ADIANTAMENTO NÃO É UM ERRO DE NINGUÉM.
   *
   * A abertura a sério volta a tentar e é ela que fala. Se isto lançasse, o
   * prefetch — que é um luxo — partia a coisa que estava a servir.
   */
  it("uma rede em baixo não estraga a abertura", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("sem rede");
      }),
    );
    expect(() => adiantarTema("t2")).not.toThrow();
    expect(await usarAdiantada("t2")).toBeNull();
  });

  it("uma resposta que não é 2xx também não", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false }) as unknown as Response),
    );
    adiantarTema("t3");
    expect(await usarAdiantada("t3")).toBeNull();
  });
});

describe("a leitura da resposta", () => {
  /** Um só sítio, para o prefetch e a abertura não poderem discordar. */
  it("uma pasta que não pôde ser lida NÃO vale zero", () => {
    // Aceitá-la como zero faria a grelha dizer «arrasta aqui as fotos» a um
    // tema que pode ter 3000 — e ela a carregá-las outra vez.
    expect(paginaDaResposta({ ok: false, total: 0, images: [] }).total).toBeNull();
  });

  it("sem total, conta as que vieram", () => {
    expect(paginaDaResposta({ images: [{}, {}] }).total).toBe(2);
  });

  it("e uma resposta estragada não rebenta", () => {
    expect(paginaDaResposta(null).images).toEqual([]);
    expect(paginaDaResposta({ images: "não é uma lista" }).images).toEqual([]);
  });
});
