// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import EventTasks from "./EventTasks";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO FOI POSSÍVEL CRIAR A TAREFA» — SOBRE UMA TAREFA QUE FICOU CRIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `addTask` decidia o desfecho pelo CORPO da resposta:
 *
 *     const created = res.ok ? await res.json().catch(() => null) : null;
 *     if (created?.id) { … } else { toast("Não foi possível criar a tarefa…") }
 *
 * Um 201 cujo corpo não se consegue ler — um proxy pelo meio a devolver HTML, a
 * resposta cortada — caía no `else`. O servidor gravou a tarefa; o painel diz
 * que não. Quem lê carrega outra vez no botão (o formulário fica lá cheio) e
 * fica com a mesma tarefa DUAS vezes na lista do evento, que é a lista que a
 * vista global de Tarefas e a Agenda também leem.
 *
 * A frase certa é a contrária: ficou gravada, só não a conseguimos mostrar.
 *
 * A segunda metade é a nomeação. As três escritas deste painel diziam «Não foi
 * possível atualizar/criar a tarefa. Tenta novamente.» para seis situações
 * diferentes — e com a sessão expirada, «tenta novamente» não pode funcionar.
 */

const QUOTE = { id: "LIQ-1", name: "Casamento Ana & Rui" } as unknown as Quote;

const TAREFA = {
  id: "t1",
  title: "Confirmar catering",
  done: false,
  priority: "normal" as const,
  quoteId: "LIQ-1",
};

const resposta = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

/** Um 201 com um corpo que não se consegue ler — o caso do proxy pelo meio. */
const corpoIlegivel = () =>
  ({
    ok: true,
    status: 201,
    headers: new Headers(),
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetListCache();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar() {
  return render(
    <ToastProvider>
      <EventTasks quote={QUOTE} />
    </ToastProvider>,
  );
}

async function escreverTarefa(user: ReturnType<typeof userEvent.setup>, titulo: string) {
  await user.click(screen.getByRole("button", { name: /Adicionar/ }));
  await user.type(await screen.findByLabelText("Título da tarefa"), titulo);
  await user.click(screen.getByRole("button", { name: /Criar tarefa/ }));
}

describe("Tarefas do evento — a criação que passou mas não se consegue mostrar", () => {
  it("não diz que falhou uma tarefa que o servidor aceitou", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "GET" ? resposta(200, []) : corpoIlegivel(),
    );

    const user = userEvent.setup();
    montar();
    await escreverTarefa(user, "Confirmar catering");

    await waitFor(() => expect(screen.getByText(/Tarefa criada/)).toBeTruthy());
    expect(screen.getByText(/Atualiza a página/)).toBeTruthy();
    // A frase antiga mandava repetir — e repetir criava a tarefa uma segunda vez.
    expect(
      screen.queryByText(/Não foi possível criar a tarefa/),
      "dizia que não criou uma tarefa que ficou criada, e quem repete fica com ela duas vezes",
    ).toBeNull();
  });

  it("com a sessão expirada, nomeia a tarefa e manda entrar em vez de repetir", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "GET"
        ? resposta(200, [])
        : resposta(401, { error: "Não autorizado" }),
    );

    const user = userEvent.setup();
    montar();
    await escreverTarefa(user, "Confirmar catering");

    await waitFor(() => expect(screen.getByText(/sessão expirou/i)).toBeTruthy());
    expect(screen.getByText(/criar a tarefa «Confirmar catering»/)).toBeTruthy();
    expect(screen.getByText(/volta a entrar/i)).toBeTruthy();
  });

  it("uma marcação recusada volta atrás e diz de que tarefa se trata", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      (init?.method ?? "GET") === "GET" ? resposta(200, [TAREFA]) : resposta(503, {}),
    );

    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Marcar como concluída/ }));

    await waitFor(() =>
      expect(screen.getByText(/concluir a tarefa «Confirmar catering»/)).toBeTruthy(),
    );
    // E a marcação optimista desfaz-se: a caixa volta a estar por fazer.
    expect(screen.getByRole("button", { name: /Marcar como concluída/ })).toBeTruthy();
  });
});
