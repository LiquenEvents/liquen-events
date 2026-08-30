// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR UMA PROPOSTA DEIXA DE PASSAR PELA CAIXA DO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As razões gerais estão no `Tarefas.perguntas.test.tsx`. Aqui o que está em
 * jogo é maior: uma proposta é o trabalho de uma tarde, e apagá-la não se
 * desfaz.
 *
 * ── O QUE FICA POR CONVERTER NESTE ECRÃ, E PORQUÊ ─────────────────────────
 *
 * O `confirm()` de «marcar como aceite / recusada» continua lá, de propósito.
 * A `ui/PerguntaDestrutiva` pinta o botão de vermelho — é o que ela é, está
 * escrito no cabeçalho dela: a pergunta de um gesto que apaga. Marcar uma
 * proposta como ACEITE é o contrário disso: é o melhor momento do mês, e um
 * botão vermelho a dizer «Aceitar» seria um aviso onde devia estar uma boa
 * notícia.
 *
 * Isso não se resolve com uma substituição, resolve-se com uma decisão de
 * desenho — uma variante calma da pergunta, ou outra janela. Fica por fazer, e
 * fica dito aqui em vez de ficar meio feito.
 */

const PROPOSTA = {
  id: "p1",
  quoteId: "LQ-001",
  clientName: "Ana e Rui",
  total: 12000,
  status: "pendente" as const,
  createdAt: "2026-08-01T09:00:00.000Z",
  updatedAt: "2026-08-01T09:00:00.000Z",
};

const resposta = (ok: boolean, body: unknown = {}) =>
  ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      !init?.method || init.method === "GET" ? resposta(true, [PROPOSTA]) : resposta(true, {}),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Desenha o ecrã, abre o menu da linha e carrega em «Apagar». */
async function pedirParaApagar(user: ReturnType<typeof userEvent.setup>) {
  render(
    <ToastProvider>
      <Propostas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getAllByText(/Ana e Rui/).length).toBeGreaterThan(0));
  await user.click(screen.getAllByRole("button", { name: /Acções de Ana e Rui/ })[0]);
  await user.click(screen.getAllByRole("menuitem", { name: "Apagar" })[0]);
}

describe("a pergunta de apagar uma proposta", () => {
  it("nunca abre a caixa do browser", async () => {
    const espia = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await pedirParaApagar(user);
    expect(
      espia,
      "voltou a usar-se o `confirm()` do browser para apagar uma proposta",
    ).not.toHaveBeenCalled();
  });

  it("pergunta na janela da casa, diz de quem é e avisa que não se desfaz", async () => {
    const user = userEvent.setup();
    await pedirParaApagar(user);
    const caixa = await screen.findByRole("dialog");
    // Numa lista de dezenas de propostas, o nome é a única coisa que diz em
    // qual linha ela tocou.
    expect(within(caixa).getByText(/Ana e Rui/)).toBeTruthy();
    expect(within(caixa).getByText(/não pode ser anulada/i)).toBeTruthy();
    // O verbo repetido, e não «Confirmar».
    expect(within(caixa).getByRole("button", { name: /^Apagar a proposta$/ })).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Cancelar$/ })).toBeTruthy();
  });

  it("cancelar deixa a proposta na lista, e não manda nada ao servidor", async () => {
    const user = userEvent.setup();
    await pedirParaApagar(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/ }));
    expect(screen.getAllByText(/Ana e Rui/).length).toBeGreaterThan(0);
    const chamadas = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      chamadas.some((c) => (c[1] as RequestInit | undefined)?.method === "DELETE"),
      "cancelar mandou um DELETE — a pergunta não estava a segurar nada",
    ).toBe(false);
  });

  it("confirmar apaga-a", async () => {
    const user = userEvent.setup();
    await pedirParaApagar(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Apagar a proposta$/ }));
    await waitFor(() => expect(screen.queryByText(/Ana e Rui/)).not.toBeInTheDocument());
  });
});
