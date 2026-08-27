// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO CASAL APARECE DUAS VEZES, E AGORA A LISTA DIZ QUE É O MESMO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A-01 da auditoria: «"Melanie e Sebastien" aparece DUAS VEZES na lista de
 * Propostas... sem agrupamento e sem dizer que é o mesmo cliente.»
 *
 * A aritmética está em `lib/orcamento/propostas-do-mesmo-cliente.ts` e tem os
 * seus testes. O que se guarda aqui é que o sinal chega ao ecrã, e — mais
 * importante — que a lista NÃO ENCOLHEU: continua a mostrar as duas linhas.
 * Esconder uma atrás da outra era a maneira fácil de fazer o sintoma
 * desaparecer, e tirava-lhe da vista a proposta que estava a expirar.
 */

const proposta = (id: string, clientName: string, clientEmail: string, createdAt: string) => ({
  id,
  quoteId: `q-${id}`,
  clientName,
  clientEmail,
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 1000,
  vat: 230,
  total: 1230,
  status: "enviada",
  createdAt,
});

/** Duas do mesmo casal, uma de outra pessoa — o controlo. */
const propostas = [
  proposta("p2", "Melanie e Sebastien", "melanie@example.com", "2026-05-02T10:00:00.000Z"),
  proposta("p1", "Melanie e Sebastien", "Melanie@Example.com ", "2026-03-11T10:00:00.000Z"),
  proposta("p3", "Rita Nunes", "rita@example.com", "2026-04-01T10:00:00.000Z"),
];

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"teste"' }),
  json: async () => body,
});

function montar(lista: unknown[]) {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas") ? response(lista) : response([]),
    ),
  );
  return render(
    <ToastProvider>
      <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("duas propostas do mesmo cliente", () => {
  it("continuam as duas na lista — nada foi escondido", async () => {
    montar(propostas);
    await waitFor(() => expect(screen.getAllByText("Melanie e Sebastien").length).toBe(2));
  });

  it("dizem qual é a primeira e qual é a segunda", async () => {
    montar(propostas);
    await waitFor(() => expect(screen.getByText("1.ª de 2")).toBeTruthy());
    expect(screen.getByText("2.ª de 2")).toBeTruthy();
  });

  it("junta o email escrito com maiúsculas e um espaço à direita", async () => {
    // As duas linhas do casal têm o email escrito de maneiras diferentes. Se a
    // chave fosse o texto cru, este teste via «1.ª de 2» em lado nenhum.
    montar(propostas);
    await waitFor(() => expect(screen.getByText("2.ª de 2")).toBeTruthy());
  });

  it("não diz nada de quem tem uma proposta só", async () => {
    // O controlo. Sem ele, uma etiqueta em todas as linhas passava neste
    // ficheiro — e uma etiqueta em todo o lado deixa de se ver.
    montar([proposta("p3", "Rita Nunes", "rita@example.com", "2026-04-01T10:00:00.000Z")]);
    await waitFor(() => expect(screen.getByText("Rita Nunes")).toBeTruthy());
    expect(screen.queryByText(/de \d+$/)).toBeNull();
  });
});
