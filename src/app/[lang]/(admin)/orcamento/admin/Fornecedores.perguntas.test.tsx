// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Fornecedores from "./Fornecedores";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REMOVER UM FORNECEDOR DEIXA DE PASSAR PELA CAIXA DO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As razões estão por extenso no `Tarefas.perguntas.test.tsx`: a caixa do
 * browser aparece no topo do ecrã enquanto o dedo está em baixo, diz «OK» em
 * vez de dizer o que faz, não se traduz e bloqueia o fio principal.
 *
 * Aqui há uma razão a mais: o botão de remover é um «×» de 1,5 rem na ponta de
 * uma linha, ao lado do de editar. Numa lista de fornecedores num telemóvel, é
 * dos alvos onde é mais fácil acertar por engano.
 *
 * O caso que interessa é o primeiro — que o `confirm()` do browser não é
 * chamado. Sem ele, repor a caixa antiga passava os outros na mesma: num teste
 * o `confirm()` devolve `true` por omissão e a ficha desaparece à mesma.
 */

const FORNECEDOR = {
  id: "f1",
  name: "Flores do Alentejo",
  category: "Flores",
  phone: "266000000",
  email: "geral@exemplo.pt",
  location: "Évora",
  notes: "Entrega até às 10h",
};

const resposta = (ok: boolean, body: unknown = {}) =>
  ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) =>
      !init?.method || init.method === "GET" ? resposta(true, [FORNECEDOR]) : resposta(true, {}),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Desenha o ecrã e carrega no «Remover» da única ficha. */
async function pedirParaRemover(user: ReturnType<typeof userEvent.setup>) {
  render(
    <ToastProvider>
      <Fornecedores />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getAllByText("Flores do Alentejo").length).toBeGreaterThan(0));
  await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);
}

describe("a pergunta de remover um fornecedor", () => {
  it("nunca abre a caixa do browser", async () => {
    const espia = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await pedirParaRemover(user);
    expect(
      espia,
      "voltou a usar-se o `confirm()` do browser — não cabe em 375 px e aparece longe do dedo",
    ).not.toHaveBeenCalled();
  });

  it("pergunta na janela da casa, diz o nome e avisa que não se desfaz", async () => {
    const user = userEvent.setup();
    await pedirParaRemover(user);
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(/Flores do Alentejo/)).toBeTruthy();
    expect(within(caixa).getByText(/não pode ser anulada/i)).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Remover$/ })).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Cancelar$/ })).toBeTruthy();
  });

  it("cancelar deixa a ficha onde estava, e não manda nada ao servidor", async () => {
    const user = userEvent.setup();
    await pedirParaRemover(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/ }));
    expect(screen.getAllByText("Flores do Alentejo").length).toBeGreaterThan(0);
    const chamadas = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      chamadas.some((c) => (c[1] as RequestInit | undefined)?.method === "DELETE"),
      "cancelar mandou um DELETE — a pergunta não estava a segurar nada",
    ).toBe(false);
  });

  it("confirmar remove-a", async () => {
    const user = userEvent.setup();
    await pedirParaRemover(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Remover$/ }));
    await waitFor(() => expect(screen.queryByText("Flores do Alentejo")).not.toBeInTheDocument());
  });
});
