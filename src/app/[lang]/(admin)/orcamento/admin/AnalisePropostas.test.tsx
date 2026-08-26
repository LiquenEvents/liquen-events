// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Proposal } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import AnalisePropostas from "./AnalisePropostas";

/**
 * O que se prende aqui é o que impede este painel de mentir com confiança:
 * cada percentagem sai acompanhada da contagem em que assenta, e um conjunto
 * pequeno de mais para concluir seja o que for di-lo por escrito.
 */

let i = 0;
const p = (over: Partial<Proposal> = {}): Proposal => {
  i += 1;
  return {
    id: `p${i}`,
    quoteId: `q${i}`,
    clientName: "Ana e Rui",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 10000,
    vat: 2300,
    total: 12300,
    status: "enviada",
    createdAt: "2026-01-01T00:00:00.000Z",
    sentAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
};

function montar(propostas: Proposal[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ ETag: `W/"${propostas.length}-${Math.random()}"` }),
      json: async () => propostas,
    })),
  );
  render(<AnalisePropostas />);
}

beforeEach(() => {
  // A cache do `useCachedList` vive no MÓDULO e sobreviveria de um teste para o
  // outro — cada um tem de começar da mesma folha.
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a lista vem pela forma leve", () => {
  it("pede /api/propostas?semDoc=1, e não a rota pesada", async () => {
    montar([p({ status: "enviada" })]);
    await waitFor(() => expect(screen.getByText("Propostas enviadas")).toBeTruthy());

    const pedidos = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.map((c) =>
      String(c[0]),
    );
    expect(pedidos.some((u) => u === "/api/propostas?semDoc=1")).toBe(true);
    expect(pedidos.some((u) => u === "/api/propostas")).toBe(false);
  });
});

describe("sem nada para dizer", () => {
  it("não desenha painel nenhum", async () => {
    montar([]);
    // Um painel de zeros ensina a não voltar a este ecrã.
    await waitFor(() => expect(screen.queryByText("Propostas enviadas")).toBeNull());
  });
});

describe("o fecho", () => {
  it("diz a percentagem E em quantas assenta", async () => {
    montar([
      p({ status: "aceite" }),
      p({ status: "rejeitada", lostReason: "preco" }),
      p({ status: "enviada" }),
    ]);
    await waitFor(() => expect(screen.getByText("50%")).toBeTruthy());
    // Sem a contagem ao lado, "50%" a partir de duas respostas lê-se com a
    // mesma autoridade que a partir de duzentas.
    expect(screen.getByText("em 2 respondidas")).toBeTruthy();
  });
});

describe("os motivos", () => {
  it("conta cada um e avisa quando são poucos", async () => {
    montar([
      p({ status: "rejeitada", lostReason: "preco" }),
      p({ status: "rejeitada", lostReason: "preco" }),
      p({ status: "rejeitada", lostReason: "data" }),
    ]);
    await waitFor(() => expect(screen.getByText("Preço")).toBeTruthy());
    expect(screen.getByText("2 · 67%")).toBeTruthy();
    expect(screen.getByText(/poucas para se tirar conclusão nenhuma/)).toBeTruthy();
  });
});

describe("os extras", () => {
  /**
   * A lista que este painel lê é a LEVE (`?semDoc=1`): não traz `doc`, traz
   * `temOpcionais` já calculado a partir dele. Os testes simulam a resposta
   * do servidor, não o componente — por isso constroem-na já na forma leve.
   */
  const comExtras = (over: Partial<Proposal> & { temOpcionais?: boolean } = {}) =>
    ({
      ...p({ status: "aceite" }),
      temOpcionais: true,
      ...over,
    }) as unknown as Proposal;

  it("conta sobre as registadas e diz quantas faltam", async () => {
    montar([
      comExtras({ versaoEscolhida: "extras" }),
      comExtras({ versaoEscolhida: "base" }),
      comExtras(),
    ]);
    await waitFor(() => expect(screen.getByText(/Das 2 registadas/)).toBeTruthy());
    expect(screen.getByText(/Falta registar uma/)).toBeTruthy();
  });

  it("sem extras oferecidos, a secção não existe", async () => {
    montar([p({ status: "aceite" })]);
    await waitFor(() => expect(screen.getByText("Propostas enviadas")).toBeTruthy());
    expect(screen.queryByText(/Os extras vendem-se/)).toBeNull();
  });
});
