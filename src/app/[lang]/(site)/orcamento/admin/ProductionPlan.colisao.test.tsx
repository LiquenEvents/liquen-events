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
 * DUAS PESSOAS NO MESMO PLANO, E AS DUAS RECEBIAM 200
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O plano é copiado UMA vez, ao montar, e ao gravar vai INTEIRO: a gravação é
 * «substitui o plano por este», e não «risca esta tarefa».
 *
 * O CENÁRIO: duas pessoas no atelier, cada uma com o seu telemóvel, a riscar o
 * mesmo plano ao longo da manhã. A que abriu o painel primeiro risca uma
 * tarefa às onze e manda o plano que copiou às nove — e as tarefas que a colega
 * riscou pelo meio voltam todas a por fazer, com as duas gravações a responder
 * 200. O que se vê é o trabalho a aparecer por fazer no dia seguinte.
 *
 * A correcção é o ecrã DIZER de onde copiou (`base`) e o servidor recusar com
 * 409. E o 409 não pode deitar fora o gesto: o plano do servidor entra no ecrã
 * e o gesto fica ali, por aplicar, à distância de um clique.
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

/** O que a COLEGA fez no telemóvel dela enquanto este painel estava aberto. */
const DELA: ChecklistItem[] = [
  { ...PLANO[0], done: true },
  PLANO[1],
  { id: "p9", label: rotulo("Montagem", "Levar escadote"), done: false },
];

const quoteCom = (productionPlan: ChecklistItem[], eventSuppliers: EventSupplier[] = []) =>
  ({ id: "q1", productionPlan, eventSuppliers }) as Quote;

function montar(
  productionPlan: ChecklistItem[],
  onChange: (i: ChecklistItem[]) => void = () => {},
) {
  return render(
    <ToastProvider>
      <ProductionPlan quote={quoteCom(productionPlan)} onChange={onChange} />
    </ToastProvider>,
  );
}

const caixaDe = (label: string) => screen.getByRole("checkbox", { name: label });

/** Os corpos dos PATCH, pela ordem por que saíram. */
function corpos(): {
  productionPlan: ChecklistItem[];
  base?: { productionPlan?: ChecklistItem[] };
}[] {
  const f = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  return f.mock.calls.map((c) => JSON.parse(String((c[1] as RequestInit).body)));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Plano de produção — de onde o plano foi copiado", () => {
  it("manda a versão de que partiu, e a seguinte declara o que a anterior deixou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar(PLANO);

    await user.click(caixaDe(PLANO[0].label));
    await waitFor(() => expect(corpos()).toHaveLength(1));
    expect(corpos()[0].base?.productionPlan).toEqual(PLANO);

    await user.click(caixaDe(PLANO[1].label));
    await waitFor(() => expect(corpos()).toHaveLength(2));
    // A base avança ao ENVIAR: riscar duas seguidas põe dois PATCH no ar e o
    // segundo já leva o primeiro dentro — declarar a versão de antes do
    // primeiro era inventar uma colisão dela consigo própria.
    expect(corpos()[1].base?.productionPlan).toEqual(corpos()[0].productionPlan);
  });
});

describe("Plano de produção — um 409 com trabalho por gravar no ecrã", () => {
  const colide = () =>
    vi.fn(async () => reply(409, { error: "mudou", current: { productionPlan: DELA } }));

  it("adopta o plano do servidor sem apagar a tarefa que ela tinha por acrescentar", async () => {
    vi.stubGlobal("fetch", colide());
    const user = userEvent.setup();
    montar(PLANO);

    // Trabalho por gravar: a tarefa seguinte já escrita na caixa de baixo.
    await user.type(screen.getByLabelText("Nova tarefa de produção"), "Encomendar velas");
    // E, no meio disso, um gesto que colide.
    await user.click(caixaDe(PLANO[1].label));

    // O plano do servidor entra no ecrã — incluindo o que a colega fez.
    expect(await screen.findByRole("checkbox", { name: DELA[2].label })).toBeTruthy();
    expect(caixaDe(PLANO[0].label).getAttribute("aria-checked")).toBe("true");
    expect(
      caixaDe(PLANO[1].label).getAttribute("aria-checked"),
      "a marcação recusada ficou riscada no ecrã como se tivesse passado",
    ).toBe("false");
    // E o que ela estava a escrever continua lá.
    expect((screen.getByLabelText("Nova tarefa de produção") as HTMLInputElement).value).toBe(
      "Encomendar velas",
    );
    // O aviso fica no ecrã (um toast desaparecia) e NOMEIA o gesto travado.
    expect(screen.getByText(/marcar «Sourcing · Confirmar vasos»/)).toBeTruthy();
  });

  it("«Voltar a aplicar» risca a tarefa POR CIMA do plano da colega, sem desfazer o dela", async () => {
    const fetchMock = colide();
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    montar(PLANO);

    await user.click(caixaDe(PLANO[1].label));
    await screen.findByRole("button", { name: "Voltar a aplicar" });

    fetchMock.mockImplementation(async () => reply(200));
    await user.click(screen.getByRole("button", { name: "Voltar a aplicar" }));
    await waitFor(() => expect(corpos()).toHaveLength(2));

    const gravado = corpos()[1].productionPlan;
    // A tarefa dela ficou riscada, a da colega continua riscada, e a tarefa
    // nova da colega não desapareceu. Reaplicar a lista velha apagava as duas.
    expect(gravado.find((i) => i.id === "p2")?.done).toBe(true);
    expect(gravado.find((i) => i.id === "p1")?.done).toBe(true);
    expect(gravado.some((i) => i.id === "p9")).toBe(true);
    expect(corpos()[1].base?.productionPlan).toEqual(DELA);
    expect(screen.queryByRole("button", { name: "Voltar a aplicar" })).toBeNull();
  });

  it("o caso feliz continua mudo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const user = userEvent.setup();
    montar(PLANO);

    await user.click(caixaDe(PLANO[0].label));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.queryByRole("button", { name: "Voltar a aplicar" })).toBeNull();
    expect(screen.queryByText(/mudou noutro sítio/i)).toBeNull();
  });
});
