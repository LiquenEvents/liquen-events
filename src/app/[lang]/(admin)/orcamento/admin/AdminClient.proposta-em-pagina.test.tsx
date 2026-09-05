// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminClient from "./AdminClient";
import type { Quote } from "@/lib/orcamento/types";

// O ecrã da proposta é preguiçoso (`./lazy`); em jsdom o `import()` não cabe
// nos 5 s por omissão quando a suite inteira corre ao mesmo tempo.
vi.setConfig({ testTimeout: 40_000 });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CARREGAR NUM CLIENTE DA LISTA ABRE A PROPOSTA NA PÁGINA TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando se carrega na página dos pedidos e depois num cliente
 * vai para a parte de fazer a proposta, mas eu quero que […] coloque apenas a
 * página para fazer a proposta do cliente em que se carregou na página toda e
 * não apenas ali de lado, como está na página de fazer propostas».
 *
 * O painel de detalhe abre-se AO LADO da lista e tem tecto próprio
 * (`max-w-3xl`): medido num Chromium, com a janela a 1440, o estúdio lá dentro
 * fica com 712 px de fila. A página inteira dá-lhe os 1600 do `VIEW_WRAP`.
 *
 * O que este ficheiro prende são as três metades da promessa:
 *
 *  1. a lista de Pedidos leva à página inteira, com o cliente já escolhido;
 *  2. o painel de detalhe NÃO se abre por trás — «apenas a página»;
 *  3. e as outras portas (Calendário, Kanban, Visão Geral…) continuam a abrir
 *     o painel, que é o que quem lá carrega está a pedir.
 */

const avisos = vi.hoisted(() => ({ ditos: [] as string[] }));
vi.mock("./Toast", () => ({
  useToast: () => ({ toast: (texto: string) => avisos.ditos.push(texto) }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const PEDIDO = {
  id: "LIQ-7",
  name: "Ana Marques",
  email: "ana@exemplo.pt",
  status: "pendente",
  submittedAt: "2026-05-01T10:00:00.000Z",
  priceBreakdown: { total: 0 },
} as unknown as Quote;

function resposta(status: number, body: unknown, completo = true) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(completo ? { "x-pedido": "completo" } : {}),
    json: async () => body,
  } as unknown as Response;
}

/** O servidor responde o pedido inteiro; o resto do arranque responde vazio. */
function servidor() {
  return vi.fn(async (url: string) => {
    const u = String(url);
    if (u.includes("/api/orcamento/LIQ-7")) return resposta(200, PEDIDO);
    return resposta(200, []);
  });
}

/**
 * A linha do pedido na lista.
 *
 * Em jsdom não há largura nenhuma para o `TabelaOuCartoes` medir, portanto a
 * lista desenha-se como CARTÕES — cada um o seu botão — e não como tabela. O
 * que se procura é o botão que leva o nome, seja qual for a forma.
 *
 * Os «recentes» só existem depois de abrir um pedido, e o `localStorage` é
 * limpo antes de cada caso: aqui há um alvo só.
 */
function linhaDaLista() {
  // Dentro do `main`: o mesmo nome aparece nos «vistos recentemente» da barra
  // lateral, e essa é OUTRA porta (abre o painel directamente). O que este
  // ficheiro mede é a porta da LISTA.
  const alvo = screen
    .getAllByText("Ana Marques")
    // A LISTA, e não os «vistos recentemente» nem a paleta: só a lista desenha
    // cada pedido dentro de um `<li>`. Sem esta distinção, o caso apanhava por
    // vezes a outra porta — a que abre o painel — e media o contrário do que diz.
    .filter((n) => n.closest("li") !== null && n.closest('[role="complementary"]') === null)
    .map((n) => (n.closest("button") ?? n.closest("tr")) as HTMLElement | null)
    .find((el) => el !== null);
  expect(alvo, "a linha do pedido na lista").toBeTruthy();
  return alvo as HTMLElement;
}

beforeEach(() => {
  avisos.ditos = [];
  localStorage.clear();
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminClient — a proposta abre na página toda", () => {
  it("carregar no cliente da lista leva ao ecrã de fazer proposta, para aquele cliente", async () => {
    render(<AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />);
    await screen.findAllByText("Ana Marques");

    // Controlo positivo: ANTES do clique não há ecrã de proposta nenhum. Sem
    // isto o teste podia estar a ver um ecrã que já lá estava.
    expect(screen.queryByText(/Proposta para/)).toBeNull();

    await userEvent.click(linhaDaLista());

    // O ecrã é preguiçoso: com a suite inteira a correr, o `import()` passa do
    // segundo por omissão do `waitFor`.
    await screen.findByText(/Proposta para/, {}, { timeout: 10_000 });
    // E é a proposta DAQUELE cliente: o nome está no cabeçalho do ecrã.
    const cabecalho = screen.getByText(/Proposta para/).parentElement;
    expect(cabecalho?.textContent).toContain("Ana Marques");
  });

  it("o painel de detalhe não se abre por trás — «apenas a página»", async () => {
    render(<AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />);
    await screen.findAllByText("Ana Marques");
    await userEvent.click(linhaDaLista());

    // O ecrã é preguiçoso: com a suite inteira a correr, o `import()` passa do
    // segundo por omissão do `waitFor`.
    await screen.findByText(/Proposta para/, {}, { timeout: 10_000 });
    // Os separadores do painel são a assinatura dele. Nenhum no ecrã.
    expect(document.getElementById("detail-tab-comunicacao")).toBeNull();
    expect(document.getElementById("detail-tab-producao")).toBeNull();
  });

  it("e há volta: «Abrir o pedido» traz o painel, com Produção e Financeiro", async () => {
    render(<AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />);
    await screen.findAllByText("Ana Marques");
    await userEvent.click(linhaDaLista());
    // O ecrã é preguiçoso: com a suite inteira a correr, o `import()` passa do
    // segundo por omissão do `waitFor`. Espera-se DIRECTAMENTE pela porta de
    // volta, que é o que este caso mede.
    await userEvent.click(
      await screen.findByRole("button", { name: /^Abrir o pedido$/ }, { timeout: 25_000 }),
    );

    await waitFor(() => expect(document.getElementById("detail-tab-comunicacao")).toBeTruthy(), {
      timeout: 10_000,
    });
    expect(document.getElementById("detail-tab-producao")).toBeTruthy();
  });
});
