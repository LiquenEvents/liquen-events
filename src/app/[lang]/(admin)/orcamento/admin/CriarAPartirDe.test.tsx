// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENQUANTO AS FOTOS ESTÃO A SER COPIADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este é o atalho que ela usa quase sempre — «a maioria é uma variação de uma
 * proposta anterior» — e o que ele faz demora: as fotos todas são recopiadas
 * para a pasta do pedido novo, 5 a 40 segundos.
 *
 * O que havia era uma linha de texto solta dentro do botão apagado, sem
 * indicação nenhuma de que aquilo estava a andar. O que estes testes prendem é
 * o comportamento: ao carregar aparece um cartão vivo, DEBAIXO da linha em que
 * ela carregou, a dizer quantas fotos estão a vir; e some-se quando a resposta
 * chega.
 */
describe("CriarAPartirDe — enquanto copia", () => {
  const PROPOSTA = {
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
  };

  /**
   * As duas listas respondem já; a cópia fica pendurada até nós a soltarmos.
   * Com o `fetch` a responder de imediato, o instante que se quer medir — o
   * meio da espera — não chega a existir.
   */
  function copiaPendurada() {
    let soltar!: (corpo: unknown) => void;
    const pendurada = new Promise<unknown>((r) => (soltar = r));
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).includes("copiar") && init?.method === "POST") {
        return resposta(await pendurada);
      }
      return String(url).includes("modelos") ? resposta({ modelos: [] }) : resposta([PROPOSTA]);
    });
    return soltar;
  }

  it("mostra um cartão vivo com o número de fotos que está a copiar", async () => {
    copiaPendurada();
    abrir();

    await userEvent.click(await screen.findByText("Ana Marques"));

    const frase = await screen.findByText(/A copiar as 14 fotos/i);
    const cartao = frase.closest('[role="status"]');
    expect(cartao).not.toBeNull();
    // A barra que anda — a resposta à pergunta «isto está a andar?».
    expect(cartao!.querySelector('[data-barra="preenchimento"]')).toBeTruthy();
    // E fica ao pé da linha que ela escolheu, não num canto do diálogo.
    expect(cartao!.closest("li")).toBe(frase.closest("li"));
  });

  it("some-se quando a cópia responde", async () => {
    const soltar = copiaPendurada();
    const onEscolhido = vi.fn();
    render(
      <CriarAPartirDe
        open
        onClose={vi.fn()}
        quoteId="q2"
        clienteAtual="Ana Marques"
        onEscolhido={onEscolhido}
      />,
    );

    await userEvent.click(await screen.findByText("Ana Marques"));
    await screen.findByText(/A copiar as 14 fotos/i);
    expect(onEscolhido).not.toHaveBeenCalled();

    soltar({ doc: { moodBoards: [] }, camposAMudar: [], nomeDaOrigem: "Ana Marques" });

    await waitFor(() => expect(onEscolhido).toHaveBeenCalled());
    expect(screen.queryByText(/A copiar as 14 fotos/i)).toBeNull();
  });
});
