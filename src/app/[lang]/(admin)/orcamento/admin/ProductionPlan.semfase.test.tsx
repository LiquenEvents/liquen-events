// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProductionPlan from "./ProductionPlan";
import type { ChecklistItem, Quote } from "@/lib/orcamento/types";
import { PRODUCTION_PHASE_SEP } from "@/lib/production-templates";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONTADA NO CRACHÁ, DESENHADA EM LADO NENHUM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O crachá «X/Y do plano» lê a lista INTEIRA; a vista agrupada só desenha o que
 * começa pelo prefixo de uma fase (`Sourcing · …`). Uma tarefa sem prefixo era
 * contada e invisível — e, não tendo linha, também não tinha caixa para riscar
 * nem × para remover: ficava presa no plano para sempre, a puxar o denominador
 * para cima. Ela conta cinco tarefas no ecrã e lê «2/6».
 *
 * ── Por onde é que uma tarefa sem prefixo entra ────────────────────────────
 * O campo não é privado deste painel:
 *
 *  · a REPOSIÇÃO de uma cópia de segurança (`/api/backup/restore`) valida os
 *    pedidos com um `looseObject` — o `productionPlan` do ficheiro passa tal e
 *    qual, com os rótulos que lá estiverem;
 *  · o PATCH de `/api/orcamento/[id]` aceita `productionPlan` como
 *    `{id, label ≤ 300, done}` — o rótulo é texto livre, sem prefixo obrigado;
 *  · e basta MUDAR O NOME de uma fase em `DECOR_PRODUCTION` para todos os itens
 *    já gravados com o nome antigo deixarem de casar (o que fica guardado é o
 *    rótulo, não a chave da fase).
 *
 * O plano é uma lista de trabalho do atelier: uma tarefa que existe no total e
 * não existe no ecrã é a pior forma de a perder.
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

const SEM_FASE = "Encomendar velas para o jantar";

function montar(
  productionPlan: ChecklistItem[],
  onChange: (i: ChecklistItem[]) => void = () => {},
) {
  return render(
    <ToastProvider>
      <ProductionPlan
        quote={{ id: "q1", productionPlan, eventSuppliers: [] } as unknown as Quote}
        onChange={onChange}
      />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Plano de produção — a tarefa que não cai em fase nenhuma", () => {
  it("aparece no ecrã, e não só na conta do crachá", async () => {
    montar([
      { id: "p1", label: rotulo("Sourcing", "Encomendar flores"), done: true },
      { id: "p2", label: SEM_FASE, done: false },
    ]);

    // O crachá conta as duas…
    expect(screen.getByText("1/2 do plano")).toBeInTheDocument();
    // …e as duas têm de estar desenhadas, com caixa para riscar.
    expect(screen.getByRole("checkbox", { name: rotulo("Sourcing", "Encomendar flores") }));
    expect(
      screen.getByRole("checkbox", { name: SEM_FASE }),
      "contada no total e desenhada em lado nenhum — sem caixa, sem × para remover",
    ).toBeInTheDocument();
  });

  it("um plano só de tarefas sem fase não se diz «por gerar»", () => {
    // O pior caso: o crachá diz «0/2 do plano» ao lado do vazio que convida a
    // aplicar o plano outra vez — e aplicá-lo acrescentava 22 tarefas por cima.
    montar([
      { id: "p1", label: SEM_FASE, done: false },
      { id: "p2", label: "Confirmar transporte", done: false },
    ]);

    expect(screen.queryByText(/plano de produção por gerar/i)).toBeNull();
    expect(screen.getByRole("checkbox", { name: SEM_FASE })).toBeInTheDocument();
  });

  it("risca-se e remove-se como qualquer outra", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200)),
    );
    const vistoPeloPai: ChecklistItem[][] = [];
    const user = userEvent.setup();
    montar([{ id: "p1", label: SEM_FASE, done: false }], (i) => vistoPeloPai.push(i));

    await user.click(screen.getByRole("checkbox", { name: SEM_FASE }));
    await waitFor(() => expect(vistoPeloPai.at(-1)?.[0].done).toBe(true));

    await user.click(screen.getByRole("button", { name: "Remover tarefa" }));
    await waitFor(() => expect(vistoPeloPai.at(-1)).toHaveLength(0));
  });

  it("com tudo em fase, nada muda — não há grupo a mais", () => {
    montar([
      { id: "p1", label: rotulo("Sourcing", "Encomendar flores"), done: false },
      { id: "p2", label: rotulo("Desmontagem/Strike", "Recolher material"), done: false },
    ]);

    expect(screen.getByText("0/2 do plano")).toBeInTheDocument();
    expect(screen.queryByText(/sem fase/i)).toBeNull();
  });
});
