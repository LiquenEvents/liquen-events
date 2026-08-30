// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA GRAVAÇÃO RECUSADA NÃO PODE DESFAZER AS OUTRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Cada escrita deste ecrã guardava a LISTA INTEIRA antes de partir e, ao
 * falhar, repunha-a tal e qual. Enquanto um pedido lento está a caminho ela não
 * fica parada — risca outra tarefa, que grava bem. Quando o primeiro pedido
 * volta com erro, o `setTasks(instantâneo)` apaga também o risco da segunda: a
 * tarefa desmarca-se sozinha no ecrã, apesar de estar concluída no servidor.
 *
 * É exactamente o desfecho que o `touch` do `tasks-store` existe para impedir
 * do lado do servidor — só que aqui acontecia sem servidor nenhum pelo meio, e
 * o passo seguinte é ela voltar a clicar e desmarcá-la a sério.
 */

const A = {
  id: "a",
  title: "Confirmar catering",
  done: false,
  priority: "normal" as const,
  createdAt: "2026-08-10T09:00:00.000Z",
};
const B = {
  id: "b",
  title: "Ligar à florista",
  done: false,
  priority: "normal" as const,
  createdAt: "2026-08-10T10:00:00.000Z",
};

const resposta = (ok: boolean, body: unknown = {}) =>
  ({ ok, status: ok ? 200 : 500, headers: new Headers(), json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let recusarGravacaoDeA: () => void;

beforeEach(() => {
  __resetListCache();
  const patchDeA = new Promise<Response>((resolve) => {
    recusarGravacaoDeA = () => resolve(resposta(false, { error: "Erro interno" }));
  });
  fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (!init?.method || init.method === "GET") return Promise.resolve(resposta(true, [A, B]));
    if (url.endsWith("/a")) return patchDeA; // fica pendente até o teste a recusar
    return Promise.resolve(resposta(true, {}));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O quadrado de riscar da linha com este título (é o primeiro botão da linha). */
function caixaDe(titulo: string): HTMLElement {
  const linha = screen.getByText(titulo).closest("div.group");
  const botao = linha?.querySelector("button");
  if (!botao) throw new Error(`Sem caixa de riscar para "${titulo}"`);
  return botao as HTMLElement;
}

describe("Tarefas — reposição depois de uma gravação recusada", () => {
  it("uma tarefa riscada com sucesso continua riscada quando OUTRA gravação falha", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Tarefas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Confirmar catering")).toBeInTheDocument());

    // 1. Alterar o título da tarefa A — o pedido fica a meio caminho.
    await user.click(screen.getAllByRole("button", { name: "Editar tarefa" })[0]);
    const campo = screen.getByDisplayValue("Confirmar catering");
    await user.clear(campo);
    await user.type(campo, "Confirmar catering — 60 pax");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // 2. Entretanto ela risca a tarefa B, e ESSA grava bem.
    await user.click(caixaDe("Ligar à florista"));
    expect(await screen.findByRole("button", { name: /Concluídas \(1\)/ })).toBeInTheDocument();

    // 3. Só agora o servidor recusa a alteração de A.
    recusarGravacaoDeA();
    // O aviso nomeia a tarefa (e é um 500, portanto diz que o servidor é que
    // está em baixo): numa lista de dezasseis linhas, «Não foi possível guardar
    // as alterações» não diz o que ficou por gravar.
    const aviso = await screen.findByText(/não está a aceitar gravações/);
    expect(aviso).toHaveTextContent("Confirmar catering");

    // O título de A volta ao que era — isso é a reposição a fazer o seu trabalho.
    expect(screen.getByText("Confirmar catering")).toBeInTheDocument();
    // Mas a tarefa B tem de ficar onde ficou: está concluída no servidor.
    expect(screen.getByRole("button", { name: /Concluídas \(1\)/ })).toBeInTheDocument();
    expect(screen.getByText("A fazer (1)")).toBeInTheDocument();
  });

  it("uma tarefa eliminada com sucesso não regressa quando OUTRA gravação falha", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(
      <ToastProvider>
        <Tarefas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Confirmar catering")).toBeInTheDocument());

    // A gravação lenta de A (mudança de título) parte primeiro…
    await user.click(screen.getAllByRole("button", { name: "Editar tarefa" })[0]);
    const campo = screen.getByDisplayValue("Confirmar catering");
    await user.clear(campo);
    await user.type(campo, "Confirmar catering — 60 pax");
    await user.click(screen.getByRole("button", { name: "Guardar" }));

    // … e, à espera dela, a tarefa B é eliminada com sucesso.
    //
    // Eliminar deixou de ser um clique: passa pela pergunta da casa
    // (`ui/PerguntaDestrutiva`), em vez do `confirm()` do browser que não cabe
    // num ecrã de 375 px. O que este teste mede — a corrida entre a gravação
    // lenta de A e a eliminação de B — não muda; muda o caminho até lá.
    const linhaB = screen.getByText("Ligar à florista").closest("div.group")!;
    await user.click(linhaB.querySelector('[aria-label="Eliminar"]') as HTMLElement);
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Eliminar$/ }));
    await waitFor(() => expect(screen.queryByText("Ligar à florista")).not.toBeInTheDocument());

    recusarGravacaoDeA();
    const aviso = await screen.findByText(/não está a aceitar gravações/);
    expect(aviso).toHaveTextContent("Confirmar catering");

    // Uma tarefa que já não existe na base de dados não pode ressuscitar no ecrã.
    expect(screen.queryByText("Ligar à florista")).not.toBeInTheDocument();
  });
});
