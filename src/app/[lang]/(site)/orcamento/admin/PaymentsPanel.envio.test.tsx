// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import PaymentsPanel from "./PaymentsPanel";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O ECRÃ DIZ TEM DE SER O QUE O CLIENTE RECEBEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas mentiras, no mesmo `toast`:
 *
 * 1. A PALAVRA. O painel calculava «Recibo/Fatura» por sua conta e a rota
 *    escrevia «Recibo» sempre. Uma linha por pagar dava-lhe «Fatura enviada
 *    para …» no ecrã enquanto o cliente recebia «Recibo FT 2026/0012». Ela nem
 *    ficava a saber que o cliente tinha lido outra palavra. A palavra passa a
 *    vir do servidor — de quem a escreveu no email.
 *
 * 2. O ENDEREÇO. Dizia «enviado para {quote.email}» — o email ACTUAL — mas o
 *    correio sai para o endereço CONGELADO na fatura. Se ela corrigiu o email
 *    em Maio, o documento de Junho sai para o antigo e o ecrã jura o contrário.
 */

const POR_PAGAR: Payment = {
  id: "p1",
  kind: "pagamento",
  amount: 24600,
  date: "2026-06-01",
  paid: false,
} as Payment;

function makeQuote(): Quote {
  return {
    id: "q1",
    name: "Ana & Rui",
    email: "novo@example.com",
    priceBreakdown: { subtotal: 20000, iva: 4600, total: 24600 },
    payments: [POR_PAGAR],
  } as unknown as Quote;
}

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

/** Livro devolvido por /api/faturas — a fatura ficou com o endereço de Abril. */
const LIVRO_COM_ENDERECO_ANTIGO = [
  {
    id: "inv-1",
    number: "FT 2026/0012",
    quoteId: "q1",
    clientName: "Ana & Rui",
    clientEmail: "antigo@example.com",
    kind: "total",
    amount: 24600,
    vatRate: 0.23,
    issuedAt: "2026-04-02",
    status: "emitida",
  },
];

beforeEach(() => {
  fetchMock = vi.fn(async () => ok([]));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function montar() {
  return render(
    <ToastProvider>
      <PaymentsPanel quote={makeQuote()} onChange={vi.fn()} />
    </ToastProvider>,
  );
}

describe("PaymentsPanel — enviar o documento por email", () => {
  it("mostra a PALAVRA e o ENDEREÇO que o servidor usou, não os que adivinhou", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/fatura")
        ? ok({
            number: "FT 2026/0012",
            emailed: true,
            docLabel: "Fatura",
            emailedTo: "antigo@example.com",
          })
        : ok(LIVRO_COM_ENDERECO_ANTIGO),
    );
    montar();

    await user.click(screen.getByRole("button", { name: /Enviar fatura por e-mail/i }));

    const frase = await screen.findByText(/enviada para/i);
    expect(frase.textContent).toContain("Fatura");
    expect(frase.textContent).toContain("antigo@example.com");
    // Não pode dizer o endereço actual (para onde o email NÃO foi)…
    expect(frase.textContent).not.toContain("novo@example.com");
    // …nem chamar recibo a um documento por liquidar.
    expect(frase.textContent).not.toMatch(/recibo/i);
  });

  it("uma linha PAGA continua a falar de recibo", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/fatura")
        ? ok({
            number: "FT 2026/0013",
            emailed: true,
            docLabel: "Recibo",
            emailedTo: "novo@example.com",
          })
        : ok([]),
    );
    render(
      <ToastProvider>
        <PaymentsPanel
          quote={{ ...makeQuote(), payments: [{ ...POR_PAGAR, paid: true }] } as Quote}
          onChange={vi.fn()}
        />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: /Enviar recibo por e-mail/i }));

    const frase = await screen.findByText(/enviado para/i);
    expect(frase.textContent).toContain("Recibo");
    expect(frase.textContent).toContain("novo@example.com");
  });

  /**
   * O aviso é a forma MENOS intrusiva que serve: uma linha de texto ao lado dos
   * botões, sempre visível, sem modal e sem desactivar nada — enviar para o
   * endereço congelado é muitas vezes o que ela quer (o pagador pode ser o
   * espaço ou a wedding planner). O que não pode é ser uma surpresa.
   */
  it("avisa da divergência de endereços ANTES de ela carregar em enviar", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/api/faturas") ? ok(LIVRO_COM_ENDERECO_ANTIGO) : ok({}),
    );
    montar();

    const aviso = await screen.findByText(/estão endereçad/i);
    expect(aviso.textContent).toContain("antigo@example.com");
    expect(aviso.textContent).toContain("novo@example.com");
    // E ninguém carregou em nada: o aviso está lá antes do gesto.
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("/fatura?"))).toBe(false);
  });

  it("sem divergência não há aviso nenhum a estorvar", async () => {
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/api/faturas")
        ? ok([{ ...LIVRO_COM_ENDERECO_ANTIGO[0], clientEmail: "novo@example.com" }])
        : ok({}),
    );
    montar();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(screen.queryByText(/estão endereçad/i)).toBeNull();
  });
});
