// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import PaymentsPanel from "./PaymentsPanel";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «EM FALTA» NUM EVENTO QUE JÁ FOI TODO PAGO — PELO LIVRO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O painel Financeiro mostra o livro de faturas (FT) ao lado do registo à mão,
 * e o «Em falta» do topo contava só o registo à mão. Um casamento facturado e
 * cobrado pelo caminho fiscal — o sinal e o saldo emitidos no separador
 * Faturas e lá marcados como pagos, que é onde isso se faz — não deixa linha
 * nenhuma em `quote.payments`. O topo dizia então «Recebido 0,00 €» e «Em
 * falta 12.300,00 €» a vermelho, com um atalho «Em falta · 12.300,00 €» pronto
 * a registar a cobrança de um dinheiro que já estava na conta.
 *
 * É o mesmo erro que se corrigiu no «Liquidar o saldo» do cabeçalho do
 * Dossier, no ecrã onde ela age a seguir. `combinedPaidTotal` é a conta que
 * conta as DUAS fontes sem somar o mesmo euro duas vezes — e continua a subir
 * ao vivo quando ela marca um pagamento como pago, que era a razão de o topo
 * ter deixado de olhar para o livro.
 *
 * A métrica «% Pago» do quadro é outra coisa e fica como está: essa é do
 * livro, de propósito.
 */

const okResponse = () => ({ ok: true, status: 200, json: async () => ({}) }) as unknown as Response;

interface FaturaFalsa {
  id: string;
  number: string;
  kind: "sinal" | "saldo" | "total";
  amount: number;
  status: "emitida" | "paga" | "anulada";
  issuedAt: string;
  paidAt?: string;
}

/** Faturas do evento pela rota `/api/faturas`; o resto responde OK. */
function comLivro(faturas: FaturaFalsa[]) {
  return vi.fn(async (url: string) =>
    String(url).startsWith("/api/faturas")
      ? ({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => faturas,
        } as unknown as Response)
      : okResponse(),
  );
}

/** Total c/ IVA = 12.300 € (10.000 € + IVA). */
function pedido(payments: Payment[] = []): Quote {
  return {
    id: "q1",
    name: "Ana & Rui",
    email: "ana@exemplo.pt",
    priceBreakdown: { subtotal: 10_000, iva: 2_300, total: 12_300 },
    payments,
  } as unknown as Quote;
}

function render1(quote: Quote) {
  return render(
    <ToastProvider>
      <PaymentsPanel quote={quote} onChange={vi.fn()} showLedger />
    </ToastProvider>,
  );
}

const SINAL_PAGO: FaturaFalsa = {
  id: "f1",
  number: "FT 2026/1",
  kind: "sinal",
  amount: 3_690,
  status: "paga",
  issuedAt: "2026-01-10",
  paidAt: "2026-01-12",
};
const SALDO_PAGO: FaturaFalsa = {
  id: "f2",
  number: "FT 2026/2",
  kind: "saldo",
  amount: 8_610,
  status: "paga",
  issuedAt: "2026-05-02",
  paidAt: "2026-05-04",
};

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => okResponse()),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("o dinheiro que entrou pelo livro conta no topo", () => {
  it("tudo facturado e pago não deixa «Em falta» nenhum", async () => {
    vi.stubGlobal("fetch", comLivro([SINAL_PAGO, SALDO_PAGO]));
    render1(pedido());

    await waitFor(() => expect(screen.getByText("Tudo recebido")).toBeInTheDocument());
    // E nada a oferecer-se para cobrar outra vez o que já está cobrado.
    expect(screen.queryByRole("button", { name: /Em falta ·/ })).not.toBeInTheDocument();
  });

  it("só o sinal facturado deixa em falta o saldo, e não o total", async () => {
    vi.stubGlobal("fetch", comLivro([SINAL_PAGO]));
    render1(pedido());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Em falta ·/ }).textContent).toMatch(/8.?610,00/),
    );
  });

  it("uma fatura anulada não conta como dinheiro recebido", async () => {
    vi.stubGlobal("fetch", comLivro([SINAL_PAGO, { ...SALDO_PAGO, status: "anulada" }]));
    render1(pedido());

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Em falta ·/ }).textContent).toMatch(/8.?610,00/),
    );
  });

  it("o mesmo dinheiro nos dois sítios conta uma vez só", async () => {
    // O caminho normal: regista-se o pagamento à mão e emite-se o recibo a
    // partir dessa linha. Somar as duas fontes daria o dobro.
    vi.stubGlobal("fetch", comLivro([SINAL_PAGO]));
    render1(
      pedido([
        { id: "p1", kind: "sinal", amount: 3_690, date: "2026-01-12", paid: true } as Payment,
      ]),
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Em falta ·/ }).textContent).toMatch(/8.?610,00/),
    );
    expect(screen.queryByText(/Recebido excede o total contratado/)).not.toBeInTheDocument();
  });

  it("sem livro à vista (Dossier), continua a ser o registo à mão a mandar", () => {
    // `showLedger` desligado nem sequer pede as faturas — o painel do Dossier
    // não muda de comportamento.
    render(
      <ToastProvider>
        <PaymentsPanel
          quote={pedido([
            { id: "p1", kind: "sinal", amount: 3_690, date: "2026-01-12", paid: true } as Payment,
          ])}
          onChange={vi.fn()}
        />
      </ToastProvider>,
    );
    expect(screen.getByRole("button", { name: /Em falta ·/ }).textContent).toMatch(/8.?610,00/);
  });
});
