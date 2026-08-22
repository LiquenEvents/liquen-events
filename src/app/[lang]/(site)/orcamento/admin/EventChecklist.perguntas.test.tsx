// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, ChecklistItem } from "@/lib/orcamento/types";
import EventChecklist from "./EventChecklist";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRÊS GESTOS QUE DEITAVAM TRABALHO FORA, E SÓ UM LEVA PERGUNTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta checklist lê-se e corrige-se de pé, numa quinta, com o telemóvel numa
 * mão. A conta é sempre a mesma — pergunta-se o que é raro e caro; oferece-se
 * anular o que é frequente e barato de refazer — e dá três respostas
 * diferentes:
 *
 *  · **limpar as concluídas** tira um punhado de linhas de uma vez, e o que se
 *    perde é o TEXTO delas, escrito à mão uma a uma. Leva PERGUNTA. A que lá
 *    estava («Remover 3 concluídas?», num botão que trocava de rótulo) tinha o
 *    número mas não dizia QUAIS — e desarmava-se no `blur`, ou seja, rolar a
 *    lista num telemóvel chegava para a desfazer sem se perceber porquê;
 *  · **remover um item** é arrumação de todos os dias. Leva ANULAR;
 *  · **marcar todas** risca tudo num toque. Nada desaparece, mas desfazer à mão
 *    seriam N toques. Leva ANULAR, que repõe a lista de uma vez.
 */

const ITENS: ChecklistItem[] = [
  { id: "c1", label: "Confirmar catering", done: true },
  { id: "c2", label: "Reservar carrinha", done: true },
  { id: "c3", label: "Levar extensões", done: false },
];

const QUOTE = {
  id: "LIQ-9",
  name: "Casamento Ana & Rui",
  category: "casamento",
  checklist: ITENS,
} as unknown as Quote;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** As checklists que foram gravadas, pela ordem em que saíram. */
let gravadas: ChecklistItem[][] = [];

function servidor() {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") !== "GET") {
      const corpo = JSON.parse(String(init?.body)) as { checklist: ChecklistItem[] };
      gravadas.push(corpo.checklist);
    }
    return reply(200, { ok: true });
  });
}

const montar = () => render(<EventChecklist quote={QUOTE} onChange={() => {}} />);

beforeEach(() => {
  gravadas = [];
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Checklist do evento — limpar as concluídas pergunta", () => {
  async function abrirAPergunta(user: ReturnType<typeof userEvent.setup>) {
    montar();
    await user.click(screen.getByRole("button", { name: /^Limpar concluídas$/i }));
    return screen.findByRole("dialog");
  }

  it("a pergunta conta as que saem, nomeia-as, e diz quantas ficam", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);

    expect(within(caixa).getByText(/Remover 2 concluídas da checklist\?/i)).toBeTruthy();
    // Nomeia — era isto que faltava à confirmação de dois cliques.
    expect(within(caixa).getByText(/«Confirmar catering»/)).toBeTruthy();
    expect(within(caixa).getByText(/«Reservar carrinha»/)).toBeTruthy();
    // E diz o que fica, para se perceber o tamanho do gesto.
    expect(within(caixa).getByText(/Ficam 1 linha na checklist/i)).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Remover as 2$/i })).toBeTruthy();
  });

  it("cancelar não escreve nada", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(gravadas).toEqual([]);
    // E as duas concluídas continuam lá.
    expect(screen.getByText("Confirmar catering")).toBeTruthy();
  });

  it("responder que sim tira mesmo as concluídas", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Remover as 2$/i }));

    await waitFor(() => expect(gravadas.length).toBe(1));
    expect(gravadas[0].map((i) => i.label)).toEqual(["Levar extensões"]);
  });
});

describe("Checklist do evento — remover um item anula-se", () => {
  it("não pergunta nada, e o «Anular» repõe a linha no sítio onde estava", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Remover Reservar carrinha" }));

    // Sem caixa nenhuma pelo meio: é o gesto do dia a dia.
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(gravadas.length).toBe(1));
    expect(gravadas[0].map((i) => i.label)).toEqual(["Confirmar catering", "Levar extensões"]);

    const tira = await screen.findByRole("status");
    expect(within(tira).getByText(/«Reservar carrinha» saiu da checklist/i)).toBeTruthy();
    await user.click(within(tira).getByRole("button", { name: /^Anular$/i }));

    // Volta AO SÍTIO, e não ao fim: o que se guarda é a lista de antes.
    await waitFor(() => expect(gravadas.length).toBe(2));
    expect(gravadas[1].map((i) => i.label)).toEqual([
      "Confirmar catering",
      "Reservar carrinha",
      "Levar extensões",
    ]);
  });
});

describe("Checklist do evento — «Marcar todas» anula-se", () => {
  it("não pergunta nada, e o «Anular» devolve a lista como estava", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /^Marcar todas$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(gravadas.length).toBe(1));
    expect(gravadas[0].every((i) => i.done)).toBe(true);

    const tira = await screen.findByRole("status");
    expect(within(tira).getByText(/1 item riscado de uma vez/i)).toBeTruthy();
    await user.click(within(tira).getByRole("button", { name: /^Anular$/i }));

    await waitFor(() => expect(gravadas.length).toBe(2));
    // Exactamente o que lá estava — e não «tudo por fazer».
    expect(gravadas[1].map((i) => i.done)).toEqual([true, true, false]);
  });
});
