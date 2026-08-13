// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ModelosParciais from "./ModelosParciais";

/**
 * «AINDA NÃO GUARDASTE NENHUM» É UMA FRASE QUE TEM DE SER VERDADE.
 *
 * A leitura dos modelos fazia `r.json()` sem olhar ao `r.ok`. O corpo de um 401
 * (sessão caída) ou de um 500 é `{error: …}` e não `{modelos: […]}` — entrava
 * como lista vazia, e o menu dizia-lhe, com todas as letras, que ela nunca
 * tinha guardado nenhum modelo. O trabalho estava lá; o que ela via era o
 * convite a montar tudo outra vez.
 */

const resposta = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as unknown as Response;

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ModelosParciais quando a leitura falha", () => {
  it("não diz que a lista está vazia — diz que não a conseguiu ler", async () => {
    const toast = vi.fn();
    fetchMock.mockResolvedValue(resposta({ error: "Não autorizado" }, false, 401));
    const user = userEvent.setup();
    render(<ModelosParciais tipo="grupo" mostrar="inserir" onInserir={vi.fn()} toast={toast} />);

    await user.click(screen.getByRole("button", { name: /De um modelo/ }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), "error"));
    expect(screen.queryByText(/Ainda não guardaste nenhum grupo/)).toBeNull();
    expect(screen.getByText(/Não deu para ler os modelos/)).toBeTruthy();
  });

  it("com o servidor a responder, lista o que lá está", async () => {
    fetchMock.mockResolvedValue(
      resposta({
        modelos: [
          { id: "m1", nome: "Complementos dos noivos", tipo: "grupo", grupo: { titulo: "x" } },
          { id: "m2", nome: "Cerimónia na igreja", tipo: "moodboard", moodboard: {} },
        ],
      }),
    );
    const user = userEvent.setup();
    render(<ModelosParciais tipo="grupo" mostrar="inserir" onInserir={vi.fn()} toast={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /De um modelo/ }));

    expect(await screen.findByText("Complementos dos noivos")).toBeTruthy();
    // Os modelos do outro tipo não pertencem a esta secção.
    expect(screen.queryByText("Cerimónia na igreja")).toBeNull();
  });
});
