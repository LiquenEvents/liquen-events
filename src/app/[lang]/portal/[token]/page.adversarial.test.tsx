import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Adversarial: the portal page must never surface another quote's proposal ──
// The page resolves the proposal accepted-first via the accepted contract's
// stored proposalId. If that linkage is corrupt (points at another client's
// proposal), the page must NOT leak that proposal's total/status/PDF link.
// Same echo-the-props mock pattern as page.test.tsx.
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
  splitThirtySeventy: (total: number) => ({ sinal: total * 0.3, saldo: total * 0.7 }),
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
vi.mock("./PortalView", () => ({ default: (props: Record<string, unknown>) => props }));

import PortalPage from "./page";

 
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
  db.quotes.set("q-1", { id: "q-1", name: "Cliente A", category: "particulares" });
  vi.clearAllMocks();
});

describe("Portal page — cross-quote isolation", () => {
  it("does not surface another quote's proposal via a mislinked accepted contract", async () => {
    // Accepted contract for q-1 mistakenly references q-2's proposal.
    db.proposalsById.set("p-foreign", {
      id: "p-foreign",
      quoteId: "q-2",
      total: 99999,
      currency: "EUR",
      status: "aceite",
      doc: { some: "foreign" },
    });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-foreign", status: "aceite" });

    const props = await renderProps();

    // The other client's proposal (total/status/PDF link) must not appear.
    expect(props.proposal).toBeNull();
    expect(props.pdfHref).toBeNull();
    expect(props.schedule).toBeNull();
  });

  it("still surfaces a correctly-linked accepted proposal (positive control)", async () => {
    db.proposalsById.set("p-own", {
      id: "p-own",
      quoteId: "q-1",
      total: 10000,
      currency: "EUR",
      status: "aceite",
      doc: { some: "own" },
    });
    db.acceptedContractByQuote.set("q-1", {
      proposalId: "p-own",
      status: "aceite",
      acceptedName: "Ana",
      termsVersion: "2026-01",
    });

    const props = await renderProps();

    expect(props.proposal).toMatchObject({ total: 10000, status: "aceite" });
    expect(props.pdfHref).toBe("/api/portal/good/proposta-pdf");
  });
});
