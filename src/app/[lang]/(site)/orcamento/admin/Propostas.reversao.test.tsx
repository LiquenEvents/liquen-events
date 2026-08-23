// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA QUE VOLTA À LISTA SEM NINGUÉM DIZER QUE VOLTOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Apagar é optimista: a linha sai da lista no instante do clique e reaparece
 * quando o servidor recusa. O aviso era «Não foi possível apagar a proposta.
 * Tenta novamente.» — não dizia de quem era a proposta, servia por igual à rede
 * em baixo e à sessão expirada (onde tentar novamente não pode funcionar), e
 * não dizia que aquela linha a ressuscitar era ele próprio a acontecer.
 *
 * Numa lista com dezenas de propostas, uma linha que reaparece sozinha lê-se
 * como um defeito do ecrã — e o passo seguinte é apagá-la outra vez.
 */

const proposta = {
  id: "p1",
  quoteId: "q1",
  clientName: "Ana e Rui",
  clientEmail: "a@b.pt",
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 10000,
  vat: 2300,
  total: 12300,
  status: "enviada",
  createdAt: "2026-05-01T00:00:00.000Z",
};

/** O `useCachedList` lê o estado e o ETag além do corpo — sem `headers` a
 *  lista nunca chega a desenhar-se. */
const leitura = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"teste"' }),
  json: async () => body,
});

/** As leituras respondem sempre; o DELETE responde o que o teste disser. */
function montar(apagar: () => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "DELETE") return apagar();
      return leitura(String(url).startsWith("/api/propostas") ? [proposta] : []);
    }),
  );
  return render(
    <ToastProvider>
      <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
    </ToastProvider>,
  );
}

/** Abre o menu «⋯» da primeira linha e carrega em «Apagar». A confirmação é um
 *  `window.confirm`, e é irreversível de propósito: aqui responde-se que sim. */
async function apagarAPrimeira() {
  const menus = screen.getAllByRole("button", { name: /Acções de Ana e Rui/ });
  await userEvent.click(menus[0]);
  await userEvent.click(screen.getAllByRole("menuitem", { name: "Apagar" })[0]);
}

const aviso = () => screen.getByRole("alert").textContent ?? "";

beforeEach(() => {
  __resetListCache();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Propostas — apagar uma proposta que o servidor recusa apagar", () => {
  it("repõe a linha E diz que ela voltou à lista", async () => {
    montar(() => ({ ...leitura({}), ok: false, status: 503 }));
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));

    await apagarAPrimeira();

    // A linha volta…
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));
    // …e a frase nomeia a proposta, diz porquê, e diz que ela voltou.
    expect(aviso()).toContain("Ana e Rui");
    expect(aviso()).toMatch(/não está a aceitar gravações/);
    expect(aviso()).toContain("A proposta voltou à lista.");
    expect(aviso()).not.toMatch(/Tenta novamente/);
  });

  it("com a sessão expirada manda entrar de novo, e não tentar outra vez", async () => {
    montar(() => ({ ...leitura({ error: "Não autorizado" }), ok: false, status: 401 }));
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));

    await apagarAPrimeira();

    await waitFor(() => expect(aviso()).toMatch(/sessão expirou/i));
    expect(aviso()).toMatch(/volta a entrar/i);
    expect(aviso()).toContain("A proposta voltou à lista.");
  });

  it("sem rede, diz que nada se perdeu — e que a proposta voltou", async () => {
    montar(() => {
      throw new TypeError("Failed to fetch");
    });
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));

    await apagarAPrimeira();

    await waitFor(() => expect(aviso()).toMatch(/sem ligação/i));
    expect(aviso()).toMatch(/nada se perdeu/i);
    expect(aviso()).toContain("A proposta voltou à lista.");
  });

  it("apagar com sucesso continua a tirar a linha e a não avisar de nada", async () => {
    montar(() => leitura({ ok: true }));
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));

    await apagarAPrimeira();

    await waitFor(() => expect(screen.queryByText("Ana e Rui")).toBeNull());
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });
});
