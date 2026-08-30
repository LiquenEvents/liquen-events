// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ELIMINAR UMA TAREFA DEIXA DE PASSAR PELA CAIXA DO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava aqui era `confirm('Eliminar a tarefa "X"?')`. Parece inofensivo
 * e não é, no aparelho em que ela trabalha:
 *
 *   · A caixa aparece no TOPO do ecrã. O dedo dela está em baixo, na linha em
 *     que acabou de tocar — e num telemóvel de 375 px o caminho de ida e volta
 *     é o ecrã inteiro.
 *   · Diz «OK». «OK» não diz o que vai acontecer; «Eliminar» diz.
 *   · Não se traduz, não leva nada lá dentro, e não se parece com nada do
 *     resto do painel.
 *   · Bloqueia o fio principal do browser enquanto está aberta.
 *
 * Passa a ser a janela da casa — folha inferior no telemóvel, ao pé do polegar,
 * diálogo centrado no computador.
 *
 * ── O QUE ESTE FICHEIRO GUARDA ────────────────────────────────────────────
 *
 * O caso que interessa é o PRIMEIRO: que o `confirm()` do browser não é
 * chamado. Sem ele, alguém pode repor a caixa antiga e os outros casos passam
 * na mesma — porque o `confirm()` num teste devolve `true` por omissão e a
 * tarefa desaparece à mesma.
 */

const TAREFA = {
  id: "t1",
  title: "Ligar à florista",
  done: false,
  priority: "normal" as const,
  createdAt: "2026-08-10T10:00:00.000Z",
};

const resposta = (ok: boolean, body: unknown = {}) =>
  ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(
        !init?.method || init.method === "GET" ? resposta(true, [TAREFA]) : resposta(true, {}),
      ),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Desenha o ecrã e carrega no «Eliminar» da única linha. */
async function pedirParaEliminar(user: ReturnType<typeof userEvent.setup>) {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Ligar à florista")).toBeInTheDocument());
  const linha = screen.getByText("Ligar à florista").closest("div.group")!;
  await user.click(linha.querySelector('[aria-label="Eliminar"]') as HTMLElement);
}

describe("a pergunta de eliminar uma tarefa", () => {
  it("nunca abre a caixa do browser", async () => {
    const espia = vi.spyOn(window, "confirm").mockReturnValue(true);
    const user = userEvent.setup();
    await pedirParaEliminar(user);
    expect(
      espia,
      "voltou a usar-se o `confirm()` do browser — não cabe em 375 px e aparece longe do dedo",
    ).not.toHaveBeenCalled();
  });

  it("pergunta na janela da casa, e diz de que tarefa se trata", async () => {
    const user = userEvent.setup();
    await pedirParaEliminar(user);
    const caixa = await screen.findByRole("dialog");
    // O nome da tarefa na pergunta: sem ele, ela tem de se lembrar em qual
    // linha tocou — e numa lista de dezoito é exactamente o que não acontece.
    expect(within(caixa).getByText(/Ligar à florista/)).toBeTruthy();
    // O verbo no botão, e não «OK».
    expect(within(caixa).getByRole("button", { name: /^Eliminar$/ })).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Cancelar$/ })).toBeTruthy();
  });

  it("cancelar deixa a tarefa onde estava", async () => {
    const user = userEvent.setup();
    await pedirParaEliminar(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/ }));
    expect(screen.getByText("Ligar à florista")).toBeInTheDocument();
    // E nenhum pedido de eliminação chegou a sair.
    const chamadas = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
    expect(
      chamadas.some((c) => (c[1] as RequestInit | undefined)?.method === "DELETE"),
      "cancelar mandou um DELETE — a pergunta não estava a segurar nada",
    ).toBe(false);
  });

  it("confirmar elimina-a", async () => {
    const user = userEvent.setup();
    await pedirParaEliminar(user);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Eliminar$/ }));
    await waitFor(() => expect(screen.queryByText("Ligar à florista")).not.toBeInTheDocument());
  });
});
