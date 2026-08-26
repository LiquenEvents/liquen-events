// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESFAZER UMA REMOÇÃO NÃO PODE RESSUSCITAR OUTRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `remove()` do catálogo tirava a linha do ecrã e, se o servidor recusasse,
 * repunha a lista INTEIRA como estava antes de carregar:
 *
 *     const antes = items;          // ← a lista como estava neste desenho
 *     setItems((prev) => prev.filter(…));
 *     …
 *     catch { setItems(antes); }    // ← e agora, depois de dois `await`
 *
 * Esse `antes` foi lido antes do `await`, e é a lista de um instante que já
 * passou. Com duas remoções a caminho ao mesmo tempo — e há como as pôr no ar
 * seguidas, porque a pergunta fecha assim que se responde e não espera pelo
 * servidor — a que falha repõe o mundo anterior às DUAS e traz de volta a que o
 * servidor já tinha apagado.
 *
 * O resultado é um catálogo que afirma haver material que já não existe. E como
 * o `setData` do `useCachedList` escreve através para a cache, o fantasma
 * sobrevive a mudar de separador e voltar: fica lá até se recarregar a página.
 *
 * A reversão certa é sobre o que a lista tiver AGORA, e devolve só a linha que
 * falhou.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const base = {
  category: "Ferramentas",
  kind: "reutilizavel" as const,
  unit: "un",
  stock: 2,
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const ESCADOTE = { ...base, id: "i1", name: "Escadote 3 degraus" };
const FITA = { ...base, id: "i2", name: "Fita-cola americana" };

beforeEach(() => {
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Catálogo — duas remoções ao mesmo tempo", () => {
  it("a que falha não traz de volta a que o servidor apagou", async () => {
    // O apagamento do escadote fica pendurado e só depois recusa; o da fita-cola
    // responde logo que sim. É a corrida de dois cliques seguidos.
    let recusarEscadote: (() => void) | null = null;
    const escadotePendente = new Promise<Response>((resolve) => {
      recusarEscadote = () => resolve(reply(500, { error: "não deu" }));
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return String(url).endsWith("/i1") ? escadotePendente : reply(200, { ok: true });
        }
        return reply(200, [ESCADOTE, FITA]);
      }),
    );

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Material />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Escadote 3 degraus")).toBeTruthy());

    const removerDe = (nome: string) =>
      screen
        .getByText(nome)
        .closest("li")!
        .querySelector("button:last-of-type") as HTMLButtonElement;

    // A remoção pergunta antes (ver `Material.perguntas.test.tsx`); aqui
    // responde-se que sim às duas, seguidas.
    const confirmar = async () => {
      const caixa = await screen.findByRole("dialog");
      await user.click(within(caixa).getByRole("button", { name: /^Remover do catálogo$/i }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    };

    await user.click(removerDe("Escadote 3 degraus"));
    await confirmar();
    await user.click(removerDe("Fita-cola americana"));
    await confirmar();
    await waitFor(() => expect(screen.queryByText("Fita-cola americana")).toBeNull());

    // Só agora o servidor recusa o primeiro apagamento.
    recusarEscadote!();

    // O escadote volta — está certo, o servidor recusou-o.
    await waitFor(() => expect(screen.getByText("Escadote 3 degraus")).toBeTruthy());
    // A fita-cola NÃO pode voltar: essa foi mesmo apagada.
    expect(
      screen.queryByText("Fita-cola americana"),
      "o catálogo voltou a afirmar que existe material que já foi apagado",
    ).toBeNull();
  });
});
