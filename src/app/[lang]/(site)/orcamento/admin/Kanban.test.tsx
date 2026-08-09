// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";

/**
 * ARRASTAR NÃO PODE VOLTAR A DESENHAR OS 300 CARTÕES.
 *
 * Medido numa compilação de produção com 300 pedidos: atravessar as cinco
 * colunas com um cartão (120 eventos `dragover`, ~2 s) custava 460 ms de
 * JavaScript e deixava cair 8 fotogramas em 119, dois deles acima de 50 ms — o
 * arrasto "colava" à vista.
 *
 * Cada `dragover` chamava `setOverCol`, o que voltava a desenhar o quadro
 * inteiro. Agora: (1) o estado só muda quando a coluna realçada muda mesmo, e
 * (2) o cartão é um componente `memo()`, por isso realçar uma coluna não toca
 * em cartão nenhum.
 *
 * Contamos as formatações de euros — uma por cartão com valor, por desenho.
 */

/**
 * Contamos as chamadas a `eventCountdown`, que só o CARTÃO faz (uma por cartão
 * com data, por desenho).
 *
 * Contar formatações de euros não servia: `eur0` também é usado pelos totais do
 * topo e pelo rodapé de cada coluna, que TÊM mesmo de voltar a desenhar-se
 * quando o realce muda de coluna. Um `dragover` dava 7 formatações que nada
 * tinham a ver com cartões, e o teste acusava um problema que não existia.
 */
const { cardRenders } = vi.hoisted(() => ({ cardRenders: { n: 0 } }));

vi.mock("./util", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./util")>();
  return {
    ...actual,
    eventCountdown: (d: string) => {
      cardRenders.n += 1;
      return actual.eventCountdown(d);
    },
  };
});

const STATUSES = ["pendente", "em_revisao", "cotado", "aceite", "rejeitado"] as const;

const quotes = Array.from({ length: 60 }, (_, i) => ({
  id: `q-${i}`,
  name: `Par ${i}`,
  email: `c${i}@exemplo.pt`,
  phone: "",
  company: "",
  guests: 100 + i,
  date: "2027-06-12",
  location: "Évora",
  notes: "",
  category: "particulares",
  eventType: "casamentos",
  submittedAt: "2026-01-10T10:00:00.000Z",
  lastUpdated: "2026-01-10T10:00:00.000Z",
  status: STATUSES[i % STATUSES.length],
  quotedPrice: 5000 + i,
})) as unknown as Quote[];

beforeEach(() => {
  cardRenders.n = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "aceite" }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderKanban(onStatusChange = vi.fn(), onOpen = vi.fn()) {
  const utils = render(
    <ToastProvider>
      <Kanban quotes={quotes} onOpen={onOpen} onStatusChange={onStatusChange} userName="Catarina" />
    </ToastProvider>,
  );
  return { ...utils, onStatusChange, onOpen };
}

/** O contentor de uma coluna, pelo cartão que lá está dentro. */
function columnOf(cardLabelStart: string): HTMLElement {
  const card = screen.getByRole("button", { name: new RegExp(`^${cardLabelStart},`) });
  // cartão → pilha rolável → contentor da coluna
  return card.parentElement!.parentElement as HTMLElement;
}

describe("Kanban — o quadro", () => {
  it("põe cada pedido na coluna do seu estado", () => {
    renderKanban();
    // 60 pedidos distribuídos por 5 colunas, 12 em cada. Os rótulos procuram-se
    // com `getAllByText` porque "Ganho" também é o nome de um dos totais no topo
    // do quadro — `getByText` rebentava por ambiguidade, não por falta.
    for (const label of ["Novo", "Aguardar resposta", "Proposta enviada", "Ganho", "Perdido"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
    expect(screen.getAllByRole("button", { name: /^Par \d+,/ })).toHaveLength(60);
  });

  it("as setas movem o cartão de coluna (equivalente de teclado do arrasto)", async () => {
    const { onStatusChange } = renderKanban();
    const card = screen.getByRole("button", { name: /^Par 0,/ });
    await act(async () => {
      fireEvent.keyDown(card, { key: "ArrowRight" });
    });
    // "Par 0" está em `pendente`; a seta direita leva-o a `em_revisao`.
    expect(onStatusChange).toHaveBeenCalledWith("q-0", "em_revisao");
  });

  it("Enter abre o pedido", () => {
    const { onOpen } = renderKanban();
    const card = screen.getByRole("button", { name: /^Par 0,/ });
    fireEvent.keyDown(card, { key: "Enter" });
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "q-0" }));
  });
});

describe("Kanban — a chuva de `dragover` não redesenha os cartões", () => {
  it("realça a coluna sem voltar a desenhar um único cartão", () => {
    renderKanban();
    const coluna = columnOf("Par 1"); // `em_revisao`
    const card = screen.getByRole("button", { name: /^Par 0,/ });

    fireEvent.dragStart(card);
    cardRenders.n = 0;

    // 60 `dragover` seguidos sobre a MESMA coluna, como num arrasto real.
    for (let i = 0; i < 60; i++) fireEvent.dragOver(coluna);

    // O realce entrou (a coluna ganhou o anel moss)…
    expect(coluna.className).toContain("ring-2");
    // …e nenhum cartão foi redesenhado por isso.
    expect(cardRenders.n).toBe(0);
  });

  it("mudar de coluna redesenha as colunas, não os cartões", () => {
    renderKanban();
    const a = columnOf("Par 0"); // pendente
    const b = columnOf("Par 1"); // em_revisao
    const card = screen.getByRole("button", { name: /^Par 0,/ });

    fireEvent.dragStart(card);
    cardRenders.n = 0;

    for (let i = 0; i < 10; i++) {
      fireEvent.dragOver(a);
      fireEvent.dragOver(b);
    }

    expect(b.className).toContain("ring-2");
    // Sem `memo()` no cartão isto seriam ~20 × 60 = 1200 formatações.
    expect(cardRenders.n).toBe(0);
  });
});
