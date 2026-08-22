import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM UUID NÃO É O NOME DE NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel das miniaturas listava `6b9d0c4e-1f2a-… → theme-avif-micro: 47 de
 * 47`. Quem olha para aquilo não sabe de que tema se trata, portanto não sabe
 * se importa, portanto não faz nada — e um diagnóstico com que não se faz nada
 * podia não existir.
 *
 * A regra que estes testes prendem, e sobretudo a última: **um nome é uma
 * cortesia, a contagem é o trabalho.** Se a tabela dos temas não responder, o
 * painel mostra o id em vez de rebentar. Uma leitura decorativa que derruba um
 * diagnóstico é um defeito pior do que aquele que vinha diagnosticar.
 */

const dados = vi.hoisted(() => ({
  temas: [] as unknown[],
  pedidos: [] as unknown[],
  temasRebentam: false,
  pedidosRebentam: false,
}));

vi.mock("./themes-store", () => ({
  listThemes: async () => {
    if (dados.temasRebentam) throw new Error("relation does not exist");
    return dados.temas;
  },
}));
vi.mock("./quotes-store", () => ({
  listQuoteSummaries: async () => {
    if (dados.pedidosRebentam) throw new Error("sem ligação");
    return dados.pedidos;
  },
}));
vi.mock("./logger", () => ({ log: { warn: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { nomesDasPastas, nomeDeReserva } from "./pastas-com-nome";

beforeEach(() => {
  dados.temas = [];
  dados.pedidos = [];
  dados.temasRebentam = false;
  dados.pedidosRebentam = false;
});

describe("os nomes das pastas", () => {
  it("a pasta de um tema chama-se pelo nome do tema", async () => {
    dados.temas = [{ id: "6b9d0c4e-1f2a-4d3b-9c8e-0a1b2c3d4e5f", name: "Bouquets Campestres" }];

    const por = await nomesDasPastas();

    expect(por.get("theme-assets/6b9d0c4e-1f2a-4d3b-9c8e-0a1b2c3d4e5f")).toBe(
      "Bouquets Campestres",
    );
  });

  it("a pasta de um pedido chama-se pelos noivos", async () => {
    dados.pedidos = [{ id: "LIQ-42", partnerA: "Ana", partnerB: "João", name: "Mãe da noiva" }];

    const por = await nomesDasPastas();

    // Os noivos, e não quem escreveu: é a este par que a proposta se dirige.
    expect(por.get("proposal-assets/LIQ-42")).toBe("Ana e João");
  });

  it("sem noivos, vale quem escreveu", async () => {
    dados.pedidos = [{ id: "LIQ-43", name: "Empresa X" }];

    expect((await nomesDasPastas()).get("proposal-assets/LIQ-43")).toBe("Empresa X");
  });

  it("um tema e um pedido com o mesmo id não se pisam", async () => {
    dados.temas = [{ id: "igual", name: "Tema Igual" }];
    dados.pedidos = [{ id: "igual", name: "Pedido Igual" }];

    const por = await nomesDasPastas();

    expect(por.get("theme-assets/igual")).toBe("Tema Igual");
    expect(por.get("proposal-assets/igual")).toBe("Pedido Igual");
  });

  it("um tema sem nome não entra — o id é melhor do que uma linha em branco", async () => {
    dados.temas = [{ id: "sem-nome", name: "   " }];

    expect((await nomesDasPastas()).has("theme-assets/sem-nome")).toBe(false);
  });

  /**
   * ISTO É O TESTE QUE INTERESSA.
   *
   * A contagem das miniaturas é um diagnóstico, e o nome é um enfeite. No dia
   * em que a tabela dos temas não responder, o painel tem de continuar a dizer
   * quantas fotografias estão a servir o original — com os ids, feios e
   * certos.
   */
  it("uma leitura que rebenta não derruba as outras nem o painel", async () => {
    dados.temasRebentam = true;
    dados.pedidos = [{ id: "LIQ-1", name: "Ana" }];

    const por = await nomesDasPastas();

    expect(por.get("proposal-assets/LIQ-1")).toBe("Ana");
    expect(por.size).toBe(1);
  });

  it("as duas a rebentar dão um mapa vazio, e não uma excepção", async () => {
    dados.temasRebentam = true;
    dados.pedidosRebentam = true;

    await expect(nomesDasPastas()).resolves.toEqual(new Map());
  });

  it("o nome de reserva encurta o id em vez de mostrar trinta e seis caracteres", () => {
    expect(nomeDeReserva("6b9d0c4e-1f2a-4d3b-9c8e-0a1b2c3d4e5f")).toBe("Pasta 6b9d0c4e…");
    expect(nomeDeReserva("LIQ-42")).toBe("Pasta LIQ-42");
  });
});
