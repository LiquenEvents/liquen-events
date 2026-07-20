import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Adversarial coverage for the public-by-token contract PDF ──────────────
// Trust model (see route header): the signed portal token IS the authorization
// and EVERY failure — bad/unknown/expired token, unknown quote, no accepted
// contract — must 404 with an empty body so the link never reveals whether an
// id exists. Only a genuine internal error (renderer/store throwing) is a 500.
// We mock the token reader, both stores, and the PDF renderer (echoing bytes).
const db = vi.hoisted(() => ({
  quotes: new Map<string, Record<string, unknown>>(),
  acceptedByQuote: new Map<string, Record<string, unknown>>(),
  rendered: [] as unknown[],
  renderThrows: false,
}));

vi.mock("@/lib/portal-token", () => ({
  readPortalToken: vi.fn((t: string) => (t === "good" ? { quoteId: "q-1" } : null)),
}));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => db.quotes.get(id) ?? null),
}));
vi.mock("@/lib/contracts-store", () => ({
  getAcceptedContractByQuote: vi.fn(async (qid: string) => db.acceptedByQuote.get(qid) ?? null),
}));
vi.mock("@/lib/contract-pdf", () => ({
  renderContractPdf: vi.fn(async (contract: unknown) => {
    if (db.renderThrows) throw new Error("pdf boom");
    db.rendered.push(contract);
    return Buffer.from([1, 2, 3, 4]);
  }),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { getQuote } from "@/lib/quotes-store";

function call(token = "good") {
  return GET(new Request("http://x"), { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  db.quotes.clear();
  db.acceptedByQuote.clear();
  db.rendered = [];
  db.renderThrows = false;
  db.quotes.set("q-1", { id: "q-1", name: "Cliente" });
  vi.clearAllMocks();
});

describe("GET /api/portal/[token]/contrato-pdf", () => {
  it("serves the accepted contract as inline PDF bytes with the right headers", async () => {
    db.acceptedByQuote.set("q-1", { id: "c-1", status: "aceite" });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toBe(
      'inline; filename="Contrato-Liquen-q-1.pdf"',
    );
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(db.rendered).toEqual([{ id: "c-1", status: "aceite" }]);
  });

  it("404s (empty body) on a bad/unknown token without touching the stores", async () => {
    const res = await call("bad");
    expect(res.status).toBe(404);
    expect(await res.text()).toBe("");
    expect(getQuote).not.toHaveBeenCalled();
    expect(db.rendered).toEqual([]);
  });

  it("404s when the token resolves to a quote that no longer exists", async () => {
    db.quotes.clear();
    const res = await call();
    expect(res.status).toBe(404);
    expect(db.rendered).toEqual([]);
  });

  it("404s when there is no ACCEPTED contract (a pending one does not count)", async () => {
    // No entry in acceptedByQuote — getAcceptedContractByQuote returns null.
    const res = await call();
    expect(res.status).toBe(404);
    expect(db.rendered).toEqual([]);
  });

  it("does not leak existence: unknown-token and no-contract both 404 identically", async () => {
    const bad = await call("bad");
    const noContract = await call("good");
    expect(bad.status).toBe(404);
    expect(noContract.status).toBe(404);
    expect(await bad.text()).toBe(await noContract.text());
  });

  it("500s (never leaks) on a genuine internal renderer failure", async () => {
    db.acceptedByQuote.set("q-1", { id: "c-1", status: "aceite" });
    db.renderThrows = true;
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("");
  });
});
