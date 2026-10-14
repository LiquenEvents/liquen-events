// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import Propostas from "./Propostas";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NUM SÍTIO DIZ UMA COISA NOUTRO DIZ OUTRA»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (14/10), com as duas capturas lado a lado: a Visão Geral dizia
 * Ganho 28 265 € e À espera 41 447 €, as Propostas Valor já ganho 20 824 € e
 * Valor enviado 66 773 €. Ela escolheu que manda o estado que se dá ao pedido,
 * e a conta passou a ser uma só (`dinheiro-dos-pedidos.ts`).
 *
 * Este teste desenha os DOIS ecrãs com os mesmos dados — e com os três casos
 * que os separavam — e exige o mesmo número nos dois:
 *   · um pedido em Ganho cuja proposta ficou «enviada» (marcar Ganho no pedido
 *     nem sempre passa a proposta a aceite);
 *   · uma proposta com IVA a 6 %, que não é a taxa da estimativa;
 *   · um pedido sem preço final escrito, mas com proposta enviada;
 *   · um pedido ganho e arquivado, que nenhum dos dois pode contar.
 * Cada ecrã recebe os pedidos como o `AdminClient` lhos dá: a Visão Geral só os
 * activos, as Propostas todos.
 */

const HOJE = new Date("2026-08-14T09:00:00.000Z");

const pedido = (over: Partial<Quote>): Quote =>
  ({
    submittedAt: "2026-07-01T10:00:00.000Z",
    email: "teste@example.pt",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    ...over,
  }) as Quote;

const proposta = (over: Partial<Proposal>): Proposal =>
  ({
    clientEmail: "teste@example.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    vat: 0,
    status: "enviada",
    createdAt: "2026-07-10T10:00:00.000Z",
    sentAt: "2026-07-10T10:00:00.000Z",
    ...over,
  }) as Proposal;

const PEDIDOS: Quote[] = [
  pedido({ id: "q-a", name: "TESTE Ana", status: "aceite", quotedPrice: 10000 }),
  pedido({ id: "q-b", name: "TESTE Bia", status: "cotado", quotedPrice: 5000 }),
  pedido({ id: "q-c", name: "TESTE Caio", status: "aceite", quotedPrice: 9999, archived: true }),
  pedido({ id: "q-d", name: "TESTE Duda", status: "cotado" }),
];

const PROPOSTAS: Proposal[] = [
  // Ganho no pedido, a proposta ficou «enviada», e o IVA era de 6 %.
  proposta({ id: "p-a", quoteId: "q-a", clientName: "TESTE Ana", subtotal: 10000, total: 10600 }),
  // Sem preço final no pedido: vale o total da proposta que seguiu.
  proposta({ id: "p-d", quoteId: "q-d", clientName: "TESTE Duda", subtotal: 2000, total: 2460 }),
];

// Ganho = 10 000 + 6 % = 10 600 €. À espera = 5 000 + 23 % + 2 460 = 8 610 €.
const GANHO = "10600€";
const A_ESPERA = "8610€";

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers(),
  json: async () => body,
});

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas")
        ? response(PROPOSTAS)
        : String(url).startsWith("/api/visao-geral")
          ? response({
              notas: { id: "notas", value: "", revision: 0, updatedAt: HOJE.toISOString() },
              meta: { id: "meta", value: "", revision: 0, updatedAt: HOJE.toISOString() },
            })
          : response([]),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const semEspacos = (t: string | null | undefined) => (t ?? "").replace(/\s/g, "");

describe("a Visão Geral e as Propostas dizem o mesmo", () => {
  it("o Ganho e o À espera são os mesmos números nos dois ecrãs", async () => {
    const activos = PEDIDOS.filter((q) => !q.archived);
    const visao = render(
      <Overview
        quotes={activos}
        propostas={PROPOSTAS}
        userName="Catarina"
        onOpen={vi.fn()}
        onGoStats={vi.fn()}
        onGo={vi.fn()}
        onNew={vi.fn()}
      />,
    );
    const painel = screen.getByRole("group", { name: /dinheiro/i });
    const textoDaVisao = semEspacos(painel.textContent);
    // O número vem antes do rótulo (o Ganho traz ainda a variação do mês).
    expect(textoDaVisao).toMatch(new RegExp(`^${GANHO}(\\d+%)?Ganho`));
    expect(textoDaVisao).toContain(`IVA${A_ESPERA}Àespera`);
    visao.unmount();

    render(
      <ToastProvider>
        <Propostas quotes={PEDIDOS} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("TESTE Ana").length).toBeGreaterThan(0));
    const ganho = screen.getByText("Valor já ganho").previousElementSibling?.textContent;
    const aEspera = screen.getByText("À espera de resposta").previousElementSibling?.textContent;
    expect(semEspacos(ganho)).toBe(GANHO);
    expect(semEspacos(aEspera)).toBe(A_ESPERA);
    // E o aviso conta os mesmos pedidos: os dois em «Proposta enviada».
    expect(
      within(document.body)
        .getByText(/2 propostas enviadas/)
        .closest("p")?.textContent,
    ).toMatch(/aguardam resposta/);
  });
});
