// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Proposal } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Acompanhamento from "./Acompanhamento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NOVE GESTOS QUE DESFAZIAM O ECRÃ EM SILÊNCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Todos os gestos deste painel são optimistas: a linha muda no clique e o
 * servidor é ouvido depois. Quando ele recusa, a linha VOLTA — e o aviso dizia
 * sempre «Não foi possível gravar. Verifica a ligação.»
 *
 * A mesma frase para a rede em baixo, a sessão expirada, a proposta apagada por
 * outra pessoa e o servidor em baixo; e nem uma palavra sobre a etiqueta que
 * ela acabou de ver voltar de «Aceite» para «Enviada». Marcar um negócio como
 * ganho e ver a marca desaparecer meio segundo depois, com um aviso que fala de
 * ligações, parece o ecrã a portar-se mal — não uma gravação que não ficou.
 *
 * Que a reversão ACONTECE já está preso noutro sítio (ver «duas gravações ao
 * mesmo tempo», em `Acompanhamento.test.tsx`). O que se prende aqui é que ela
 * é DITA.
 */

function proposta(over: Partial<Proposal> = {}): Proposal {
  return {
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
    ...over,
  };
}

const leitura = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: `W/"${Math.random()}"` }),
  json: async () => body,
});

/** As leituras respondem sempre; a gravação responde o que o teste disser. */
function montar(gravacao: () => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") return gravacao();
      return leitura(String(url).startsWith("/api/propostas") ? [proposta()] : []);
    }),
  );
  return render(
    <ToastProvider>
      <Acompanhamento quotes={[]} />
    </ToastProvider>,
  );
}

/** O botão de estado da linha de um casal (há um par de botões por linha). */
function botao(cliente: string, rotulo: string): HTMLElement {
  const linha = screen.getByText(cliente).closest("div.rounded-2xl") as HTMLElement;
  return within(linha).getByRole("button", { name: rotulo });
}

const aviso = () => screen.getByRole("alert").textContent ?? "";

beforeEach(() => {
  // A cache do `useCachedList` vive no MÓDULO e sobreviveria de um teste para o
  // outro — cada um tem de começar da mesma folha.
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Acompanhamento — um estado que o servidor recusa", () => {
  it("repõe a linha E diz para onde ela voltou", async () => {
    montar(() => ({ ...leitura({}), ok: false, status: 503 }));
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(botao("Ana e Rui", "Aceite"));

    // A linha volta a «Enviada»…
    await waitFor(() =>
      expect(botao("Ana e Rui", "Enviada").getAttribute("aria-pressed")).toBe("true"),
    );
    // …e a frase nomeia a proposta, diz porquê, e diz que a linha recuou.
    expect(aviso()).toContain("Ana e Rui");
    expect(aviso()).toMatch(/não está a aceitar gravações/);
    expect(aviso()).toContain("A linha voltou a «Enviada».");
    expect(aviso()).not.toMatch(/^Não foi possível gravar/);
  });

  it("com a sessão expirada manda entrar de novo, e não repetir", async () => {
    montar(() => ({ ...leitura({ error: "Não autorizado" }), ok: false, status: 401 }));
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(botao("Ana e Rui", "Em negociação"));

    await waitFor(() => expect(aviso()).toMatch(/sessão expirou/i));
    // Repetir o clique não pode funcionar aqui — a instrução tem de ser outra.
    expect(aviso()).toMatch(/volta a entrar/i);
    expect(aviso()).toContain("A linha voltou a «Enviada».");
  });

  it("uma proposta apagada por outra pessoa manda recarregar, e diz que a linha recuou", async () => {
    montar(() => ({ ...leitura({}), ok: false, status: 404 }));
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(botao("Ana e Rui", "Aceite"));

    await waitFor(() => expect(aviso()).toMatch(/já não existe/i));
    expect(aviso()).toMatch(/recarrega a página/i);
    expect(aviso()).toContain("A linha voltou a «Enviada».");
  });

  it("sem rede, diz que nada se perdeu — e continua a dizer que a linha recuou", async () => {
    montar(() => {
      throw new TypeError("Failed to fetch");
    });
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(botao("Ana e Rui", "Aceite"));

    await waitFor(() => expect(aviso()).toMatch(/sem ligação/i));
    expect(aviso()).toMatch(/nada se perdeu/i);
    expect(aviso()).toContain("A linha voltou a «Enviada».");
  });

  it("uma gravação que passa não avisa de nada", async () => {
    montar(() => leitura({ ...proposta(), status: "aceite" }));
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(botao("Ana e Rui", "Aceite"));

    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Aceite/));
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });
});
