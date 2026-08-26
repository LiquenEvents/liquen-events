// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import type { Quote, Payment } from "@/lib/orcamento/types";
import { computeEventMetrics, paidTotal } from "@/lib/orcamento/dossier";
// Os MESMOS formatadores que os ecrãs usam: o que se afirma aqui é a CONTA, não
// a pontuação (essa tem os seus próprios testes, em `dinheiro-nos-documentos`).
import { eur0, eur as eur2 } from "@/lib/money";
import Overview from "./Overview";
import PaymentsPanel from "./PaymentsPanel";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DINHEIRO RECEBIDO — DEPOIS DE A FACTURAÇÃO SAIR DAQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A casa passou a emitir as facturas noutro programa e o livro de facturas saiu
 * desta aplicação. O REGISTO DE PAGAMENTOS ficou — é ele a razão de ela ter
 * pedido para tirar só a emissão: é onde está escrito quem pagou o quê e
 * quando, e é dele que saem, hoje, todos os números de dinheiro do back office.
 *
 * Estes testes existem porque essa mudança pode partir em SILÊNCIO. Os números
 * do «Recebido» e do «A receber» não dão erro quando deixam de contar uma das
 * suas fontes: dão um número mais baixo, com o mesmo ar de estarem certos. Um
 * «Recebido 0,00 €» num casamento pago é indistinguível, à vista, de um
 * casamento por pagar — e a reacção a ele é ir cobrar outra vez.
 *
 * Cobrem-se aqui as três superfícies onde esse silêncio custaria dinheiro, que
 * são as que a suite de facturas cobria pelo lado do livro:
 *
 *   1. a VISÃO GERAL — o «Recebido» e o «A receber» do cartão do dinheiro, que
 *      é o primeiro ecrã que ela abre de manhã e não tinha teste nenhum;
 *   2. o PAINEL DE PAGAMENTOS — o topo «Recebido / Em falta» de um pedido;
 *   3. o DOSSIÊ do evento — o que sobrou da reconciliação financeira: o
 *      `computeEventMetrics`, que passou a tirar `paid`/`pctPaid` dos
 *      pagamentos em vez das facturas dadas por pagas.
 */

// ── Ferramentas ────────────────────────────────────────────────────────────

/** Um pagamento RECEBIDO; os testes sobrepõem só o que interessa. */
const recebido = (over: Partial<Payment> = {}): Payment => ({
  id: "p1",
  kind: "sinal",
  amount: 3690,
  date: "2026-03-01",
  paid: true,
  ...over,
});

/** Um pagamento agendado mas AINDA POR receber. */
const porReceber = (over: Partial<Payment> = {}): Payment =>
  recebido({ id: "p2", kind: "saldo", amount: 8610, date: "2026-07-10", paid: false, ...over });

function quote(over: Partial<Quote> = {}): Quote {
  return {
    id: "LQ-001",
    name: "Casamento da Ana",
    email: "ana@example.com",
    status: "aceite",
    submittedAt: "2026-01-10T10:00:00.000Z",
    lastUpdated: "2026-02-01T10:00:00.000Z",
    date: "2026-09-12",
    guests: 80,
    // 12 300 € COM IVA — a base em que os pagamentos se comparam.
    priceBreakdown: { subtotal: 10000, iva: 2300, total: 12300 },
    payments: [],
    ...over,
  } as unknown as Quote;
}

/**
 * O valor que está imediatamente acima de um rótulo — é assim que os dois
 * cartões do dinheiro se desenham: o número por cima, o rótulo por baixo.
 * Ancorar no RÓTULO (e não no número) é o que faz este teste falhar quando o
 * número muda, em vez de falhar quando o desenho muda.
 */
const valorDe = (rotulo: HTMLElement) => rotulo.previousElementSibling!.textContent!.trim();

beforeEach(() => {
  // O Reminders e a Agenda que a Visão Geral monta lêem as tarefas e o
  // calendário pela cache partilhada, que vive no MÓDULO e sobreviveria de um
  // teste para o outro. Um teste que conta dinheiro tem de começar sempre da
  // mesma folha (é o mesmo cuidado do `Overview.test.tsx`).
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// ── 1. A Visão Geral ───────────────────────────────────────────────────────

describe("Visão Geral — «Recebido» e «A receber» saem do registo de pagamentos", () => {
  function desenharVisaoGeral(quotes: Quote[]) {
    // A Visão Geral lê as notas/meta do servidor; aqui só interessa o cartão do
    // dinheiro, por isso a leitura devolve vazio e nunca falha.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => ({ campos: [] }),
      })),
    );
    return render(
      <Overview
        quotes={quotes}
        userName="Rita"
        onOpen={() => {}}
        onGoStats={() => {}}
        onGo={() => {}}
        onNew={() => {}}
      />,
    );
  }

  /** O cartão «Dinheiro — recebido e a receber», isolado do resto do ecrã. */
  function cartaoDoDinheiro(): HTMLElement {
    return screen.getByRole("heading", { name: "Dinheiro — recebido e a receber" }).parentElement!
      .parentElement as HTMLElement;
  }

  it("soma o que está marcado como recebido, e só isso", () => {
    desenharVisaoGeral([
      quote({ payments: [recebido({ amount: 3690 }), porReceber({ amount: 8610 })] }),
    ]);
    const cartao = cartaoDoDinheiro();

    // «Recebido» é o sinal que entrou; «A receber» é o saldo que ainda não.
    expect(valorDe(within(cartao).getByText("Recebido", { selector: "p" }))).toBe(eur0(3690));
    expect(valorDe(within(cartao).getByText("A receber", { selector: "p" }))).toBe(eur0(8610));
  });

  it("soma vários pedidos — é o total da casa, não o de um evento", () => {
    desenharVisaoGeral([
      quote({ id: "LQ-001", payments: [recebido({ amount: 1000 })] }),
      quote({ id: "LQ-002", payments: [recebido({ id: "p9", amount: 500 })] }),
      quote({ id: "LQ-003", payments: [porReceber({ amount: 250 })] }),
    ]);
    const cartao = cartaoDoDinheiro();

    expect(valorDe(within(cartao).getByText("Recebido", { selector: "p" }))).toBe(eur0(1500));
    expect(valorDe(within(cartao).getByText("A receber", { selector: "p" }))).toBe(eur0(250));
  });

  it("um pedido sem pagamentos nenhuns não inventa dinheiro", () => {
    desenharVisaoGeral([quote({ payments: [] })]);
    const cartao = cartaoDoDinheiro();
    expect(valorDe(within(cartao).getByText("Recebido", { selector: "p" }))).toBe(eur0(0));
    expect(valorDe(within(cartao).getByText("A receber", { selector: "p" }))).toBe(eur0(0));
  });
});

// ── 2. O painel de Pagamentos ──────────────────────────────────────────────

describe("Painel de Pagamentos — o topo «Recebido / Em falta» de um pedido", () => {
  function desenharPainel(q: Quote) {
    return render(
      <ToastProvider>
        <PaymentsPanel quote={q} onChange={() => {}} />
      </ToastProvider>,
    );
  }

  const recebidoNoTopo = () => valorDe(screen.getByText("Recebido", { selector: "p" }));
  const emFaltaNoTopo = () => valorDe(screen.getByText("Em falta", { selector: "p" }));

  it("«Recebido» sobe com as linhas marcadas como recebidas", () => {
    desenharPainel(quote({ payments: [recebido({ amount: 3690 })] }));
    expect(recebidoNoTopo()).toBe(eur2(3690));
  });

  it("«Em falta» é o contratado menos o recebido — e não o contratado inteiro", () => {
    // 12 300 € contratados, 3 690 € recebidos → faltam 8 610 €. Este era o
    // número que aparecia a vermelho e inteiro quando o «Recebido» perdia a sua
    // fonte, com um atalho ao lado pronto a cobrar o que já estava na conta.
    desenharPainel(quote({ payments: [recebido({ amount: 3690 })] }));
    expect(emFaltaNoTopo()).toBe(eur2(8610));
  });

  it("uma linha POR receber não conta como recebida", () => {
    desenharPainel(quote({ payments: [porReceber({ amount: 8610 })] }));
    expect(recebidoNoTopo()).toBe(eur2(0));
    // Nada recebido → falta o contratado todo.
    expect(emFaltaNoTopo()).toBe(eur2(12300));
  });

  it("recebido o contratado todo, não fica nada em falta", () => {
    desenharPainel(
      quote({
        payments: [recebido({ amount: 3690 }), recebido({ id: "p2", kind: "saldo", amount: 8610 })],
      }),
    );
    expect(recebidoNoTopo()).toBe(eur2(12300));
    // Em falta a zero: o painel troca o número pela frase.
    expect(screen.getByText(/tudo recebido/i)).toBeTruthy();
  });
});

// ── 3. O dossiê do evento ──────────────────────────────────────────────────

describe("Dossiê do evento — o que sobrou da reconciliação financeira", () => {
  /**
   * Havia aqui um `reconcileFinance` que confrontava DUAS contagens do mesmo
   * dinheiro: o registo de pagamentos e o livro de facturas. Sem livro não há
   * segunda contagem, e a função saiu (ver a nota em `dossier.ts`).
   *
   * O que ela protegia — que o número do dinheiro deste evento esteja certo ao
   * cêntimo e não conte o que não entrou — passou a ser da responsabilidade
   * destes dois: `paidTotal` e o `paid`/`pctPaid` do `computeEventMetrics`.
   */
  const HOJE = new Date("2026-07-18T09:00:00Z");
  const dossie = (q: Quote) => ({ quote: q, proposal: null, contract: null });

  it("`paid` é a soma do que entrou; `pctPaid` compara-o com o contratado", () => {
    const m = computeEventMetrics(dossie(quote({ payments: [recebido({ amount: 3690 })] })), HOJE);
    expect(m.contracted).toBe(12300);
    expect(m.paid).toBe(3690);
    expect(m.pctPaid).toBeCloseTo(0.3, 10);
  });

  it("as linhas por receber não entram no `paid` nem na percentagem", () => {
    const m = computeEventMetrics(
      dossie(quote({ payments: [recebido({ amount: 3690 }), porReceber({ amount: 8610 })] })),
      HOJE,
    );
    expect(m.paid).toBe(3690);
    expect(m.pctPaid).toBeCloseTo(0.3, 10);
  });

  it("recebido tudo → 100%, ao cêntimo e sem deriva de vírgula flutuante", () => {
    const m = computeEventMetrics(
      dossie(
        quote({
          payments: [
            recebido({ amount: 3690 }),
            recebido({ id: "p2", kind: "saldo", amount: 8610 }),
          ],
        }),
      ),
      HOJE,
    );
    expect(m.paid).toBe(12300);
    expect(m.pctPaid).toBe(1);
  });

  it("sem nada contratado a percentagem é 0, e nunca Infinity", () => {
    const semPreco = quote({ payments: [recebido({ amount: 500 })] });
    (semPreco as { priceBreakdown?: unknown }).priceBreakdown = undefined;
    const m = computeEventMetrics(dossie(semPreco), HOJE);
    expect(m.contracted).toBe(0);
    expect(m.paid).toBe(500);
    expect(m.pctPaid).toBe(0);
    expect(Number.isFinite(m.pctPaid)).toBe(true);
  });

  it("`paidTotal` e o `paid` das métricas são a MESMA conta", () => {
    // Se um dia divergirem, o dossiê e o painel de Pagamentos passam a dizer
    // números diferentes sobre o mesmo evento — que foi exactamente o defeito
    // que a reconciliação existia para apanhar.
    const q = quote({
      payments: [
        recebido({ amount: 1234.56 }),
        recebido({ id: "p2", kind: "pagamento", amount: 765.44 }),
        porReceber({ amount: 999 }),
      ],
    });
    expect(paidTotal(q)).toBe(2000);
    expect(computeEventMetrics(dossie(q), HOJE).paid).toBe(paidTotal(q));
  });
});
