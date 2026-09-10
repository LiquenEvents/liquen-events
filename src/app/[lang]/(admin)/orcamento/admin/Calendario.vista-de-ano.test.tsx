// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PORTA DA VISTA DE ANO — E O CAMINHO DE VOLTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A fase 07 do `docs/APPLE-CALENDARIO.md` não é só a grelha de doze meses: é a
 * grelha de doze meses ALCANÇÁVEL. Um ecrã escrito e testado que ninguém monta
 * não existe — é o que o `nada-fica-por-montar.test.ts` diz por extenso, e este
 * ficheiro é a metade que esse não consegue medir: ele vê se o ficheiro está no
 * grafo de importações; isto vê se há um gesto que lá chega.
 *
 * E vê a volta, que é a parte que se esquece: a vista de ano responde a «temos
 * livre em Julho?» e a seguir ela quer ver Julho. Se o único caminho de volta
 * fosse trocar de vista e depois navegar mês a mês até Julho, a resposta custava
 * mais do que a pergunta.
 */

const CASAMENTO: Quote = {
  id: "LIQ-1",
  name: "Marta Nunes",
  status: "aceite",
  date: "2026-07-18",
  guests: 120,
} as unknown as Quote;

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
  vi.setSystemTime(new Date("2026-09-10T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar(quotes: Quote[] = []) {
  render(
    <ToastProvider>
      <Calendario quotes={quotes} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Setembro 2026")).toBeInTheDocument());
  // O `userEvent` tem de partilhar o relógio falso com o resto do ficheiro,
  // senão espera por um avanço que nunca chega.
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

describe("chega-se à vista de ano a partir do ecrã", () => {
  it("o mês é o que abre — a vista de trabalho não muda", async () => {
    await montar();
    expect(screen.getByRole("radio", { name: "Mês" })).toBeChecked();
    // A grelha do mês está montada…
    expect(screen.getByRole("group", { name: "Calendário de Setembro 2026" })).toBeInTheDocument();
    // …e as doze do ano não, que é o que faz esta ser a vista de abertura.
    expect(screen.queryAllByRole("grid")).toHaveLength(0);
  });

  it("«Ano» troca a grelha do mês pelos doze mini-meses", async () => {
    const user = await montar([CASAMENTO]);
    await user.click(screen.getByRole("radio", { name: "Ano" }));

    expect(screen.getAllByRole("grid")).toHaveLength(12);
    // O título da vista passa a ser o ano…
    expect(screen.getByText("2026")).toBeInTheDocument();
    // …e o estado da vista conta DIAS FECHADOS, que é a pergunta do ano.
    expect(screen.getByText("1 dia fechado este ano")).toBeInTheDocument();
  });

  it("responde a «temos livre em Julho de 2026?» sem sair da vista", async () => {
    const user = await montar([CASAMENTO]);
    await user.click(screen.getByRole("radio", { name: "Ano" }));

    expect(
      screen.getByRole("button", { name: "Julho de 2026 — 1 dia fechado" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agosto de 2026 — Livre" })).toBeInTheDocument();
  });

  it("as setas passam a andar de ANO, e dizem-no", async () => {
    const user = await montar();
    await user.click(screen.getByRole("radio", { name: "Ano" }));

    await user.click(screen.getByRole("button", { name: "Ano seguinte" }));
    expect(screen.getByText("2027")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ano anterior" }));
    expect(screen.getByText("2026")).toBeInTheDocument();
  });
});

describe("e volta-se dela para o mês que ela escolheu", () => {
  it("carregar em Julho abre Julho na grelha do mês", async () => {
    const user = await montar([CASAMENTO]);
    await user.click(screen.getByRole("radio", { name: "Ano" }));
    await user.click(screen.getByRole("button", { name: /^Julho de 2026/ }));

    expect(screen.getByText("Julho 2026")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Mês" })).toBeChecked();
    // E o casamento está lá, na grelha do mês, onde se lhe pode tocar.
    expect(screen.getAllByLabelText(/Abrir pedido de Marta Nunes/).length).toBeGreaterThan(0);
  });
});
