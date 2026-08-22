// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Fornecedores from "./Fornecedores";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA GRAVAÇÃO RECUSADA NÃO PODE DESFAZER AS OUTRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `patchSupplier` (e o `remove`) guardavam a LISTA INTEIRA antes de partir e,
 * ao falhar, repunham-na tal e qual. Enquanto um PATCH lento está a caminho ela
 * não fica parada — marca outro fornecedor como preferido, e esse grava bem.
 * Quando o primeiro volta com erro, o `setSuppliers(instantâneo)` apaga também
 * a estrela do segundo: o ecrã fica a dizer uma coisa e a base de dados outra,
 * e como o `setData` do `useCachedList` escreve através para a cache, a versão
 * errada sobrevive a mudar de separador e voltar.
 *
 * O que se repõe agora é a FICHA em causa, não a lista.
 */

const FLORES = {
  id: "f1",
  name: "Flores do Alentejo",
  category: "Flores",
  phone: "266000000",
  email: "geral@exemplo.pt",
  location: "Évora",
  notes: "Entrega até às 10h",
};
const QUINTA = {
  id: "f2",
  name: "Quinta do Vale",
  category: "Espaço",
  phone: "266111111",
  email: "reservas@exemplo.pt",
  location: "Estremoz",
  notes: "",
};

const resposta = (status: number, body: unknown = {}) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

let recusarAsFlores: () => void;

beforeEach(() => {
  __resetListCache();
  const patchDasFlores = new Promise<Response>((resolve) => {
    recusarAsFlores = () => resolve(resposta(500, { error: "Erro interno" }));
  });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      if (!init?.method || init.method === "GET") {
        return Promise.resolve(resposta(200, [FLORES, QUINTA]));
      }
      // O PATCH das Flores fica pendente até o teste o recusar.
      if (String(url).endsWith("/f1")) return patchDasFlores;
      return Promise.resolve(resposta(200, {}));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A ficha inteira de um fornecedor, para não confundir as estrelas de um com as do outro. */
function fichaDe(nome: string) {
  const ficha = screen.getByText(nome).closest("div.group");
  if (!ficha) throw new Error(`Sem ficha para "${nome}"`);
  return within(ficha as HTMLElement);
}

const ehPreferido = (nome: string) => fichaDe(nome).queryByTitle("Fornecedor preferido") !== null;

async function montar() {
  render(
    <ToastProvider>
      <Fornecedores />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Flores do Alentejo")).toBeInTheDocument());
}

describe("Fornecedores — uma gravação recusada enquanto outra passa", () => {
  it("a estrela que o servidor aceitou continua acesa", async () => {
    const user = userEvent.setup();
    await montar();

    // A gravação lenta das Flores parte primeiro…
    await user.click(fichaDe("Flores do Alentejo").getByTitle("Marcar como preferido"));
    // … e, à espera dela, a Quinta é marcada como preferida com sucesso.
    await user.click(fichaDe("Quinta do Vale").getByTitle("Marcar como preferido"));
    await waitFor(() => expect(ehPreferido("Quinta do Vale")).toBe(true));

    // Só agora o servidor recusa a primeira.
    recusarAsFlores();

    await waitFor(() => expect(ehPreferido("Flores do Alentejo")).toBe(false));
    // A Quinta está preferida na base de dados: apagar-lhe a estrela no ecrã é
    // mostrar-lhe uma agenda que já não é a dela.
    expect(ehPreferido("Quinta do Vale")).toBe(true);
  });

  it("e a frase diz qual fornecedor, porquê e o que fazer", async () => {
    const user = userEvent.setup();
    await montar();

    await user.click(fichaDe("Flores do Alentejo").getByTitle("Marcar como preferido"));
    recusarAsFlores();

    const aviso = await screen.findByText(/não está a aceitar gravações/);
    expect(aviso).toHaveTextContent("Flores do Alentejo");
    expect(aviso).toHaveTextContent(/repete/i);
  });
});
