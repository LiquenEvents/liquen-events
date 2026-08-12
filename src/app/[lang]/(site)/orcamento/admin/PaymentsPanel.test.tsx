// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import PaymentsPanel from "./PaymentsPanel";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * REGISTAR UM PAGAMENTO TEM DE CUSTAR UMA MÃO NO TECLADO.
 *
 * A dona usa este painel dezenas de vezes por proposta, muitas vezes com o
 * cliente ao telefone. O que estes testes fixam é o caminho curto:
 *   · Enter em QUALQUER campo regista (o <form> dá submissão implícita);
 *   · depois de registar, o foco volta ao PRIMEIRO campo (encadear sem rato);
 *   · uma sugestão preenche o valor com um clique;
 *   · o valor de uma linha edita-se ali mesmo, sem modal;
 *   · e se o servidor recusar, o ecrã reverte E mostra a linha marcada com
 *     "Repetir" — o dinheiro no ecrã nunca pode divergir da base de dados.
 */

const okResponse = () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

/** Total c/ IVA = 1230 € → sinal 30% = 369 €. */
function makeQuote(payments: Payment[] = []): Quote {
  return {
    id: "q1",
    name: "Ana & Rui",
    email: "ana@exemplo.pt",
    priceBreakdown: { subtotal: 1000, iva: 230, total: 1230 },
    payments,
  } as unknown as Quote;
}

function renderPanel(quote: Quote, onChange = vi.fn()) {
  return render(
    <ToastProvider>
      <PaymentsPanel quote={quote} onChange={onChange} />
    </ToastProvider>,
  );
}

/** Corpo `payments` do último PATCH ao orçamento. */
function lastSavedPayments(): Payment[] {
  const calls = fetchMock.mock.calls.filter((c) => String(c[0]).startsWith("/api/orcamento/"));
  const last = calls[calls.length - 1];
  return JSON.parse(String((last[1] as RequestInit).body)).payments as Payment[];
}

beforeEach(() => {
  fetchMock = vi.fn(async () => okResponse());
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("PaymentsPanel — linha única de registo", () => {
  it("Enter no campo Valor regista o pagamento", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    const valor = screen.getByLabelText("Valor em euros");
    await user.clear(valor);
    await user.type(valor, "1.500{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    // "1.500" é hábito pt-PT: mil e quinhentos, não 1,5 €.
    expect(lastSavedPayments()[1].amount).toBe(1500);
  });

  it("Enter no campo Método também regista (submissão implícita do <form>)", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    await user.type(screen.getByLabelText("Valor em euros"), "250,50");
    await user.type(screen.getByLabelText("Método ou nota (opcional)"), "MB Way{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    expect(lastSavedPayments()[1]).toMatchObject({ amount: 250.5, note: "MB Way", paid: true });
  });

  it("depois de registar, o foco volta ao primeiro campo e o valor fica limpo", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    const valor = screen.getByLabelText("Valor em euros");
    await user.type(valor, "300{Enter}");

    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    expect(screen.getByLabelText("Tipo de pagamento")).toHaveFocus();
    expect(valor).toHaveValue("");
  });

  it("um clique numa sugestão preenche o valor", async () => {
    const user = userEvent.setup();
    // 300 € já recebidos de 1230 € → em falta 930 €.
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 300, date: "2026-01-10", paid: true }]),
    );

    const valor = screen.getByLabelText("Valor em euros");
    expect(valor).toHaveValue("");

    await user.click(screen.getByRole("button", { name: /Em falta/ }));
    expect(valor).toHaveValue("930,00");

    await user.click(screen.getByRole("button", { name: /Sinal 30%/ }));
    expect(valor).toHaveValue("369,00");
  });

  it("com o painel vazio, a linha já traz o sinal sugerido (nenhuma caixa de aviso)", () => {
    renderPanel(makeQuote());
    expect(screen.getByLabelText("Valor em euros")).toHaveValue("369,00");
  });

  it("carregar em Registar sem valor não bloqueia o botão — aponta o erro e devolve o foco", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 100, date: "2026-01-10", paid: true }]),
    );

    const registar = screen.getByRole("button", { name: "Registar" });
    expect(registar).toBeEnabled();
    await user.click(registar);

    expect(await screen.findByText(/Escreve um valor maior que zero/)).toBeInTheDocument();
    expect(screen.getByLabelText("Valor em euros")).toHaveFocus();
  });
});

describe("PaymentsPanel — lista", () => {
  it("edição inline do valor grava (clico, altero, Enter)", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 369, date: "2026-01-10", paid: true }]),
    );

    await user.click(screen.getByRole("button", { name: /Editar valor de Sinal/ }));
    const editor = screen.getByLabelText("Valor de Sinal em euros");
    expect(editor).toHaveFocus();

    await user.clear(editor);
    await user.type(editor, "400{Enter}");

    await waitFor(() => expect(lastSavedPayments()[0].amount).toBe(400));
    // Volta a ser texto — sem modal, sem campo aberto por engano.
    expect(screen.queryByLabelText("Valor de Sinal em euros")).not.toBeInTheDocument();
  });

  it("o badge de estado alterna pago/pendente", async () => {
    const user = userEvent.setup();
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 369, date: "2026-01-10", paid: false }]),
    );

    const badge = screen.getByRole("switch");
    expect(badge).toHaveAttribute("aria-checked", "false");
    await user.click(badge);

    await waitFor(() => expect(lastSavedPayments()[0].paid).toBe(true));
    expect(screen.getByRole("switch")).toHaveAttribute("aria-checked", "true");
  });

  it("se o servidor recusar, reverte E deixa a linha com um Repetir", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).startsWith("/api/orcamento/")
        ? ({ ok: false, status: 500, json: async () => ({}) } as unknown as Response)
        : okResponse(),
    );
    renderPanel(
      makeQuote([{ id: "p0", kind: "sinal", amount: 300, date: "2026-01-10", paid: true }]),
    );

    await user.type(screen.getByLabelText("Valor em euros"), "930{Enter}");

    // Reverteu (só o pagamento antigo continua na lista)…
    const repetir = await screen.findByRole("button", { name: "Repetir" });
    expect(screen.getByText("Não guardado")).toBeInTheDocument();
    expect(screen.getAllByRole("switch")).toHaveLength(1);

    // …e o Repetir volta a tentar a MESMA gravação.
    fetchMock.mockImplementation(async () => okResponse());
    await user.click(repetir);
    await waitFor(() => expect(lastSavedPayments()).toHaveLength(2));
    expect(screen.queryByText("Não guardado")).not.toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ATALHO DO SINAL TEM DE DAR O MESMO NÚMERO QUE A FACTURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A percentagem do sinal é uma caixa editável na proposta, e é ela que as
 * rotas de facturação usam (`depositPercentOf`). Este painel dividia sempre
 * 30/70: numa proposta de 50%, o botão oferecia 369 € e a factura emitida era
 * de 615 €. Ela regista o que o botão diz, e o «Em falta» fica errado a partir
 * daí — sem nada no ecrã a denunciá-lo.
 */
describe("PaymentsPanel — o sinal sugerido é o da proposta", () => {
  beforeEach(() => {
    __resetListCache();
  });

  const comProposta = (pctSinal: number) =>
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas")
        ? ({
            ok: true,
            status: 200,
            headers: new Headers(),
            json: async () => [{ id: "p1", quoteId: "q1", pctSinal }],
          } as unknown as Response)
        : okResponse(),
    );

  it("uma proposta de 50% sugere metade do total", async () => {
    fetchMock = comProposta(50);
    vi.stubGlobal("fetch", fetchMock);
    renderPanel(makeQuote());

    // Total c/ IVA = 1230 € → 50% = 615 €.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sinal 50%/ }).textContent).toMatch(/615,00/),
    );
  });

  it("sem proposta que diga outra coisa, continua a ser 30%", async () => {
    renderPanel(makeQuote());
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Sinal 30%/ }).textContent).toMatch(/369,00/),
    );
  });
});
