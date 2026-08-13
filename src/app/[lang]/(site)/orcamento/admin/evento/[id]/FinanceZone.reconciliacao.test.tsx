// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import FinanceZone from "./FinanceZone";
import { reconcileFinance, type DossierInvoice } from "@/lib/orcamento/dossier";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVISO DE RECONCILIAÇÃO CHAMAVA «EMITIDAS» ÀS FATURAS PAGAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `reconcileFinance` confronta os pagamentos registados à mão com o que o LIVRO
 * diz estar PAGO (`ledgerPaidTotal` só soma as faturas com `status: "paga"`). O
 * aviso âmbar mostrava esse número com a legenda «faturas emitidas».
 *
 * O percurso normal em que isto acontece é o mais banal de todos: a fatura do
 * sinal está emitida, o cliente pagou, ela regista o pagamento em Pagamentos e
 * ainda não foi marcar a fatura como paga. O aviso dizia-lhe «faturas emitidas
 * (0,00 €)» — com uma fatura de 3.690 € emitida a três centímetros dali, na
 * mesma secção. Quem lê fica a discutir com o ecrã em vez de ir marcar a
 * fatura, que é a única coisa que falta fazer.
 */

// As ferramentas pesadas (Pagamentos, Custos) chegam por `next/dynamic`; aqui o
// que se mede é o texto do aviso, e não o que elas desenham.
vi.mock("../../lazy", () => ({
  PaymentsPanel: () => null,
  EventCosts: () => null,
}));

const QUOTE = {
  id: "LIQ-1",
  name: "Ana Ribeiro",
  email: "ana@exemplo.pt",
  phone: "910000000",
  status: "aceite",
  submittedAt: "2026-01-10T10:00:00.000Z",
  date: "2026-08-20",
  quotedPrice: 10_000,
  // Ela registou o sinal à mão, no painel de Pagamentos.
  payments: [{ id: "p1", kind: "sinal", amount: 3_690, paid: true }],
} as unknown as Quote;

/** A fatura do sinal EXISTE e está emitida — só não está marcada como paga. */
const FATURAS: DossierInvoice[] = [
  {
    id: "ft1",
    number: "FT 2026/12",
    kind: "sinal",
    amount: 3_690,
    status: "emitida",
    issuedAt: "2026-02-01",
  },
];

beforeEach(() => {
  // `usePercentagemDoSinal` lê a lista leve de propostas; sem proposta vale a
  // percentagem da casa, que é o que este teste quer.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("FinanceZone — o aviso de reconciliação", () => {
  it("chama PAGAS ao número das faturas pagas, e não «emitidas»", () => {
    const reconciliation = reconcileFinance({
      quote: QUOTE,
      proposal: null,
      contract: null,
      invoices: FATURAS,
    });
    // Pré-condição: o número do lado do livro é o das faturas PAGAS (nenhuma).
    expect(reconciliation.diverges).toBe(true);
    expect(reconciliation.ledgerPaid).toBe(0);

    render(
      <FinanceZone
        quote={QUOTE}
        invoices={FATURAS}
        reconciliation={reconciliation}
        onQuoteChange={() => {}}
      />,
    );

    const aviso = screen.getByRole("alert");
    expect(aviso).toHaveTextContent(/faturas pagas/i);
    // A frase que estava lá: um 0,00 € apresentado como o total emitido, com uma
    // fatura de 3.690 € emitida na tabela logo abaixo.
    expect(aviso).not.toHaveTextContent(/faturas emitidas/i);
  });
});
