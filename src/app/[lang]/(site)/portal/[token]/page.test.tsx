import { describe, it, expect, vi, beforeEach } from "vitest";

// ── FIX 6 — the portal must reflect the ACCEPTED proposal, not the newest draft ──
// We mock the stores and capture the props handed to PortalView (mocked to echo
// its props) so we can assert on total/status/contract/schedule without a DOM.
const db = vi.hoisted(() => ({
  quotes: new Map<string, Record<string, unknown>>(),
  proposalsById: new Map<string, Record<string, unknown>>(),
  newestByQuote: new Map<string, Record<string, unknown>>(),
  acceptedContractByQuote: new Map<string, Record<string, unknown>>(),
  contractByProposal: new Map<string, Record<string, unknown>>(),
  invoicesByQuote: new Map<string, Record<string, unknown>[]>(),
}));

vi.mock("@/lib/portal-token", () => ({
  readPortalToken: vi.fn((t: string) => (t === "good" ? { quoteId: "q-1" } : null)),
}));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => db.quotes.get(id) ?? null),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (id: string) => db.proposalsById.get(id) ?? null),
  getProposalByQuote: vi.fn(async (qid: string) => db.newestByQuote.get(qid) ?? null),
}));
vi.mock("@/lib/contracts-store", () => ({
  getAcceptedContractByQuote: vi.fn(
    async (qid: string) => db.acceptedContractByQuote.get(qid) ?? null,
  ),
  getContractByProposal: vi.fn(async (pid: string) => db.contractByProposal.get(pid) ?? null),
}));
vi.mock("@/lib/invoices-store", () => ({
  listInvoicesForQuote: vi.fn(async (qid: string) => db.invoicesByQuote.get(qid) ?? []),
  splitThirtySeventy: (total: number) => ({
    sinal: Math.round(total * 0.3 * 100) / 100,
    saldo: Math.round((total - Math.round(total * 0.3 * 100) / 100) * 100) / 100,
  }),
}));
vi.mock("@/lib/i18n", () => ({
  normalizeLocale: (l: string) => l,
  getDictionary: () => ({
    portal: {
      title: "Portal",
      eventTypes: {},
      eventFallbackEmpresa: "Empresa",
      eventFallbackParticular: "Particular",
      dateLocale: "pt-PT",
    },
  }),
}));
// Echo props back so we can read them off the returned element (no render).
vi.mock("./PortalView", () => ({ default: (props: Record<string, unknown>) => props }));

import PortalPage, * as pagina from "./page";
import { getProposal, getProposalByQuote } from "@/lib/proposals-store";

async function renderProps(): Promise<any> {
  const el = await PortalPage({ params: Promise.resolve({ lang: "pt", token: "good" }) });

  return (el as any).props;
}

beforeEach(() => {
  db.quotes.clear();
  db.proposalsById.clear();
  db.newestByQuote.clear();
  db.acceptedContractByQuote.clear();
  db.contractByProposal.clear();
  db.invoicesByQuote.clear();
  db.quotes.set("q-1", {
    id: "q-1",
    name: "Cliente",
    category: "particulares",
    date: "2026-09-12",
  });
  vi.clearAllMocks();
});

describe("Portal page — accepted proposal is the source of truth (FIX 6)", () => {
  it("renders the ACCEPTED proposal even when a newer draft exists", async () => {
    // Aceite: total 10000. Uma revisão MAIS RECENTE (rascunho) a 12000 não deve
    // ser mostrada — o portal tem de refletir o que o cliente aceitou.
    db.proposalsById.set("p-acc", {
      id: "p-acc",
      quoteId: "q-1",
      total: 10000,
      currency: "EUR",
      status: "aceite",
      doc: { some: "doc" },
    });
    db.newestByQuote.set("q-1", { id: "p-new", quoteId: "q-1", total: 12000, status: "rascunho" });
    db.acceptedContractByQuote.set("q-1", {
      proposalId: "p-acc",
      status: "aceite",
      acceptedName: "Ana",
      acceptedAt: "2026-07-02T14:32:00.000Z",
      termsVersion: "2026-01",
    });

    const props = await renderProps();

    // The accepted proposal (10000/aceite) wins over the newest draft (12000).
    expect(props.proposal).toMatchObject({ total: 10000, status: "aceite" });
    expect(props.proposal.total).not.toBe(12000);
    // Contract block + PDF link reflect the accepted contract.
    expect(props.contract).toMatchObject({ status: "aceite", acceptedName: "Ana" });
    expect(props.contratoPdfHref).toBe("/api/portal/good/contrato-pdf");
    // 30/70 schedule + total derived from the accepted proposal.
    expect(props.schedule).toEqual({ sinal: 3000, saldo: 7000 });
    // Resolved via the accepted contract's proposalId, not the newest lookup.
    expect(getProposal).toHaveBeenCalledWith("p-acc");
    expect(getProposalByQuote).not.toHaveBeenCalled();
  });

  it("falls back to the newest proposal when there is no accepted contract (still open)", async () => {
    db.newestByQuote.set("q-1", {
      id: "p-open",
      quoteId: "q-1",
      total: 5000,
      currency: "EUR",
      status: "enviada",
      doc: null,
    });
    // No accepted contract; the open proposal has no contract yet.
    db.contractByProposal.set("p-open", undefined as unknown as Record<string, unknown>);

    const props = await renderProps();

    expect(props.proposal).toMatchObject({ total: 5000, status: "enviada" });
    expect(props.schedule).toEqual({ sinal: 1500, saldo: 3500 });
    expect(props.contract).toBeNull();
    expect(props.contratoPdfHref).toBeNull();
    expect(getProposalByQuote).toHaveBeenCalledWith("q-1");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PORTAL MOSTRA O SINAL DA PROPOSTA, NÃO TRINTA POR CENTO FIXOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A percentagem do sinal é editável no estúdio e é ela que as rotas de
 * facturação usam para emitir o sinal e o saldo (`depositPercentOf`). O portal
 * dividia sempre 30/70. Numa proposta de 50%, o cliente abria o link privado,
 * lia «Sinal (30%) 3.000,00 €» e recebia por email uma factura de 5.000 € — o
 * sítio onde ele vai confirmar o valor é precisamente este.
 */
describe("Portal page — a percentagem do sinal é a da proposta", () => {
  it("uma proposta de 50% divide o total ao meio", async () => {
    db.newestByQuote.set("q-1", {
      id: "p-50",
      quoteId: "q-1",
      total: 10000,
      currency: "EUR",
      status: "enviada",
      doc: { depositPercent: 50 },
    });

    const props = await renderProps();

    expect(props.schedule).toEqual({ sinal: 5000, saldo: 5000 });
    // A vista também precisa do número para escrever o rótulo.
    expect(props.depositPercent).toBe(50);
  });

  it("sem percentagem escrita, continua a ser a da casa", async () => {
    db.newestByQuote.set("q-1", {
      id: "p-dflt",
      quoteId: "q-1",
      total: 10000,
      currency: "EUR",
      status: "enviada",
      doc: {},
    });

    const props = await renderProps();

    expect(props.schedule).toEqual({ sinal: 3000, saldo: 7000 });
    expect(props.depositPercent).toBe(30);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PORTAL NÃO PODE FICAR CONGELADO NUM CACHE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `[token]` não tem `generateStaticParams` e nada nesta página usa uma API de
 * pedido (o idioma vem do segmento da rota — ver src/proxy.ts). Para o Next
 * isso é uma rota ESTÁTICA: renderiza à primeira visita e guarda o HTML no
 * Full Route Cache, sem revalidação, até ao próximo deploy.
 *
 * Este é o ecrã a que o cliente VOLTA — para ver se a factura já entrou, se o
 * contrato já está assinado, se o sinal já ficou pago. Congelado, ele volta
 * durante um ano (é o prazo do token do portal) a uma fotografia do dia em que
 * o abriu pela primeira vez: sinal por pagar, contrato pendente, sem contas
 * nenhumas — e a escrever ao estúdio a perguntar porquê.
 */
describe("Portal page — nunca servida de um cache", () => {
  it("é renderizada a pedido, a cada visita", () => {
    expect((pagina as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «CASAMENTO · CASAMENTO · 15 DE MAIO DE 2027»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A linha do evento juntava DUAS leituras da mesma coisa: o tipo traduzido e o
 * `eventName` — que, nos pedidos vindos do formulário público, é o rótulo da
 * lista, em português, exactamente igual ao tipo. Um cliente inglês lia
 * «Wedding · Casamento · …», que é o mesmo defeito com a tradução por cima.
 *
 * O `eventName` continua a aparecer quando é MESMO um nome («Casamento da Ana
 * e do João», que a equipa escreve no back office): é isso que ele diz ser.
 */
describe("Portal page — a linha do evento não se repete", () => {
  it("um rótulo de lista guardado como nome não entra na linha", async () => {
    db.quotes.set("q-1", {
      id: "q-1",
      name: "Ana",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      date: "2027-05-15",
    });
    const props = await renderProps();
    expect(props.eventLabel).toBe("Casamento");
    expect(props.eventName).toBeUndefined();
  });

  it("num portal inglês o tipo é lido em inglês", async () => {
    db.quotes.set("q-1", {
      id: "q-1",
      name: "Sarah",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      date: "2027-05-15",
    });
    const el = await PortalPage({ params: Promise.resolve({ lang: "en", token: "good" }) });
    const props = (el as { props: { eventLabel: string; eventName?: string } }).props;
    expect(props.eventLabel).toBe("Wedding");
    expect(props.eventName).toBeUndefined();
  });

  it("mas o nome que a equipa escreveu continua a aparecer", async () => {
    db.quotes.set("q-1", {
      id: "q-1",
      name: "Ana",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento da Ana e do João",
      date: "2027-05-15",
    });
    const props = await renderProps();
    expect(props.eventLabel).toBe("Casamento");
    expect(props.eventName).toBe("Casamento da Ana e do João");
  });
});
