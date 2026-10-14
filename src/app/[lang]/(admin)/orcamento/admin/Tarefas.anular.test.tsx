// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * R2b — «ANULAR» NAS TAREFAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10, `docs/TUDO-REVERSIVEL.md`). Criar uma tarefa anula-se
 * APAGANDO a que se criou — nada aponta ainda para ela.
 */

const TAREFA = {
  id: "t1",
  title: "Confirmar a tenda",
  done: false,
  priority: "normal" as const,
  createdAt: "2026-08-10T09:00:00.000Z",
};

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

let escritas: { url: string; method: string }[] = [];

beforeEach(() => {
  __resetListCache();
  escritas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (String(url).includes("/api/admin/equipa")) return resposta({ ok: true, nomes: [] });
      if (method === "GET") return resposta([TAREFA]);
      escritas.push({ url: String(url), method });
      if (method === "POST") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        return resposta({ ...TAREFA, ...body, id: "nova" });
      }
      return resposta({ ok: true });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Anular» nas tarefas", () => {
  it("criar uma tarefa anula-se apagando-a", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Tarefas />
      </ToastProvider>,
    );
    await screen.findByText(TAREFA.title);
    fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
    const campo = await screen.findByLabelText("Nova tarefa");
    await user.type(campo, "Levar as extensões{Enter}");
    expect(await screen.findByText(/Tarefa «Levar as extensões» criada/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas.map((e) => e.method)).toEqual(["POST", "DELETE"]));
    expect(escritas[1].url).toContain("nova");
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });
});
