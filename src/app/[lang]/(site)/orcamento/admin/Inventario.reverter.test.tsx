// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Inventario from "./Inventario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA ALTERAÇÃO RECUSADA NÃO PODE FICAR NO ECRÃ COM AR DE GRAVADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `saveEdit` escrevia a alteração no ecrã ANTES de perguntar ao servidor
 * (optimista, como deve ser) mas, quando o servidor recusava, mostrava a
 * mensagem de erro e ficava por ali: a lista continuava a exibir os valores
 * novos. Pior — o `setData` do `useCachedList` escreve através para a cache,
 * por isso sair do inventário e voltar mostrava-os outra vez, agora sem
 * mensagem nenhuma a acompanhá-los.
 *
 * A história: ela corrige "4" para "40" arcos, o servidor recusa, ela lê o erro
 * de passagem e o ecrã continua a dizer 40. Nas vésperas do casamento carrega-se
 * a carrinha por um número que nunca chegou a existir na base de dados.
 *
 * O `remove()` do mesmo ficheiro já fazia o correcto — guarda o estado anterior
 * e repõe-no nos dois desfechos maus. Isto prende o mesmo para o `saveEdit`.
 */

const ITEM = {
  id: "i1",
  name: "Arco de flores",
  category: "Decoração",
  quantity: 4,
  unit: "un",
  condition: "bom" as const,
  location: "Armazém",
  notes: "",
};

const ok = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  }) as unknown as Response;

const recusa = () =>
  ({
    ok: false,
    status: 500,
    headers: new Headers(),
    json: async () => ({ error: "não deu" }),
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetListCache();
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "PATCH") return recusa();
    return ok([ITEM]);
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar() {
  return render(
    <ToastProvider>
      <Inventario />
    </ToastProvider>,
  );
}

/** Abrir a edição da primeira linha e pôr `quantidade` no valor pedido. */
async function editarQuantidadePara(user: ReturnType<typeof userEvent.setup>, valor: string) {
  // Os dois desenhos (cartões no telemóvel, tabela no computador) estão ambos
  // no DOM — só o CSS os separa. Trabalhamos com o primeiro.
  await user.click(screen.getAllByRole("button", { name: "Editar" })[0]);
  const qtd = screen.getAllByLabelText("Quantidade")[0];
  await user.clear(qtd);
  await user.type(qtd, valor);
  await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
}

describe("Inventário — o servidor recusa a alteração", () => {
  it("repõe o valor anterior no ecrã em vez de deixar lá o novo", async () => {
    const user = userEvent.setup();
    montar();
    await waitFor(() => expect(screen.getAllByText("Arco de flores").length).toBeGreaterThan(0));

    await editarQuantidadePara(user, "40");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PATCH")).toBe(
        true,
      ),
    );

    // A edição fica aberta de propósito (o que ela escreveu não se perde), por
    // isso a linha ainda mostra o formulário. Fechamo-lo para ler a lista.
    await user.click(screen.getAllByRole("button", { name: "Cancelar" })[0]);

    // O "40" que nunca chegou a existir na base de dados não pode ficar aqui.
    expect(screen.queryAllByText("40")).toHaveLength(0);
    expect(screen.getAllByText("4").length).toBeGreaterThan(0);
  });

  it("não deixa a alteração recusada gravada na cache: sair e voltar mostra o valor verdadeiro", async () => {
    const user = userEvent.setup();
    const vista = montar();
    await waitFor(() => expect(screen.getAllByText("Arco de flores").length).toBeGreaterThan(0));

    await editarQuantidadePara(user, "40");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PATCH")).toBe(
        true,
      ),
    );

    // Sair da vista e voltar. A cache do `useCachedList` sobrevive à
    // desmontagem, e é ela que desenha antes de a revalidação responder.
    vista.unmount();
    montar();

    expect(
      screen.queryAllByText("40"),
      "a cache guardou uma alteração que o servidor recusou",
    ).toHaveLength(0);
  });
});
