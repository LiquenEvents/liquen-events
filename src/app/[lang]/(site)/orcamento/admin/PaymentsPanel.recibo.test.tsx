// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import PaymentsPanel from "./PaymentsPanel";
import type { Payment, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "RECIBO DESCARREGADO" SEM FICHEIRO NENHUM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `toast` de sucesso estava FORA do `if (data.pdfBase64)`. Uma resposta 200
 * sem PDF — que é o que a rota devolve quando o gerador não produziu nada —
 * dizia à mesma "Recibo descarregado". Ela vai à pasta das transferências, não
 * encontra nada, e não tem como saber se o que falhou foi o programa, o
 * browser, ou ela própria. E se estiver ao telefone com o cliente a prometer o
 * recibo, promete-o na mesma.
 *
 * A segunda metade: o `<a>` nunca era ligado ao documento antes do `click()`.
 * No Firefox um elemento fora da árvore não dispara a transferência — a frase
 * "descarregado" era falsa ali TODAS as vezes. O `ProposalStudio` já fazia o
 * correcto (`document.body.appendChild(a)` … `a.remove()`).
 *
 * Nota sobre o `docLabel` nas respostas simuladas: a palavra («Recibo» ou
 * «Fatura») deixou de ser calculada no painel e passa a vir do servidor, que é
 * quem a escreve no email e no nome do anexo. É por isso que ela aparece agora
 * no corpo da resposta — sem ela, o painel não teria como saber que documento
 * acabou de sair. Ver `PaymentsPanel.envio.test.tsx`.
 */

const PAGAMENTO: Payment = {
  id: "p0",
  kind: "sinal",
  amount: 369,
  date: "2026-01-10",
  paid: true,
} as Payment;

function makeQuote(): Quote {
  return {
    id: "q1",
    name: "Ana & Rui",
    email: "ana@exemplo.pt",
    priceBreakdown: { subtotal: 1000, iva: 230, total: 1230 },
    payments: [PAGAMENTO],
  } as unknown as Quote;
}

const ok = (body: unknown) =>
  ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async () => ok({}));
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

async function pedirODocumento(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /Descarregar recibo PDF/i }));
}

describe("PaymentsPanel — descarregar o recibo", () => {
  it("um 200 SEM PDF não pode dizer “Recibo descarregado”", async () => {
    const user = userEvent.setup();
    // A rota respondeu bem, mas não veio ficheiro nenhum.
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/fatura") ? ok({ number: "FT 2026/0001", docLabel: "Recibo" }) : ok({}),
    );
    montar();

    await pedirODocumento(user);

    await waitFor(() => expect(screen.getByText(/Recibo/)).toBeTruthy());
    expect(
      screen.queryByText("Recibo descarregado"),
      "não houve ficheiro nenhum para descarregar",
    ).toBeNull();
    // E tem de DIZER que não veio documento, senão o silêncio lê-se como êxito.
    expect(screen.getByText(/não foi possível gerar o PDF|sem documento/i)).toBeTruthy();
  });

  it("com PDF, liga o link ao documento antes do clique (senão o Firefox não descarrega)", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/fatura")
        ? ok({ number: "FT 2026/0001", docLabel: "Recibo", pdfBase64: "JVBERi0xLjQK" })
        : ok({}),
    );

    // Espiar o momento do clique: o elemento tem de estar na árvore nesse
    // instante — é essa a condição que o Firefox impõe.
    let ligadoAoDocumentoNoClique: boolean | null = null;
    const clickOriginal = HTMLAnchorElement.prototype.click;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      if (this.download) ligadoAoDocumentoNoClique = document.body.contains(this);
      return clickOriginal.call(this);
    });

    montar();
    await pedirODocumento(user);

    await waitFor(() => expect(ligadoAoDocumentoNoClique).not.toBeNull());
    expect(
      ligadoAoDocumentoNoClique,
      "um <a> fora da árvore não dispara a transferência no Firefox",
    ).toBe(true);
    // Aí sim, a frase é verdadeira.
    expect(await screen.findByText("Recibo descarregado")).toBeTruthy();
  });

  it("e não deixa o link pendurado no documento depois de clicar", async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation(async (url: string) =>
      String(url).includes("/fatura")
        ? ok({ number: "FT 2026/0001", docLabel: "Recibo", pdfBase64: "JVBERi0xLjQK" })
        : ok({}),
    );
    montar();

    await pedirODocumento(user);
    await screen.findByText("Recibo descarregado");
    expect(document.querySelectorAll("a[download]")).toHaveLength(0);
  });
});
