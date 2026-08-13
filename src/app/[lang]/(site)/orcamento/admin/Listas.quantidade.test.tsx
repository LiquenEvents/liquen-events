// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import MaterialListas from "./MaterialListas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR O QUE ESTÁ NA CAIXA DA QUANTIDADE NÃO É ESCREVER "ZERO"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A caixa da quantidade de uma linha grava ao SAIR dela, e a leitura era
 * `Number(texto)`. Em JavaScript `Number("")` é 0 — portanto seleccionar o
 * número, apagá-lo e carregar noutro sítio gravava **zero** na lista base.
 *
 * Zero numa lista base é o pior valor possível: a linha CONTINUA lá, com o
 * nome do item, o rótulo de crítico e tudo. Só que a checklist de cada evento
 * gerado a partir dela passa a pedir zero unidades — e quem carrega a carrinha
 * lê "Escadote 0" e passa à frente. A lista está certa, a conta é que não.
 *
 * Escrever texto que não é número tinha o outro lado do mesmo defeito: não
 * gravava nada (bem), mas deixava o texto na caixa (mal) — o ecrã ficava a
 * dizer uma coisa e a base de dados outra, sem nada por perto que o desmentisse.
 *
 * A caixa é não-controlada (`defaultValue`), por isso repô-la é o único jeito
 * de o ecrã voltar a dizer a verdade.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ITEM = {
  id: "i1",
  name: "Escadote 3 degraus",
  category: "Ferramentas",
  kind: "reutilizavel" as const,
  unit: "un",
  stock: 2,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const LISTA = {
  id: "l1",
  name: "Essenciais de carrinha",
  isDefault: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const LINHA = { id: "ln1", listId: "l1", itemId: "i1", qty: 4, critical: true, position: 0 };

let fetchMock: ReturnType<typeof vi.fn>;

/** Os PATCH que mexeram na quantidade, com o valor que levaram. */
const quantidadesGravadas = () =>
  fetchMock.mock.calls
    .filter((c) => (c[1] as RequestInit)?.method === "PATCH")
    .map((c) => JSON.parse(String((c[1] as RequestInit).body)))
    .filter((b) => b?.patch && "qty" in b.patch)
    .map((b) => b.patch.qty);

beforeEach(() => {
  __resetListCache();
  fetchMock = vi.fn(async (url: string) =>
    String(url).includes("/listas")
      ? reply(200, { listas: [LISTA], linhas: [LINHA] })
      : reply(200, [ITEM]),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Abre a lista e devolve a caixa da quantidade da única linha. */
async function abrirLinha(user: ReturnType<typeof userEvent.setup>) {
  render(
    <ToastProvider>
      <MaterialListas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Essenciais de carrinha")).toBeTruthy());
  await user.click(screen.getByRole("button", { name: "Essenciais de carrinha" }));
  return (await screen.findByLabelText("Quantidade de Escadote 3 degraus")) as HTMLInputElement;
}

describe("quantidade de uma linha da lista base", () => {
  it("apagar a caixa não grava zero — e a caixa volta ao valor que está gravado", async () => {
    const user = userEvent.setup();
    const caixa = await abrirLinha(user);
    expect(caixa.value).toBe("4");

    await user.clear(caixa);
    await user.tab();

    expect(
      quantidadesGravadas(),
      "uma caixa apagada gravou zero: a linha fica na lista a pedir nenhuma unidade",
    ).toEqual([]);
    expect(caixa.value, "o ecrã ficou a dizer uma coisa e a base de dados outra").toBe("4");
  });

  it("texto que não é número também repõe o valor gravado", async () => {
    const user = userEvent.setup();
    const caixa = await abrirLinha(user);

    await user.clear(caixa);
    await user.type(caixa, "umas quantas");
    await user.tab();

    expect(quantidadesGravadas()).toEqual([]);
    expect(caixa.value).toBe("4");
  });

  it("um número a sério continua a gravar-se, com vírgula ou com ponto", async () => {
    const user = userEvent.setup();
    const caixa = await abrirLinha(user);

    await user.clear(caixa);
    await user.type(caixa, "2,5");
    await user.tab();

    await waitFor(() => expect(quantidadesGravadas()).toEqual([2.5]));
  });
});
