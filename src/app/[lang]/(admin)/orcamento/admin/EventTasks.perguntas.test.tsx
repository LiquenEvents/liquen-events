// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, Task } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import EventTasks from "./EventTasks";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * `window.confirm('Eliminar a tarefa "X"?')` — metade de uma pergunta
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nomeava a tarefa, o que já era mais do que a maioria fazia. Ficava-se por aí:
 * não dizia o que ia atrás dela — a prioridade, a data limite, quem tinha
 * ficado com ela — nem que a tarefa desaparece TAMBÉM da lista global, da
 * Agenda e dos Lembretes, que leem esta mesma lista. E era a caixa do sistema,
 * que num telemóvel de 375 px não cabe, não se traduz e bloqueia o browser.
 *
 * Pergunta e não janela para anular, de propósito: repor uma tarefa apagada
 * seria criar OUTRA, com outro id — um «Anular» que não devolve a mesma coisa é
 * pior do que não haver nenhum.
 */

const TAREFAS: Task[] = [
  {
    id: "t1",
    title: "Confirmar catering",
    done: false,
    priority: "alta",
    dueDate: "2026-09-03",
    assignee: "Catarina",
    quoteId: "LIQ-9",
    area: "Produção",
  } as unknown as Task,
  { id: "t2", title: "Comprar velas", done: false, priority: "normal", quoteId: "LIQ-9" } as Task,
];

const QUOTE = { id: "LIQ-9", name: "Casamento Ana & Rui" } as unknown as Quote;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

let chamadas: { metodo: string; url: string }[] = [];

function servidor() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    chamadas.push({ metodo, url: String(url) });
    if (metodo === "GET") return reply(200, TAREFAS);
    return reply(200, { ok: true });
  });
}

async function abrirAPergunta(user: ReturnType<typeof userEvent.setup>) {
  render(<EventTasks quote={QUOTE} />);
  const linha = (await screen.findByText("Confirmar catering")).closest("div.group") as HTMLElement;
  await user.click(within(linha).getByRole("button", { name: /^Remover tarefa$/i }));
  return screen.findByRole("dialog");
}

beforeEach(() => {
  __resetListCache();
  chamadas = [];
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Tarefas do evento — eliminar uma tarefa", () => {
  it("a pergunta nomeia a tarefa e enumera o que vai atrás dela", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);

    expect(within(caixa).getByText(/Eliminar a tarefa «Confirmar catering»\?/i)).toBeTruthy();
    expect(within(caixa).getByText(/está por fazer, prioridade alta/i)).toBeTruthy();
    expect(within(caixa).getByText(/3 de setembro/i)).toBeTruthy();
    expect(within(caixa).getByText(/Catarina/)).toBeTruthy();
    // E o número: quantas ficam, e onde é que a tarefa também desaparece.
    expect(
      within(caixa).getByText(/lista global de tarefas — ficam 1 tarefa em «Casamento Ana & Rui»/i),
    ).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Eliminar a tarefa$/i })).toBeTruthy();
  });

  it("cancelar não escreve nada", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chamadas.filter((c) => c.metodo === "DELETE")).toEqual([]);
    expect(screen.getByText("Confirmar catering")).toBeTruthy();
  });

  it("responder que sim elimina mesmo", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Eliminar a tarefa$/i }));

    await waitFor(() =>
      expect(chamadas.some((c) => c.metodo === "DELETE" && c.url.endsWith("/t1"))).toBe(true),
    );
  });
});
