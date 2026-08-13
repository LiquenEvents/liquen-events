// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import CriarAPartirDe from "./CriarAPartirDe";

/**
 * «A PRIMEIRA FAZ-SE DO ZERO» TAMBÉM TEM DE SER VERDADE.
 *
 * As duas leituras faziam `r.ok ? r.json() : []` — o erro virava uma lista
 * vazia, sem toast nenhum, porque o `.catch` só apanhava a rede em baixo. Com a
 * sessão caída (401), ou com a rota a falhar (500), o ecrã dizia-lhe que não
 * havia propostas anteriores nem modelos guardados. É a mentira mais cara deste
 * ecrã: a resposta a ela é montar do zero as 23 linhas que já existiam.
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

const abrir = (toast = vi.fn()) => {
  render(
    <CriarAPartirDe
      open
      onClose={vi.fn()}
      quoteId="q2"
      clienteAtual="Ana Marques"
      onEscolhido={vi.fn()}
      toast={toast}
    />,
  );
  return toast;
};

describe("CriarAPartirDe quando a leitura falha", () => {
  it("não jura que não há nada para copiar", async () => {
    fetchMock.mockResolvedValue(resposta({ error: "Não autorizado" }, false, 401));
    const toast = abrir();

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.any(String), "error"));
    expect(
      screen.queryByText(/Ainda não há propostas anteriores nem modelos guardados/),
    ).toBeNull();
    expect(screen.getByText(/Não deu para ler as propostas anteriores/)).toBeTruthy();
  });

  it("com o servidor a responder, lista as propostas anteriores", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("modelos")
        ? resposta({ modelos: [] })
        : resposta([
            {
              id: "p1",
              quoteId: "q1",
              clientName: "Ana Marques",
              createdAt: "2026-05-01T10:00:00.000Z",
              status: "cotado",
              temDoc: true,
              eventType: "Casamento",
              eventDate: "2026-09-12",
              location: "Évora",
              guests: "120",
              grupos: 3,
              moodBoards: 2,
              linhas: 8,
              fotos: 14,
            },
          ]),
    );
    abrir();

    expect(await screen.findByText("Ana Marques")).toBeTruthy();
    expect(screen.getByText(/já foi teu cliente/)).toBeTruthy();
  });
});
