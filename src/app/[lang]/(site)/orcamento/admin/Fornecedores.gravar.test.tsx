// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Fornecedores from "./Fornecedores";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ QUE GRAVAVA E NUNCA PERGUNTAVA SE O SERVIDOR TINHA ACEITADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As três escritas dos Fornecedores mandavam o pedido e seguiam: sem `res.ok`,
 * sem `catch`, sem aviso. E como o `setData` do `useCachedList` escreve através
 * para a cache de módulo, a alteração recusada sobrevivia a mudar de separador
 * e voltar — parecia gravada até ao recarregamento seguinte, onde nunca tinha
 * existido.
 *
 * O percurso é o mais banal que há: a sessão expira (ela deixa o back office
 * aberto horas seguidas), ela corrige as notas de um fornecedor, o pedido leva
 * 401, e o ecrã mostra o texto novo como se estivesse guardado.
 *
 * Era o único ecrã de escrita fora do padrão que os outros seis já usam.
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

const ok = (body: unknown) =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => body,
  }) as unknown as Response;

/** Uma sessão expirada: 401 com corpo, exactamente como a rota responde. */
const semSessao = () =>
  ({
    ok: false,
    status: 401,
    headers: new Headers(),
    json: async () => ({ error: "Não autorizado" }),
  }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetListCache();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method && init.method !== "GET") return semSessao();
    return ok([FORNECEDOR]);
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
      <Fornecedores />
    </ToastProvider>,
  );
}

async function editarNotasPara(user: ReturnType<typeof userEvent.setup>, texto: string) {
  await user.click(screen.getAllByRole("button", { name: "Editar" })[0]);
  const notas = screen.getAllByLabelText("Notas")[0];
  await user.clear(notas);
  await user.type(notas, texto);
  await user.click(screen.getAllByRole("button", { name: "Guardar" })[0]);
}

describe("Fornecedores — o servidor recusa a escrita", () => {
  it("uma alteração recusada não fica no ecrã com ar de gravada", async () => {
    const user = userEvent.setup();
    montar();
    await waitFor(() =>
      expect(screen.getAllByText("Flores do Alentejo").length).toBeGreaterThan(0),
    );

    await editarNotasPara(user, "Factura a 60 dias");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PATCH")).toBe(
        true,
      ),
    );

    // A falha é DITA — sem isto ela fecha o portátil convencida de que gravou.
    expect(await screen.findByText(/Não foi possível guardar as alterações/)).toBeInTheDocument();
    // E a edição fica ABERTA: o que ela escreveu não se perde.
    expect(screen.getAllByLabelText("Notas")[0]).toHaveValue("Factura a 60 dias");
  });

  it("a alteração recusada também não fica gravada na cache", async () => {
    const user = userEvent.setup();
    const vista = montar();
    await waitFor(() =>
      expect(screen.getAllByText("Flores do Alentejo").length).toBeGreaterThan(0),
    );

    await editarNotasPara(user, "Factura a 60 dias");
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((c) => (c[1] as RequestInit)?.method === "PATCH")).toBe(
        true,
      ),
    );

    // Sair da vista e voltar: a cache do `useCachedList` sobrevive à
    // desmontagem, e é ela que desenha antes de a revalidação responder.
    vista.unmount();
    montar();

    expect(await screen.findByText(/Entrega até às 10h/)).toBeInTheDocument();
    expect(screen.queryByText(/Factura a 60 dias/)).not.toBeInTheDocument();
  });

  it("apagar um fornecedor que o servidor recusa devolve-o à lista", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    montar();
    await waitFor(() =>
      expect(screen.getAllByText("Flores do Alentejo").length).toBeGreaterThan(0),
    );

    await user.click(screen.getAllByRole("button", { name: "Remover" })[0]);

    expect(await screen.findByText(/Não foi possível remover o fornecedor/)).toBeInTheDocument();
    // Um fornecedor que continua na base de dados não pode desaparecer do ecrã:
    // ela deixa de o ver, deixa de lhe ligar, e ninguém percebe porquê.
    expect(screen.getAllByText("Flores do Alentejo").length).toBeGreaterThan(0);
  });
});
