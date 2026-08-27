// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, Task } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import EventTasks from "./EventTasks";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SEPARADOR DO PEDIDO E A LISTA GLOBAL LEEM A MESMA CAIXA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `EventTasks` fazia `fetch("/api/tarefas")` por conta própria, fora da cache
 * partilhada (`useCachedList`) que a vista global de Tarefas, a Agenda e os
 * Lembretes já usam para a mesma lista. Isto prende duas coisas:
 *
 *   · abrir um pedido com a lista já quente desenha logo, sem passar pelo
 *     esqueleto de carregamento (a mesma chave "tarefas" serve os dois
 *     lados, e o `useCachedList` mostra a cache na hora);
 *   · marcar/criar/apagar uma tarefa aqui tem de passar pela cache
 *     partilhada (`setData`), senão a vista global (aberta a seguir, já
 *     que o back office só monta cada vista enquanto está activa) mostra a
 *     versão antiga.
 *
 * O servidor aqui é um duplo COM ESTADO (guarda o `done` entre pedidos): sem
 * isso, a revalidação em segundo plano que o `useCachedList` sempre faz ao
 * montar reporia o «por fazer» de origem e o teste ficava a testar o duplo,
 * não o componente.
 */

const QUOTE = { id: "LIQ-1", name: "Casamento Ana & Rui" } as unknown as Quote;

let tarefa: Task;

beforeEach(() => {
  __resetListCache();
  tarefa = {
    id: "t1",
    title: "Confirmar catering",
    done: false,
    priority: "alta",
    quoteId: "LIQ-1",
    createdAt: "2026-08-10T09:00:00.000Z",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (init?.method === "PATCH" && u === `/api/tarefas/${tarefa.id}`) {
        const body = JSON.parse(String(init.body)) as Partial<Task>;
        tarefa = { ...tarefa, ...body };
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => tarefa,
        } as Response;
      }
      if (u === "/api/tarefas") {
        return {
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => [tarefa],
        } as Response;
      }
      return { ok: true, status: 200, headers: new Headers(), json: async () => [] } as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("EventTasks lê a cache partilhada", () => {
  it("desenha logo, sem esqueleto, quando a lista já está quente", async () => {
    // A lista global aquece a cache primeiro (é o que o AdminClient já faz em
    // ociosidade, via `prefetchList`).
    render(
      <ToastProvider>
        <Tarefas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Confirmar catering")).toBeTruthy());
    cleanup();

    // Abrir o pedido, com a cache já quente: o título aparece já na primeira
    // pintura, sem passar pelo esqueleto. Uma leitura própria (fora da cache)
    // começava sempre vazia.
    const { container } = render(
      <ToastProvider>
        <EventTasks quote={QUOTE} />
      </ToastProvider>,
    );
    expect(screen.getByText("Confirmar catering")).toBeTruthy();
    expect(container.querySelector(".bo-skeleton")).toBeNull();
  });
});

describe("as escritas feitas aqui não se perdem para a lista global", () => {
  /**
   * O PATCH e o GET seguintes ficam PRESOS de propósito, e nunca se soltam
   * neste teste: se a lista global só viesse a saber da marcação quando a
   * rede respondesse, isto provaria pouco (a rede acaba sempre por dizer a
   * verdade). O que importa é o instante ANTES disso: o `setData`
   * optimista escreve na cache partilhada antes mesmo de o `fetch` do PATCH
   * ter resposta, e é só essa escrita, síncrona, que uma vista global aberta
   * a seguir, sem rede nenhuma ainda ter respondido, pode estar a ler.
   */
  it("marcar uma tarefa aqui fica visível na lista global antes de a rede responder a nada", async () => {
    let soltarPatch: (() => void) | undefined;
    const patchPreso = new Promise<void>((resolve) => {
      soltarPatch = resolve;
    });
    let pedidosDeGet = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === "PATCH" && u === `/api/tarefas/${tarefa.id}`) {
          await patchPreso; // nunca se solta neste teste
          return { ok: true, status: 200, headers: new Headers(), json: async () => tarefa };
        }
        if (u === "/api/tarefas") {
          pedidosDeGet += 1;
          // O primeiro GET (a leitura inicial do EventTasks) responde logo;
          // os seguintes ficam presos, para a segunda montagem não poder
          // resolver a pergunta pela rede.
          if (pedidosDeGet > 1) await new Promise(() => {}); // nunca resolve
          return { ok: true, status: 200, headers: new Headers(), json: async () => [tarefa] };
        }
        return { ok: true, status: 200, headers: new Headers(), json: async () => [] };
      }),
    );

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <EventTasks quote={QUOTE} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Confirmar catering")).toBeTruthy());

    // Clica e NÃO espera pelo `fetch` (que está preso): só o que aconteceu de
    // forma síncrona, antes do `await` do PATCH, é que está em jogo.
    await user.click(screen.getByRole("button", { name: "Marcar como concluída" }));

    // A lista global abre a seguir (o padrão real do back office: só a vista
    // activa fica montada). O GET dela também está preso, por isso só pode
    // estar a mostrar o que já estava na cache partilhada no instante em que
    // montou.
    render(
      <ToastProvider>
        <Tarefas />
      </ToastProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /Concluídas/ }));
    const concluir = await screen.findByRole("button", { name: "Marcar como por concluir" });
    expect(concluir.getAttribute("aria-pressed")).toBe("true");

    soltarPatch?.();
  });
});
