// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import AdminClient from "./AdminClient";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM VAZIO QUE MANDA IR A OUTRO SÍTIO É MEIO VAZIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A lista filtrada e vazia já sabia dizer que estava filtrada. O que não fazia
 * era dar a saída: dizia «Limpa a pesquisa ou os filtros» e mandava
 * procurá-los — no telemóvel, dentro de um painel RECOLHIDO, que é
 * precisamente o que faz ninguém dar por eles.
 *
 * É o mais caro dos vinte e cinco vazios sem saída que o inventário contou,
 * porque a conclusão errada — «não entrou nada» — fecha o telemóvel e deixa um
 * pedido de orçamento sem resposta.
 *
 * E o contrapeso, que vale tanto: **um vazio a sério continua a ser um vazio.**
 * A primeira semana de uso é feita de ecrãs vazios e todos eles são normais; o
 * que lá tem de estar é o primeiro passo, não um alarme.
 */

vi.mock("./Toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

const PEDIDO = {
  id: "LIQ-7",
  name: "Ana Marques",
  email: "ana@exemplo.pt",
  status: "novo",
  submittedAt: "2026-05-01T10:00:00.000Z",
  priceBreakdown: { total: 0 },
} as unknown as Quote;

function resposta(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ "x-pedido": "completo" }),
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/orcamento/LIQ-7") ? resposta(200, PEDIDO) : resposta(200, []),
    ),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Escreve na pesquisa até a lista ficar vazia. */
async function procurarPorNadaS() {
  render(<AdminClient initialQuotes={[PEDIDO]} userName="Catarina" />);
  const busca = await screen.findByPlaceholderText(/procurar|pesquisar/i);
  fireEvent.change(busca, { target: { value: "zzzznaoexiste" } });
  await waitFor(() => expect(screen.getByText(/Nenhum pedido corresponde/i)).toBeInTheDocument());
}

describe("AdminClient — a lista vazia por filtro", () => {
  it("diz o que está a esconder os pedidos, e não «limpa os filtros»", async () => {
    await procurarPorNadaS();

    // Nomeia a pesquisa: quem a escreveu há dez minutos já não se lembra.
    expect(screen.getByText(/zzzznaoexiste/)).toBeInTheDocument();
    expect(screen.getByText(/Estão a esconder pedidos/i)).toBeInTheDocument();
  });

  it("põe a saída DENTRO do vazio", async () => {
    await procurarPorNadaS();

    const sair = screen.getByRole("button", { name: /Limpar tudo e ver todos/i });
    await userEvent.click(sair);

    // E funciona: o pedido volta.
    await waitFor(() => expect(screen.getAllByText("Ana Marques").length).toBeGreaterThan(0));
    expect(screen.queryByText(/Nenhum pedido corresponde/i)).toBeNull();
  });

  /** ── O CONTRAPESO ────────────────────────────────────────────────── */

  it("sem pedidos nenhuns continua a ser um vazio normal, com o primeiro passo", async () => {
    render(<AdminClient initialQuotes={[]} userName="Catarina" />);

    // Não é um alarme: é «ainda não entrou nada, e podes criar um».
    await waitFor(() => expect(screen.getByText(/Sem pedidos ainda/i)).toBeInTheDocument());
    // Há mais do que um «Novo pedido» no ecrã (a barra tem o seu); o que
    // interessa é que o VAZIO também o tenha.
    expect(screen.getAllByRole("button", { name: /Novo pedido/i }).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Estão a esconder pedidos/i)).toBeNull();
    expect(screen.queryByRole("button", { name: /Limpar tudo/i })).toBeNull();
  });
});
