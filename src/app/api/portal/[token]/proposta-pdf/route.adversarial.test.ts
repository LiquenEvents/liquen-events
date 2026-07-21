import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Adversarial probe: portal proposta-pdf token & document access ──────────
// The signed portal token IS the authorization. We assert the endpoint never
// serves a document that does not belong to the token's quote, and never
// crashes on missing/foreign data. Stores are mocked; the renderer echoes the
// doc it was handed so we can assert on document identity.
const db = vi.hoisted(() => ({
  quotes: new Map<string, Record<string, unknown>>(),
  proposalsById: new Map<string, Record<string, unknown>>(),
  newestByQuote: new Map<string, Record<string, unknown>>(),
  acceptedContractByQuote: new Map<string, Record<string, unknown>>(),
  rendered: [] as unknown[],
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
}));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return new Uint8Array([1, 2, 3]);
  }),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";

function call(token = "good") {
  return GET(new Request("http://x"), { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  db.quotes.clear();
  db.proposalsById.clear();
  db.newestByQuote.clear();
  db.acceptedContractByQuote.clear();
  db.rendered = [];
  db.quotes.set("q-1", { id: "q-1", name: "Cliente A" });
  vi.clearAllMocks();
});

describe("proposta-pdf — cross-quote isolation probe", () => {
  it("must NOT serve a proposal belonging to another quote via a mislinked contract", async () => {
    // Token is for q-1. An accepted-contract row scoped to q-1 references a
    // proposal whose quoteId is q-2 (another client). The endpoint must not
    // hand q-1's token holder q-2's proposal document.
    db.proposalsById.set("p-foreign", {
      id: "p-foreign",
      quoteId: "q-2",
      doc: { secret: "another-clients-proposal" },
    });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-foreign", status: "aceite" });

    const res = await call();
    // The foreign document must never be rendered/served.
    expect(db.rendered).toEqual([]);
    expect(res.status).toBe(404);
  });

  it("still serves the accepted proposal when it genuinely belongs to the quote", async () => {
    // Positive control: the guard must not over-block a correctly-linked
    // proposal whose quoteId matches the token's quote.
    db.proposalsById.set("p-own", {
      id: "p-own",
      quoteId: "q-1",
      doc: { which: "own" },
    });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-own", status: "aceite" });

    const res = await call();
    expect(res.status).toBe(200);
    expect(db.rendered).toEqual([{ which: "own" }]);
  });
});
