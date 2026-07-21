import { describe, it, expect, vi, beforeEach } from "vitest";

// ── The portal proposal PDF must serve the ACCEPTED proposal, not the newest ──
// The portal page (page.tsx) resolves the proposal accepted-first (via the
// accepted contract) and only shows the PDF link for that accepted proposal.
// This route must serve the SAME document — otherwise a client who accepted
// proposal A downloads a later internal draft B (different price/terms) they
// never agreed to. We mock the stores and make the renderer echo which doc it
// was handed so we can assert on identity without a real PDF.
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
  db.quotes.set("q-1", { id: "q-1", name: "Cliente" });
  vi.clearAllMocks();
});

describe("portal proposta-pdf — serves the accepted proposal's document", () => {
  it("renders the ACCEPTED proposal doc even when a newer draft exists", async () => {
    db.proposalsById.set("p-acc", { id: "p-acc", doc: { which: "accepted" } });
    db.newestByQuote.set("q-1", { id: "p-new", doc: { which: "draft-revision" } });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-acc", status: "aceite" });

    const res = await call();
    expect(res.status).toBe(200);
    // The client must receive exactly what they accepted, not the newer draft.
    expect(db.rendered).toEqual([{ which: "accepted" }]);
  });

  it("falls back to the newest proposal when there is no accepted contract", async () => {
    db.newestByQuote.set("q-1", { id: "p-open", doc: { which: "open" } });

    const res = await call();
    expect(res.status).toBe(200);
    expect(db.rendered).toEqual([{ which: "open" }]);
  });

  it("404s on a bad token without touching the stores", async () => {
    const res = await call("bad");
    expect(res.status).toBe(404);
    expect(db.rendered).toEqual([]);
  });

  it("404s when the accepted proposal has no stored doc", async () => {
    db.proposalsById.set("p-acc", { id: "p-acc", doc: null });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-acc", status: "aceite" });

    const res = await call();
    expect(res.status).toBe(404);
  });
});
