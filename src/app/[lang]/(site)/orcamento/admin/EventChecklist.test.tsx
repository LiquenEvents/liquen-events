// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventChecklist from "./EventChecklist";
import type { ChecklistItem, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RISCAR DUAS TAREFAS DE SEGUIDA NÃO PODE DESRISCAR AS DUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `persist()` guardava a checklist inteira antes do pedido e repunha-a no
 * erro. Riscar dois itens de seguida — que é como esta lista se usa, a percorrer
 * e a ir marcando — põe dois PATCH no ar ao mesmo tempo. O segundo leva a lista
 * COMPLETA, já com o primeiro item riscado dentro; quando o servidor o aceita,
 * fica com os dois. Mas o primeiro, ao falhar, repunha o instante anterior às
 * DUAS marcações e desriscava no ecrã uma que estava gravada.
 *
 * O prejuízo não é o pisca-pisca: é a edição seguinte, que grava esse ecrã por
 * cima da verdade. A tarefa volta a "por fazer" na véspera do evento.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ITENS: ChecklistItem[] = [
  { id: "c1", label: "Confirmar catering", done: false },
  { id: "c2", label: "Reservar transporte", done: false },
];

const quoteCom = (checklist: ChecklistItem[]) => ({ id: "q1", checklist }) as Quote;

function montar(checklist: ChecklistItem[], onChange: (i: ChecklistItem[]) => void = () => {}) {
  return render(
    <ToastProvider>
      <EventChecklist quote={quoteCom(checklist)} onChange={onChange} />
    </ToastProvider>,
  );
}

const caixaDe = (label: string) => screen.getByRole("checkbox", { name: label });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Checklist do evento — duas marcações ao mesmo tempo", () => {
  it("a que falha não desmarca a que o servidor aceitou", async () => {
    let recusarPrimeiro: (() => void) | null = null;
    const primeiroPendente = new Promise<Response>((resolve) => {
      recusarPrimeiro = () => resolve(reply(503, { error: "não deu" }));
    });

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++chamadas === 1 ? primeiroPendente : reply(200))),
    );

    const vistoPeloPai: ChecklistItem[][] = [];
    const user = userEvent.setup();
    montar(ITENS, (i) => vistoPeloPai.push(i));

    await user.click(caixaDe("Confirmar catering"));
    await user.click(caixaDe("Reservar transporte"));
    await waitFor(() =>
      expect(caixaDe("Reservar transporte").getAttribute("aria-checked")).toBe("true"),
    );

    recusarPrimeiro!();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      caixaDe("Reservar transporte").getAttribute("aria-checked"),
      "a marcação que o servidor aceitou desapareceu do ecrã",
    ).toBe("true");
    expect(
      caixaDe("Confirmar catering").getAttribute("aria-checked"),
      "a marcação que seguiu no segundo PATCH (aceite) foi desfeita",
    ).toBe("true");
    expect(vistoPeloPai.at(-1)).toEqual([
      { ...ITENS[0], done: true },
      { ...ITENS[1], done: true },
    ]);
  });

  it("uma gravação falhada sozinha continua a repor e a avisar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: "não deu" })),
    );

    const user = userEvent.setup();
    montar(ITENS);

    await user.click(caixaDe("Confirmar catering"));

    await waitFor(() =>
      expect(caixaDe("Confirmar catering").getAttribute("aria-checked")).toBe("false"),
    );
    expect(screen.getByText(/Não foi possível guardar a checklist/)).toBeTruthy();
  });
});
