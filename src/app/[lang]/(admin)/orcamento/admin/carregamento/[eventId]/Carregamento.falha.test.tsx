// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import Carregamento from "./Carregamento";
import { CHAVE_FILA, chaveEvento } from "@/lib/material-offline";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "SEM CHECKLIST" É UMA AFIRMAÇÃO — E UMA LEITURA FALHADA NÃO A SABE FAZER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `buscar` deste ecrã era um `fetch(…).then((x) => x.json())` sem olhar ao
 * `res.ok`. O corpo de um 401 (a sessão caduca sozinha, ou alguém carrega em
 * Sair noutro aparelho) e o de um 500 (as tabelas do material em baixo) são
 * `{ error: "…" }` — um objecto, não a resposta. O `Array.isArray(r?.itens)`
 * que vem a seguir apanhava-o e não escrevia nada, portanto nada rebentava:
 * a leitura falhava EM SILÊNCIO.
 *
 * E o silêncio, aqui, tem uma frase por baixo. Com o telemóvel sem cópia local
 * — que é o caso normal, porque quem abre o endereço da carrinha é quase sempre
 * um aparelho que nunca o abriu — a lista fica a zero e o ecrã diz, a meio de
 * uma quinta:
 *
 *     "Sem checklist. Gera-a primeiro no pedido, no computador."
 *
 * É falso e é caro. Falso porque a checklist existe, do outro lado, feita.
 * Caro porque o passo seguinte que a frase manda dar é ir a um computador
 * gerá-la outra vez — e a regeneração só preserva o que está CARREGADO: as
 * marcações de devolvido e de em falta ficam para trás.
 *
 * O aviso de "sem rede" que o cabeçalho já tem também não sai: com um 401 o
 * browser está online e o `navigator.onLine` é `true`.
 *
 * Mesmo tratamento que o painel irmão (o `EventMaterial`, que lê ESTA mesma
 * rota) e que o resto do back office: guardar a explicação do servidor e
 * mostrar o `AvisoDeFalha`, em vez de um estado vazio que convida a começar.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const EXPLICACAO = "A base de dados não respondeu (faltam as tabelas?).";

const montar = () =>
  render(<Carregamento quoteId="q1" eventId="ev1" titulo="Casamento · 2026-05-01" actor="Rita" />);

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Carregamento da carrinha — quando a leitura falha", () => {
  it("não afirma que não há checklist, e repete a frase do servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: EXPLICACAO })),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler/)).toBeTruthy());
    expect(screen.getByText(EXPLICACAO)).toBeTruthy();
    expect(
      screen.queryByText(/Sem checklist/),
      "o ecrã afirmou que não há checklist sem ter conseguido perguntar",
    ).toBeNull();
  });

  it("uma resposta de erro sem explicação continua a ser tratada como falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, null)),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler/)).toBeTruthy());
    expect(screen.queryByText(/Sem checklist/)).toBeNull();
  });

  it("um evento SEM checklist continua a dizer que ainda não a tem", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { evento: null, itens: [] })),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/Sem checklist/)).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler/)).toBeNull();
  });

  it("com uma cópia local, a releitura falhada deixa a lista à vista — velha, mas verdadeira", async () => {
    // O caso do meio: já se tinha lido a checklist neste telemóvel. Perder as
    // linhas por causa de um 500 seria trocar uma verdade velha por um ecrã
    // vazio, e é a lista que está a ser usada para carregar a carrinha.
    localStorage.setItem(
      chaveEvento("ev1"),
      JSON.stringify([{ id: "i1", category: "Estrutura", name: "Escadote", qty: 1 }]),
    );
    localStorage.setItem(CHAVE_FILA, "[]");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: EXPLICACAO })),
    );
    montar();

    await waitFor(() => expect(screen.getByText("Escadote")).toBeTruthy());
    expect(screen.queryByText(/Sem checklist/)).toBeNull();
  });
});
