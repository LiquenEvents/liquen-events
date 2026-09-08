// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTADO DE UM PEDIDO NÃO PODE VIVER SÓ NA COR DO PONTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro existe por causa de um defeito medido no calendário: o estado
 * de cada pedido aparecia SÓ como um ponto de 6 px colorido — na etiqueta da
 * grelha do mês e na linha do painel do dia. O nome acessível do botão dizia
 * «Abrir pedido de Marta Nunes — Casamento» e mais nada, e o ponto do painel
 * do dia é `aria-hidden`. Para quem lê com um leitor de ecrã o estado não
 * existia de todo.
 *
 * E não era só isso: dois dos cinco tons são cinzentos quase iguais — «Novo»
 * (`#8a8a82`) e «Perdido» (`#5a5a55`). A 6 px, lado a lado no mesmo mês, as
 * duas pontas opostas do funil eram o mesmo ponto. Nem com visão de cor
 * completa se distinguiam.
 *
 * A cura é a PALAVRA, e é a palavra que o resto da casa já usa. Este teste
 * prende as duas vias:
 *
 *  · na grelha, no nome acessível da etiqueta (é o que um leitor de ecrã lê,
 *    e o que o `title` mostra a quem passa o rato);
 *  · no painel do dia, À VISTA, porque ali há linha para ela.
 *
 * A COR não se verifica aqui de propósito — o contraste dos crachás tem dono
 * próprio (`contraste-dos-rotulos.test.ts`). O que este ficheiro garante é que
 * a cor deixou de ser a ÚNICA via, que é outra coisa.
 */

const DOIS_CINZENTOS: Quote[] = [
  {
    id: "LIQ-1",
    name: "Marta Nunes",
    status: "pendente",
    date: "2026-01-09",
    guests: 60,
  } as unknown as Quote,
  {
    id: "LIQ-2",
    name: "Rui Cardoso",
    status: "rejeitado",
    date: "2026-01-09",
    guests: 40,
  } as unknown as Quote,
];

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([])),
  );
  process.env.TZ = "Europe/Lisbon";
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar(quotes: Quote[]) {
  render(
    <ToastProvider>
      <Calendario quotes={quotes} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Janeiro 2026")).toBeInTheDocument());
}

describe("Calendário — o estado do pedido não é só cor", () => {
  it("a etiqueta da grelha diz o estado por palavras no nome acessível", async () => {
    await montar(DOIS_CINZENTOS);

    expect(screen.getAllByLabelText(/Abrir pedido de Marta Nunes.*Novo$/).length).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText(/Abrir pedido de Rui Cardoso.*Perdido$/).length,
    ).toBeGreaterThan(0);
  });

  it("dois pedidos iguais em tudo menos no estado não partilham o mesmo nome acessível", async () => {
    // O MESMO casal, o mesmo dia, o mesmo tipo de evento — só o estado muda.
    // Sem a palavra, os dois botões ficavam com nomes acessíveis rigorosamente
    // idênticos e o ponto de 6 px (dois cinzentos quase iguais) era tudo o que
    // os separava. É o caso mais duro, e é por isso que está aqui.
    await montar([
      { ...DOIS_CINZENTOS[0], id: "LIQ-A", status: "pendente" } as unknown as Quote,
      { ...DOIS_CINZENTOS[0], id: "LIQ-B", status: "rejeitado" } as unknown as Quote,
    ]);

    const nomes = screen
      .getAllByLabelText(/Abrir pedido de Marta Nunes/)
      .map((b) => b.getAttribute("aria-label"));

    expect(new Set(nomes).size).toBe(nomes.length);
  });

  it("o painel do dia mostra a palavra do estado À VISTA, não só no ponto", async () => {
    await montar(DOIS_CINZENTOS);

    // Abrir o dia 9, que tem os dois pedidos.
    fireEvent.click(screen.getByLabelText(/^9 de Janeiro de 2026 — 2 eventos/));

    await waitFor(() => expect(screen.getByText(/^Novo · /)).toBeInTheDocument());
    expect(screen.getByText(/^Perdido · /)).toBeInTheDocument();
  });

  it("o ponto colorido da etiqueta é decoração — não entra no nome acessível", async () => {
    await montar(DOIS_CINZENTOS);

    const etiqueta = screen.getAllByLabelText(/Abrir pedido de Marta Nunes/)[0];
    const ponto = etiqueta.querySelector("span.rounded-full");

    expect(ponto).not.toBeNull();
    expect(ponto).toHaveAttribute("aria-hidden", "true");
  });
});
