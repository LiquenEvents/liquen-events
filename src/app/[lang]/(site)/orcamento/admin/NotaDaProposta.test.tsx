// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import NotaDaProposta from "./NotaDaProposta";

/**
 * A nota escrita no estúdio tem de aparecer a quem abre a FICHA do pedido —
 * era aí que ela se perdia, porque quem responde ao telefone três semanas
 * depois não passa pelo estúdio.
 *
 * E tem de se calar quando não há nada: um cartão vazio em todos os pedidos
 * sem proposta seria ruído na ficha inteira.
 */

let resposta: { ok: boolean; json: unknown } = { ok: true, json: { ok: true, draft: null } };
const fetchMock = vi.fn(
  async (url: RequestInfo | URL) =>
    ({ ok: resposta.ok, url: String(url), json: async () => resposta.json }) as unknown as Response,
);

beforeEach(() => {
  resposta = { ok: true, json: { ok: true, draft: null } };
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a nota da proposta na ficha do pedido", () => {
  it("mostra a nota que está no rascunho da proposta", async () => {
    resposta = {
      ok: true,
      json: { ok: true, draft: { doc: { notasInternas: "Quer ficar por baixo dos 8.000 €." } } },
    };
    render(<NotaDaProposta quoteId="LQ-1" />);
    expect(await screen.findByText(/Quer ficar por baixo dos 8.000/)).toBeTruthy();
    // E diz de onde vem e para onde não vai — senão confunde-se com as notas
    // do pedido, que estão logo por cima e gravam-se noutro sítio.
    expect(screen.getByText(/escreve-se no estúdio, nunca sai na proposta/)).toBeTruthy();
  });

  it("não desenha nada quando não há rascunho", async () => {
    render(<NotaDaProposta quoteId="LQ-1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Nota da proposta/)).toBeNull();
  });

  it("não desenha nada quando a nota está vazia ou só com espaços", async () => {
    resposta = { ok: true, json: { ok: true, draft: { doc: { notasInternas: "   \n " } } } };
    render(<NotaDaProposta quoteId="LQ-1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Nota da proposta/)).toBeNull();
  });

  it("não desenha nada quando a leitura falha", async () => {
    resposta = { ok: false, json: {} };
    render(<NotaDaProposta quoteId="LQ-1" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/Nota da proposta/)).toBeNull();
  });

  it("uma nota com um link não empurra a ficha para o lado", async () => {
    // A 390 px, uma cadeia sem espaços que não parte é a FICHA inteira a andar
    // para o lado — e a barra de acções, que está encostada ao fundo, vai com
    // ela. A nota é texto livre e pode trazer um link ou um IBAN.
    window.innerWidth = 390;
    resposta = {
      ok: true,
      json: {
        ok: true,
        draft: { doc: { notasInternas: "Ver https://exemplo.pt/um-caminho-bastante-comprido" } },
      },
    };
    render(<NotaDaProposta quoteId="LQ-1" />);
    const texto = await screen.findByText(/exemplo\.pt/);
    expect(texto.className).toMatch(/break-(words|all)/);
  });

  it("pergunta pelo rascunho DESTE pedido", async () => {
    render(<NotaDaProposta quoteId="LQ 1/2" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    // O id vai codificado: um id com barra montava outro caminho na API.
    expect(fetchMock.mock.calls.map(([u]) => String(u))).toEqual([
      "/api/orcamento/LQ%201%2F2/proposta-rascunho",
    ]);
  });
});
