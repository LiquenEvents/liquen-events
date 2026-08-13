// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProductionPlan from "./ProductionPlan";
import type { ChecklistItem, EventSupplier, Quote } from "@/lib/orcamento/types";
import { PRODUCTION_PHASE_SEP } from "@/lib/production-templates";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PLANO DE PRODUÇÃO — DUAS MARCAÇÕES SEGUIDAS, E UM ESTADO DESCONHECIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── 1. A gravação que falha desfazia a que resultou ────────────────────────
 * O `persist()` guardava o plano inteiro antes do `await` e repunha-o no
 * `catch`. O atelier risca tarefas em série; com dois PATCH no ar, o segundo
 * leva o plano COMPLETO (já com a primeira marcação dentro) e o servidor fica
 * com as duas — mas a primeira, ao falhar, repunha o instante anterior às DUAS.
 *
 * ── 2. Um estado de fornecedor fora do mapa levava o back office inteiro ───
 * `STATUS_LABEL[s.status].color` dá `undefined.color` assim que aparece um valor
 * de fora. Num componente de cliente isso não perde a linha do fornecedor: sobe
 * ao limite de erro e substitui o BACK OFFICE TODO. Mesma forma (e mesmo
 * remédio) do `metaFor` em `status-meta.ts`.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const rotulo = (fase: string, tarefa: string) => `${fase}${PRODUCTION_PHASE_SEP}${tarefa}`;

const PLANO: ChecklistItem[] = [
  { id: "p1", label: rotulo("Sourcing", "Encomendar flores"), done: false },
  { id: "p2", label: rotulo("Sourcing", "Confirmar vasos"), done: false },
];

const quoteCom = (productionPlan: ChecklistItem[], eventSuppliers: EventSupplier[] = []) =>
  ({ id: "q1", productionPlan, eventSuppliers }) as Quote;

function montar(
  productionPlan: ChecklistItem[],
  eventSuppliers: EventSupplier[] = [],
  onChange: (i: ChecklistItem[]) => void = () => {},
) {
  return render(
    <ToastProvider>
      <ProductionPlan quote={quoteCom(productionPlan, eventSuppliers)} onChange={onChange} />
    </ToastProvider>,
  );
}

const caixaDe = (label: string) => screen.getByRole("checkbox", { name: label });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Plano de produção — duas marcações ao mesmo tempo", () => {
  it("a que falha não desmarca a que o servidor aceitou", async () => {
    let recusarPrimeira: (() => void) | null = null;
    const primeiraPendente = new Promise<Response>((resolve) => {
      recusarPrimeira = () => resolve(reply(500, { error: "não deu" }));
    });

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++chamadas === 1 ? primeiraPendente : reply(200))),
    );

    const vistoPeloPai: ChecklistItem[][] = [];
    const user = userEvent.setup();
    montar(PLANO, [], (i) => vistoPeloPai.push(i));

    await user.click(caixaDe(PLANO[0].label));
    await user.click(caixaDe(PLANO[1].label));
    await waitFor(() => expect(caixaDe(PLANO[1].label).getAttribute("aria-checked")).toBe("true"));

    recusarPrimeira!();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      caixaDe(PLANO[1].label).getAttribute("aria-checked"),
      "a marcação que o servidor aceitou desapareceu do ecrã",
    ).toBe("true");
    expect(
      caixaDe(PLANO[0].label).getAttribute("aria-checked"),
      "a marcação que seguiu no segundo PATCH (aceite) foi desfeita",
    ).toBe("true");
    expect(vistoPeloPai.at(-1)).toEqual([
      { ...PLANO[0], done: true },
      { ...PLANO[1], done: true },
    ]);
  });

  it("uma gravação falhada sozinha continua a repor e a avisar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: "não deu" })),
    );

    const user = userEvent.setup();
    montar(PLANO);

    await user.click(caixaDe(PLANO[0].label));

    await waitFor(() => expect(caixaDe(PLANO[0].label).getAttribute("aria-checked")).toBe("false"));
    expect(screen.getByText(/Não foi possível guardar o plano de produção/)).toBeTruthy();
  });
});

describe("Plano de produção — um estado de fornecedor que o mapa não conhece", () => {
  it("desenha a linha do fornecedor em vez de deitar o back office abaixo", () => {
    const fornecedor = {
      id: "f1",
      name: "Flores do Tejo",
      category: "Flores",
      estimatedCost: 1500,
      status: "faturado",
    } as unknown as EventSupplier;

    expect(() => montar(PLANO, [fornecedor])).not.toThrow();
    expect(screen.getByText("Flores do Tejo")).toBeTruthy();
    // O valor cru fica à vista, para se saber qual é a linha estranha.
    expect(screen.getByText("faturado")).toBeTruthy();
  });
});
