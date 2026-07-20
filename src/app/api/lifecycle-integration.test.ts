import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { promises as fsp, rmSync } from "node:fs";
import type { NextRequest } from "next/server";

/**
 * CROSS-ROUTE COMMERCIAL LIFECYCLE — integration test.
 *
 * Drives the whole quote → proposal → accept → invoice flow through the REAL
 * route handlers AND the REAL domain stores (quotes / proposals / contracts /
 * invoices), so bugs at the SEAMS between modules — the auto-issue of the sinal
 * on accept, the auto-issue of the saldo on payment, the annulment on revert,
 * the fiscal numbering shared across routes — are exercised end to end.
 *
 * ── Isolation (hermetic) ──────────────────────────────────────────────────
 * The FileBackend picks `path.join(process.cwd(), "data")` at module-load and
 * exposes no env/option to redirect it (see src/lib/repository.ts). So we mock
 * ONLY the storage *plumbing*, never a domain store:
 *   • "@/lib/repository" → the REAL Repository + REAL FileBackend, but pointed
 *     at a throwaway per-run temp dir (node:os tmpdir + node:fs) so nothing ever
 *     touches the repo's real ./data. All read-merge-write / CAS logic stays real.
 *   • "@/lib/app-state" → an in-memory KV (the invoice-sequence counter's dev
 *     fallback persists here). The read-increment-write numbering logic itself
 *     lives in invoices-store and stays REAL.
 * Everything else that is NOT a store — auth + external IO — is mocked per the
 * brief: admin-auth (authenticated admin), mail, push, the PDF renderer, and the
 * rate limiter (infra; keeps the run deterministic without hiding money/state
 * bugs). Supabase is never configured, so getSupabase() returns null naturally.
 */

// A throwaway data dir per test run. Built in a hoisted block because the store
// modules capture their backend at import time (before any beforeAll runs).
const TMP = vi.hoisted(() => {
  const base = (process.env.TMPDIR || "/tmp").replace(/\/+$/, "");
  return {
    dir: `${base}/liquen-lifecycle-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  };
});

// In-memory app-state (invoice sequence counter). Preserves getState/setState
// semantics so nextInvoiceNumber's read-increment-write stays genuine.
const APPSTATE = vi.hoisted(() => ({ map: new Map<string, unknown>() }));

vi.mock("@/lib/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repository")>();
  return {
    ...actual,
    // Same real FileBackend, just rooted at the temp dir instead of ./data.
    createRepository: <T>(mapper: import("@/lib/repository").Mapper<T>) =>
      new actual.Repository<T>(mapper, () => new actual.FileBackend<T>(mapper, TMP.dir)),
  };
});

vi.mock("@/lib/app-state", () => ({
  getState: vi.fn(async (k: string) => (APPSTATE.map.has(k) ? APPSTATE.map.get(k) : null)),
  setState: vi.fn(async (k: string, v: unknown) => {
    APPSTATE.map.set(k, v);
  }),
}));

// ── Auth: authenticated admin for every gated route ──
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));

// ── External IO ──
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/proposal-pdf", () => ({
  renderProposalPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])), // "%PDF"
}));
// Infra: keep the flow deterministic (many POSTs from one IP would otherwise trip
// the real limiter). Not a store and not business logic under test.
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

// ── Real route handlers ──
import { POST as orcamentoPOST } from "@/app/api/orcamento/route";
import { POST as propostaCreatePOST } from "@/app/api/orcamento/[id]/proposta/route";
import { POST as propostaAcceptPOST } from "@/app/api/proposta/route";
import { POST as faturaPOST } from "@/app/api/faturas/route";
import { PATCH as faturaPATCH } from "@/app/api/faturas/[id]/route";

// ── Real stores (assertions read genuine persisted state) ──
import { getQuote, deleteQuote } from "@/lib/quotes-store";
import { getProposal, listProposalsForQuote } from "@/lib/proposals-store";
import { listInvoicesForQuote, type Invoice } from "@/lib/invoices-store";
import { listContracts } from "@/lib/contracts-store";
import { createProposalToken } from "@/lib/proposal-token";

// ── Helpers ────────────────────────────────────────────────────────────────
const cents = (n: number) => Math.round(n * 100);

function jsonReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

/** Public quote submission → returns the new quote id. */
async function createQuote(over: Record<string, unknown> = {}): Promise<string> {
  const res = await orcamentoPOST(
    jsonReq({
      form: {
        name: "Cliente Integração",
        email: "cliente@example.com",
        phone: "+351 912 000 000",
        category: "particulares",
        eventType: "casamentos",
        date: "2026-11-20",
        guests: 80,
        ...over,
      },
    }),
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.status).toBe("ok");
  return json.id as string;
}

/** Admin: build + "send" a proposal for a quote. Returns { proposalId, total }. */
async function sendProposal(
  quoteId: string,
  lineItems: { description: string; qty: number; unitPrice: number }[],
  vatRate: number,
): Promise<{ proposalId: string; total: number }> {
  const res = await propostaCreatePOST(jsonReq({ lineItems, vatRate }), params(quoteId));
  expect(res.status).toBe(200);
  const json = await res.json();
  expect(json.ok).toBe(true);
  return { proposalId: json.id as string, total: json.total as number };
}

/** Public: accept a proposal via its signed link token. */
function acceptProposal(proposalId: string) {
  return propostaAcceptPOST(
    jsonReq({
      token: createProposalToken(proposalId),
      action: "aceitar",
      acceptedTerms: true,
      acceptedName: "Cliente Integração",
    }),
  );
}

const activeSaldo = (rows: Invoice[]) =>
  rows.filter((i) => i.kind === "saldo" && i.status !== "anulada");
const sinalOf = (rows: Invoice[]) => rows.filter((i) => i.kind === "sinal");

/** Parse "FT 2026/0007" → 7. */
const seqNum = (number: string) => Number(/\/(\d+)\s*$/.exec(number)?.[1] ?? "NaN");

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-only-not-a-secret"; // gitleaks:allow — test placeholder
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Wipe persisted state so each test starts hermetic (fresh files + FT counter).
  APPSTATE.map.clear();
  await fsp.rm(TMP.dir, { recursive: true, force: true });
  vi.clearAllMocks();
});

afterAll(() => {
  rmSync(TMP.dir, { recursive: true, force: true });
});

describe("commercial lifecycle — integer-euro total, across real routes + stores", () => {
  it("quote → proposal → accept(×2) → sinal paga → saldo → revert: state + money coherent end-to-end", async () => {
    // 1) Public quote.
    const quoteId = await createQuote();
    const q0 = await getQuote(quoteId);
    expect(q0).not.toBeNull();
    expect(q0!.status).toBe("pendente"); // initial pipeline status ("novo")

    // 2) Proposal: subtotal 10000 @ 23% → total 12300 (clean integer euros).
    const { proposalId, total } = await sendProposal(
      quoteId,
      [{ description: "Planeamento + execução do evento", qty: 1, unitPrice: 10000 }],
      0.23,
    );
    expect(total).toBe(12300);
    const prop = await getProposal(proposalId);
    expect(prop).toMatchObject({ quoteId, status: "enviada", total: 12300 });
    const q1 = await getQuote(quoteId);
    expect(q1!.status).toBe("cotado"); // quote advanced by the proposal route
    expect(q1!.quotedPrice).toBe(12300);

    // 3) Accept — twice. Contract + 30% sinal auto-issued; the double-accept must
    //    NOT duplicate either (idempotent state machine at the accept seam).
    const acc1 = await acceptProposal(proposalId);
    expect(acc1.status).toBe(200);
    const acc2 = await acceptProposal(proposalId);
    expect(acc2.status).toBe(200);
    expect((await acc2.json()).already).toBe(true);

    expect((await getProposal(proposalId))!.status).toBe("aceite");

    const contracts = (await listContracts()).filter((c) => c.proposalId === proposalId);
    expect(contracts).toHaveLength(1); // exactly one contract on double-accept
    expect(contracts[0]).toMatchObject({ quoteId, status: "aceite" });

    let inv = await listInvoicesForQuote(quoteId);
    const sinais = sinalOf(inv);
    expect(sinais).toHaveLength(1); // exactly one sinal on double-accept
    const sinal = sinais[0];
    expect(sinal).toMatchObject({ kind: "sinal", status: "emitida", amount: 3690 });
    expect(sinal.vatRate).toBe(0.23);
    expect(activeSaldo(inv)).toHaveLength(0); // saldo not issued until sinal is paid

    // 4) Mark the sinal paga → 70% saldo auto-issued; the pair reconciles exactly.
    const pay = await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id));
    expect(pay.status).toBe(200);
    const payJson = await pay.json();
    expect(payJson.saldoAutoIssued).toBeTruthy();

    inv = await listInvoicesForQuote(quoteId);
    const saldos = activeSaldo(inv);
    expect(saldos).toHaveLength(1);
    const saldo = saldos[0];
    expect(saldo).toMatchObject({ kind: "saldo", status: "emitida", amount: 8610 });
    // Money reconciles to the cent (integer cents): sinal + saldo === total.
    expect(cents(sinal.amount) + cents(saldo.amount)).toBe(cents(total));

    // 5) Revert the sinal (paga → emitida) → the unpaid auto-saldo is annulled
    //    (no phantom 70% debt left in the book).
    const revert = await faturaPATCH(jsonReq({ status: "emitida" }), params(sinal.id));
    expect(revert.status).toBe(200);
    expect((await revert.json()).saldoAnnulled).toBeTruthy();

    inv = await listInvoicesForQuote(quoteId);
    expect(activeSaldo(inv)).toHaveLength(0); // no active saldo remains
    const annulled = inv.find((i) => i.kind === "saldo");
    expect(annulled!.status).toBe("anulada");
    expect(inv.find((i) => i.id === sinal.id)!.status).toBe("emitida");
    expect(inv.find((i) => i.id === sinal.id)!.paidAt).toBeUndefined(); // paidAt cleared on revert

    // 6) Fiscal numbering across every issued invoice: sequential, unique, gap-free.
    const numbers = inv.map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length); // unique
    const seq = numbers.map(seqNum).sort((a, b) => a - b);
    expect(seq).toEqual([1, 2]); // FT .../0001 (sinal) + FT .../0002 (saldo), gap-free
  });
});

describe("odd-cent total exercises the EXACT-saldo path", () => {
  it("sinal + saldo reconcile to the cent on a €1000,01 total (not 1 cent short)", async () => {
    const quoteId = await createQuote();
    // vatRate 0 so the total lands exactly on an odd-cent value the split must close.
    const { proposalId, total } = await sendProposal(
      quoteId,
      [{ description: "Pacote completo", qty: 1, unitPrice: 1000.01 }],
      0,
    );
    expect(cents(total)).toBe(100001); // €1000,01

    expect((await acceptProposal(proposalId)).status).toBe(200);
    let inv = await listInvoicesForQuote(quoteId);
    const sinal = sinalOf(inv)[0];
    // splitThirtySeventy(1000.01): sinal 300.00, saldo 700.01 (saldo = total − sinal).
    expect(cents(sinal.amount)).toBe(30000); // €300,00

    const pay = await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id));
    expect(pay.status).toBe(200);

    inv = await listInvoicesForQuote(quoteId);
    const saldo = activeSaldo(inv)[0];
    // The exact path (total − sinal via the proposal) yields 700.01; the naive
    // sinal/3×7 fallback would give 700.00 and leave the book 1 cent short.
    expect(cents(saldo.amount)).toBe(70001); // €700,01
    expect(cents(sinal.amount) + cents(saldo.amount)).toBe(cents(total)); // closes to the cent
  });
});

describe("cross-route guards & negative paths", () => {
  it("guard: manual 30/70 split is refused (409) once the accept already auto-issued the sinal", async () => {
    const quoteId = await createQuote();
    const { proposalId } = await sendProposal(
      quoteId,
      [{ description: "Evento", qty: 1, unitPrice: 5000 }],
      0.23,
    );
    expect((await acceptProposal(proposalId)).status).toBe(200);

    // A different route (POST /api/faturas, split mode) must not double-charge the
    // sinal the accept path already issued for this quote.
    const dup = await faturaPOST(
      jsonReq({ quoteId, clientName: "Cliente Integração", split: true, total: 6150 }),
    );
    expect(dup.status).toBe(409);
    expect(sinalOf(await listInvoicesForQuote(quoteId))).toHaveLength(1); // still exactly one
  });

  it("guard: marking a non-sinal (total) invoice paga does NOT auto-issue a saldo", async () => {
    const quoteId = await createQuote();
    // Manually issue a single 'total' invoice (no sinal in play).
    const created = await faturaPOST(
      jsonReq({ quoteId, clientName: "Cliente Integração", kind: "total", amount: 4000 }),
    );
    expect(created.status).toBe(201);
    const totalInv = (await created.json()).invoices[0] as Invoice;

    const pay = await faturaPATCH(jsonReq({ status: "paga" }), params(totalInv.id));
    expect(pay.status).toBe(200);
    const payJson = await pay.json();
    expect(payJson.saldoAutoIssued).toBeUndefined(); // auto-saldo only fires on a sinal
    expect(activeSaldo(await listInvoicesForQuote(quoteId))).toHaveLength(0);
  });

  it("negative: accepting a proposal whose quote was deleted still records the acceptance without crashing", async () => {
    const quoteId = await createQuote();
    const { proposalId } = await sendProposal(
      quoteId,
      [{ description: "Evento", qty: 1, unitPrice: 3000 }],
      0.23,
    );
    // The quote vanishes (hard delete) before the client clicks accept.
    await deleteQuote(quoteId);
    expect(await getQuote(quoteId)).toBeNull();

    const res = await acceptProposal(proposalId);
    // Best-effort: the acceptance is still recorded (proposal + contract) rather
    // than 500-ing on the missing quote.
    expect(res.status).toBe(200);
    expect((await getProposal(proposalId))!.status).toBe("aceite");
    expect((await listContracts()).filter((c) => c.proposalId === proposalId)).toHaveLength(1);
  });

  it("negative: a tampered accept token is rejected (401) and mutates nothing", async () => {
    const quoteId = await createQuote();
    const { proposalId } = await sendProposal(
      quoteId,
      [{ description: "Evento", qty: 1, unitPrice: 2000 }],
      0.23,
    );
    const res = await propostaAcceptPOST(
      jsonReq({
        token: "tampered.token",
        action: "aceitar",
        acceptedTerms: true,
        acceptedName: "X",
      }),
    );
    expect(res.status).toBe(401);
    expect((await getProposal(proposalId))!.status).toBe("enviada"); // untouched
    expect(await listInvoicesForQuote(quoteId)).toHaveLength(0); // nothing issued
    expect((await listContracts()).filter((c) => c.quoteId === quoteId)).toHaveLength(0);
  });

  it("supersede guard at the seam: an older sent proposal cannot be accepted once a newer one exists (409)", async () => {
    const quoteId = await createQuote();
    const { proposalId: older } = await sendProposal(
      quoteId,
      [{ description: "Orçamento inicial", qty: 1, unitPrice: 8000 }],
      0.23,
    );
    // A revised (newer) proposal for the same quote — the old signed link is now stale.
    await sendProposal(
      quoteId,
      [{ description: "Orçamento revisto", qty: 1, unitPrice: 9000 }],
      0.23,
    );
    expect(await listProposalsForQuote(quoteId)).toHaveLength(2);

    const res = await acceptProposal(older);
    expect(res.status).toBe(409);
    expect((await getProposal(older))!.status).toBe("enviada"); // not bound to stale price
    expect(await listInvoicesForQuote(quoteId)).toHaveLength(0); // no contract/sinal minted
  });
});
