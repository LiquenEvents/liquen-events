// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import EventMaterialPanel from "./EventMaterial";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "AINDA SEM CHECKLIST" É UMA AFIRMAÇÃO — E UMA LEITURA FALHADA NÃO A SABE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel já sabia não escrever no estado o que não tem a forma certa (ver o
 * comentário grande no `buscar`), mas o `if (!res.ok) return` acabava aí: a
 * leitura falhava, o `carregando` caía, e o painel desenhava com toda a
 * confiança
 *
 *     "Ainda sem checklist. Ao gerar, junta os essenciais de carrinha…"
 *
 * ao lado de um botão a dizer "Gerar checklist". Sobre um evento que pode ter a
 * checklist feita e meia carrinha já carregada.
 *
 * E os gatilhos são os mesmos que o próprio ficheiro enumera: 401 quando a
 * sessão caduca ou quando alguém carrega em Sair noutro aparelho, 500 quando
 * faltam as tabelas do material.
 *
 * O que se perde ao acreditar na frase é trabalho real: o passo seguinte óbvio é
 * carregar em "Gerar checklist", e a geração só preserva o que está CARREGADO,
 * as notas e o veículo — as marcações de devolvido e de em falta não têm par na
 * lista nova e ficam para trás. O painel não pode convidar a isso a partir de
 * uma leitura que nem sequer aconteceu.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const QUOTE = { id: "q1" } as Quote;
const EXPLICACAO = "A base de dados não respondeu (faltam as tabelas?).";

const montar = () =>
  render(
    <ToastProvider>
      <EventMaterialPanel quote={QUOTE} />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Material do evento — quando a leitura falha", () => {
  it("não afirma que ainda não há checklist, e repete a frase do servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: EXPLICACAO })),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler/)).toBeTruthy());
    expect(screen.getByText(EXPLICACAO)).toBeTruthy();
    expect(
      screen.queryByText(/Ainda sem checklist/),
      "o painel afirmou que não há checklist sem ter conseguido perguntar",
    ).toBeNull();
    // E não convida a regenerar por cima do que possa lá estar.
    expect(screen.queryByRole("button", { name: "Gerar checklist" })).toBeNull();
  });

  it("uma resposta de erro sem explicação continua a ser tratada como falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, null)),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler/)).toBeTruthy());
    expect(screen.queryByText(/Ainda sem checklist/)).toBeNull();
  });

  it("um evento SEM checklist continua a dizer que ainda não a tem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { evento: null, itens: [] })),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/Ainda sem checklist/)).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler/)).toBeNull();
    expect(screen.getByRole("button", { name: "Gerar checklist" })).toBeTruthy();
  });
});
