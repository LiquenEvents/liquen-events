import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ADVERSARIAL guard-probing for the faturas (invoice) manual-issue / void /
 * delete surface. This file PINS current behavior (so future changes are
 * caught) and, in the accompanying report, labels each scenario OK (intended)
 * or SUSPECT-BUG. It does NOT change product behavior.
 *
 * Both the collection route (POST/GET) and the item route (PATCH/DELETE) import
 * from the SAME "@/lib/invoices-store" module, so a single mock backed by one
 * in-memory Map serves both — a manually-issued invoice can then be voided /
 * resurrected / deleted through the real handlers in one flow.
 */
const db = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  idSeq: 0,
  numSeq: 0,
}));
const proposalsDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
const authState = vi.hoisted(() => ({ authed: true }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));

vi.mock("@/lib/invoices-store", () => ({
  listInvoices: vi.fn(async () => [...db.store.values()]),
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    [...db.store.values()].filter((i) => i.quoteId === quoteId),
  ),
  getInvoice: vi.fn(async (id: string) => db.store.get(id) ?? null),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    db.store.set(i.id as string, i);
  }),
  updateInvoice: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const cur = db.store.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    db.store.set(id, next);
    return next;
  }),
  deleteInvoice: vi.fn(async (id: string) => {
    db.store.delete(id);
  }),
  newInvoiceId: vi.fn(() => `inv-${++db.idSeq}`),
  nextInvoiceNumber: vi.fn(async () => `FT 2026/${String(++db.numSeq).padStart(4, "0")}`),
  // Real 30/70 split (saldo by subtraction), mirroring @/lib/money.
  splitThirtySeventy: (total: number) => {
    const t = Math.max(0, total);
    const sinal = Math.round(t * 0.3 * 100) / 100;
    return { sinal, saldo: Math.round((t - sinal) * 100) / 100 };
  },
  isUniqueViolation: (err: unknown) =>
    !!err && typeof err === "object" && (err as { code?: string }).code === "23505",
}));

vi.mock("@/lib/proposals-store", () => ({
  getProposalByQuote: vi.fn(async (quoteId: string) => proposalsDb.store.get(quoteId) ?? null),
}));

vi.mock("@/lib/money", () => ({ round2: (n: number) => Math.round(n * 100) / 100 }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "@/app/api/faturas/route";
import { PATCH, DELETE } from "@/app/api/faturas/[id]/route";
import { createInvoice, nextInvoiceNumber, deleteInvoice } from "@/lib/invoices-store";

function postReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/faturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function patchReq(
  id: string,
  body: unknown,
): { req: NextRequest; params: Promise<{ id: string }> } {
  const req = new Request(`https://liquen.test/api/faturas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ id }) };
}

function delReq(id: string): { req: NextRequest; params: Promise<{ id: string }> } {
  const req = new Request(`https://liquen.test/api/faturas/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ id }) };
}

/** Seed an invoice straight into the ledger (bypassing the POST guards). */
function seed(id: string, over: Record<string, unknown> = {}) {
  db.store.set(id, {
    id,
    number: "FT 2026/0001",
    quoteId: "q-1",
    clientName: "Cliente Teste",
    clientEmail: "cliente@example.com",
    kind: "sinal",
    amount: 3000,
    vatRate: 0.23,
    issuedAt: "2026-07-01",
    status: "emitida",
    ...over,
  });
}

beforeEach(() => {
  db.store.clear();
  db.idSeq = 0;
  db.numSeq = 0;
  proposalsDb.store.clear();
  authState.authed = true;
  vi.clearAllMocks();
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO A — lone `saldo` (70%) issued manually with NO prior `sinal`.
// Current: single-invoice path only has a DUPLICATE-saldo guard (same kind
// already present). There is NO precedence guard requiring a sinal first, so a
// bare 70% saldo is minted for a quote that never had its 30% sinal.
// Report label: SUSPECT-BUG.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO A — lone saldo without a prior sinal (precedence guard?)", () => {
  it("SUSPECT-BUG: allows a manual saldo when no sinal exists for the quote (201)", async () => {
    const res = await POST(
      postReq({ quoteId: "q-1", clientName: "Ana", amount: 7000, kind: "saldo" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices).toHaveLength(1);
    expect(json.invoices[0].kind).toBe("saldo");
    expect(createInvoice).toHaveBeenCalledTimes(1);
    // Pin: the ledger now holds a saldo with no sinal anywhere for the quote.
    const forQuote = [...db.store.values()].filter((i) => i.quoteId === "q-1");
    expect(forQuote.map((i) => i.kind)).toEqual(["saldo"]);
    expect(forQuote.some((i) => i.kind === "sinal")).toBe(false);
  });

  it("SUSPECT-BUG: the same lone saldo is allowed via the split path? (no — split mints BOTH)", async () => {
    // Contrast pin: the split path always mints the sinal+saldo pair together,
    // so the lone-saldo hole is specific to the single-invoice kind=saldo path.
    const res = await POST(
      postReq({ split: true, quoteId: "q-2", clientName: "Ana", total: 10000 }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices.map((i: { kind: string }) => i.kind)).toEqual(["sinal", "saldo"]);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO B — second `sinal` for a quote that already has one.
// Current: duplicate-sinal guard rejects with 409, no number consumed.
// Report label: OK.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO B — duplicate sinal guard", () => {
  it("OK: rejects a second sinal with 409 and consumes NO number", async () => {
    seed("s-existing", { kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(
      postReq({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }),
    );
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal");
    expect(createInvoice).not.toHaveBeenCalled();
    expect(nextInvoiceNumber).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO C — void (`anular`) an invoice that is already `anulada`.
// Current: no state-machine guard; anulada→anulada is a silent no-op 200
// (idempotent). No cascade fires (prior.status !== "paga").
// Report label: OK-ish (idempotent), but note: PATCH has NO transition guard.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO C — anular an already-anulada invoice", () => {
  it("OK(idempotent): anulada→anulada returns 200, stays anulada, no cascade", async () => {
    seed("c1", { kind: "sinal", status: "anulada", paidAt: undefined });
    const { req, params } = patchReq("c1", { status: "anulada" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("anulada");
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(json.saldoAnnulled).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO D — void a `paga` invoice.
// Current: paga→anulada is allowed (200); paidAt is cleared. For a `total`/`saldo`
// there is no cascade; for a paga `sinal` the orphan-saldo cascade fires
// (covered by existing tests). This is the intended "anular before delete" path.
// Report label: OK (intended) — but a paid invoice's paidAt record is dropped.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO D — anular a paga invoice", () => {
  it("OK: paga(total)→anulada returns 200 and clears paidAt (no cascade for total)", async () => {
    seed("d1", { kind: "total", status: "paga", paidAt: "2026-07-05" });
    const { req, params } = patchReq("d1", { status: "anulada" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("anulada");
    expect(json.paidAt).toBeUndefined();
    expect(json.saldoAnnulled).toBeUndefined();
    expect(db.store.get("d1")?.paidAt).toBeUndefined();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO E — mark `paga` an already-`anulada` invoice (illegal transition).
// Current: NO transition guard, so anulada→paga is accepted (200), a fresh
// paidAt is stamped, AND for a `sinal` it even trips becamePaid → auto-issues a
// brand-new saldo. A voided fiscal document is silently resurrected as paid and
// spawns downstream invoices.
// Report label: SUSPECT-BUG.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO E — resurrect an anulada invoice to paga", () => {
  it("SUSPECT-BUG: anulada(total)→paga is accepted (200) and re-stamps paidAt", async () => {
    seed("e1", { kind: "total", status: "anulada", paidAt: undefined });
    const { req, params } = patchReq("e1", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("paga");
    expect(json.paidAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("SUSPECT-BUG: anulada(sinal)→paga even AUTO-ISSUES a new saldo (downstream spawn)", async () => {
    seed("e2", { kind: "sinal", status: "anulada", amount: 3000, paidAt: undefined });
    const { req, params } = patchReq("e2", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("paga");
    // A voided sinal, re-marked paid, mints a fresh 70% saldo into the book.
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 7000 });
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO F — DELETE guarded to anulada only.
// Current: paga/emitida → 409 (guard); anulada → 200. Deleting an anulada with a
// downstream saldo does NOT cascade (leaves the saldo), but the guard itself is
// intact. Report label: OK.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO F — DELETE only anulada", () => {
  it("OK: refuses to delete a paga invoice (409), store untouched", async () => {
    seed("f1", { status: "paga", paidAt: "2026-07-05" });
    const { req, params } = delReq("f1");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(409);
    expect(deleteInvoice).not.toHaveBeenCalled();
    expect(db.store.has("f1")).toBe(true);
  });

  it("OK: refuses to delete an emitida invoice (409)", async () => {
    seed("f2", { status: "emitida" });
    const { req, params } = delReq("f2");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(409);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it("PIN: deleting an anulada sinal does NOT cascade-delete its saldo (no downstream cleanup)", async () => {
    seed("f3", { kind: "sinal", status: "anulada" });
    // A saldo tied to the same quote survives the sinal deletion (no cascade).
    db.store.set("f3-saldo", {
      id: "f3-saldo",
      quoteId: "q-1",
      kind: "saldo",
      amount: 7000,
      status: "emitida",
    });
    const { req, params } = delReq("f3");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
    expect(deleteInvoice).toHaveBeenCalledWith("f3");
    expect(db.store.has("f3")).toBe(false);
    // The saldo is orphaned but left intact — DELETE has no downstream logic.
    expect(db.store.has("f3-saldo")).toBe(true);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO G — negative / zero / non-integer-cent amounts on manual issue.
// Negative & zero → clamped to 0 → 400 "Valor inválido" (no number consumed).
// A NON-integer-cent amount (e.g. €100.567) is now ROUNDED to whole cents by the
// route's num() helper (fiscal amounts must be whole cents) — was a bug where it
// persisted verbatim.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO G — amount validation on manual issue", () => {
  it("OK: zero amount → 400 Valor inválido, no number consumed", async () => {
    const res = await POST(postReq({ clientName: "Ana", amount: 0, kind: "total" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Valor inválido");
    expect(nextInvoiceNumber).not.toHaveBeenCalled();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("OK: negative amount → clamped to 0 → 400 Valor inválido", async () => {
    const res = await POST(postReq({ clientName: "Ana", amount: -250, kind: "total" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Valor inválido");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("a sub-cent amount (100.567) is rounded to whole cents (100.57)", async () => {
    const res = await POST(postReq({ clientName: "Ana", amount: 100.567, kind: "total" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    // num() now rounds to cents so no fractional-cent amount enters the ledger.
    expect(json.invoices[0].amount).toBe(100.57);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO H — issue against an unknown quoteId.
// Current: quoteId is free text; no existence check. An invoice is minted for a
// quote that does not exist. Manual issuance is intentionally detachable, so
// this is arguably by design. Report label: OK (intended) — flagged for review.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO H — unknown quoteId", () => {
  it("OK: mints an invoice against an unknown quoteId (no existence validation)", async () => {
    const res = await POST(
      postReq({ quoteId: "does-not-exist", clientName: "Ana", amount: 5000, kind: "total" }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices[0].quoteId).toBe("does-not-exist");
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// SCENARIO I — numbering consumption on invalid / failed issuance.
// Current: guarded rejections (validation 400, duplicate 409) run BEFORE any
// nextInvoiceNumber call, so no fiscal number is wasted. BUT the unique-violation
// race backstop assigns numbers via build() BEFORE the failing insert, so a
// number IS consumed with no persisted invoice → a sequence gap. Report label:
// pre-insert guards OK; the race-backstop gap is an accepted (documented) fiscal
// gap — pinned so a regression that widens it is caught.
// ───────────────────────────────────────────────────────────────────────────
describe("SCENARIO I — sequential number consumption", () => {
  it("OK: a 400-rejected manual issue consumes NO number", async () => {
    const res = await POST(postReq({ amount: 3000 })); // missing clientName → 400
    expect(res.status).toBe(400);
    expect(nextInvoiceNumber).not.toHaveBeenCalled();
  });

  it("PIN: a unique-violation backstop (409) DID consume the number before the failed insert", async () => {
    // build() calls nextInvoiceNumber before createInvoice; the insert then 23505s.
    vi.mocked(createInvoice).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const res = await POST(
      postReq({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }),
    );
    expect(res.status).toBe(409);
    // The FT number was already minted even though nothing was persisted → gap.
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(1);
    expect(db.store.size).toBe(0);
  });

  it("PIN: a split race-backstop (409) consumes BOTH numbers for a never-persisted pair", async () => {
    vi.mocked(createInvoice).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const res = await POST(
      postReq({ split: true, quoteId: "q-9", clientName: "Ana", total: 10000 }),
    );
    expect(res.status).toBe(409);
    // Both sinal and saldo numbers were assigned by build() before the insert failed.
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(2);
    expect([...db.store.values()].filter((i) => i.quoteId === "q-9")).toHaveLength(0);
  });
});
