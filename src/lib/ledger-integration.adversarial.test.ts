import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { promises as fsp, rmSync } from "node:fs";
import type { NextRequest } from "next/server";

/**
 * FISCAL LEDGER SEAM — adversarial integration test (real routes + real stores).
 *
 * Distinct from api/lifecycle-integration.test.ts (happy quote→…→revert chain)
 * and integration-seams.adversarial.test.ts (Dossier stage ↔ follow-up pipeline).
 * Here the target is the coherence of the *fiscal ledger* under ANNUL / REISSUE
 * and its agreement with the Financeiro reconciliation math in `dossier.ts`
 * (`computeEventMetrics`, `reconcileFinance`) and with the informal `payments`
 * array — the exact cross-module seams unit tests miss because they never drive
 * a real annul through the route and then re-derive the cockpit numbers.
 *
 * Isolation follows the lifecycle test: mock ONLY the storage plumbing (real
 * Repository + real FileBackend rooted at a throwaway temp dir) and the non-store
 * infra (auth/mail/push/pdf/rate-limit + an in-memory app-state for the FT
 * counter). Every domain store stays REAL. Clock + TZ pinned so the dev FT
 * counter's `getFullYear()` and all issuedAt/paidAt stamps are deterministic.
 */

const TMP = vi.hoisted(() => {
  const base = (process.env.TMPDIR || "/tmp").replace(/\/+$/, "");
  return {
    dir: `${base}/liquen-ledger-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  };
});

const APPSTATE = vi.hoisted(() => ({ map: new Map<string, unknown>() }));

vi.mock("@/lib/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repository")>();
  return {
    ...actual,
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

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/proposal-pdf", () => ({
  renderProposalPdf: vi.fn(async () => new Uint8Array([0x25, 0x50, 0x44, 0x46])),
}));
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

// ── Real stores + pure derivers ──
import { getQuote, updateQuote } from "@/lib/quotes-store";
import { getProposalByQuote } from "@/lib/proposals-store";
import { listInvoicesForQuote, type Invoice } from "@/lib/invoices-store";
import { createProposalToken } from "@/lib/proposal-token";
import {
  computeEventMetrics,
  reconcileFinance,
  type DossierData,
  type DossierInvoice,
} from "@/lib/orcamento/dossier";
import type { Payment } from "@/lib/orcamento/types";

// Pinned clock: 2026-07-21 mid-morning UTC (July → Lisbon UTC+1; calendar days
// coincide). The dev FT counter reads getFullYear() → 2026 deterministically.
const NOW_ISO = "2026-07-21T09:00:00.000Z";

const cents = (n: number) => Math.round(n * 100);
const seqNum = (number: string) => Number(/\/(\d+)\s*$/.exec(number)?.[1] ?? "NaN");

function jsonReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}
const params = (id: string) => ({ params: Promise.resolve({ id }) });

async function createQuote(over: Record<string, unknown> = {}): Promise<string> {
  const res = await orcamentoPOST(
    jsonReq({
      form: {
        name: "Cliente Ledger",
        email: "ledger@example.com",
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
  return (await res.json()).id as string;
}

async function sendProposal(
  quoteId: string,
  unitPrice: number,
  vatRate: number,
): Promise<{ proposalId: string; total: number }> {
  const res = await propostaCreatePOST(
    jsonReq({ lineItems: [{ description: "Evento", qty: 1, unitPrice }], vatRate }),
    params(quoteId),
  );
  expect(res.status).toBe(200);
  const json = await res.json();
  return { proposalId: json.id as string, total: json.total as number };
}

function acceptProposal(proposalId: string) {
  return propostaAcceptPOST(
    jsonReq({
      token: createProposalToken(proposalId),
      action: "aceitar",
      acceptedTerms: true,
      acceptedName: "Cliente Ledger",
    }),
  );
}

const toDossierInv = (i: Invoice): DossierInvoice => ({
  id: i.id,
  number: i.number,
  kind: i.kind,
  amount: i.amount,
  status: i.status,
  issuedAt: i.issuedAt,
  dueAt: i.dueAt,
  paidAt: i.paidAt,
});

/** Build the DossierData the cockpit derivers consume from the REAL persisted state. */
async function dossierFor(quoteId: string): Promise<DossierData> {
  const quote = (await getQuote(quoteId))!;
  const proposal = await getProposalByQuote(quoteId);
  const invoices = (await listInvoicesForQuote(quoteId)).map(toDossierInv);
  return { quote, proposal, contract: null, invoices };
}

const active = (rows: Invoice[], kind: Invoice["kind"]) =>
  rows.filter((i) => i.kind === kind && i.status !== "anulada");

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-only-not-a-secret"; // gitleaks:allow — test placeholder
  delete process.env.SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  APPSTATE.map.clear();
  await fsp.rm(TMP.dir, { recursive: true, force: true });
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.setSystemTime(new Date(NOW_ISO));
});

afterAll(() => {
  vi.useRealTimers();
  rmSync(TMP.dir, { recursive: true, force: true });
});

describe("fiscal ledger under annul/reissue ↔ Financeiro reconciliation", () => {
  it("annul a PAID sinal after auto-saldo: orphan saldo is annulled and metrics zero out (no phantom debt/credit)", async () => {
    const quoteId = await createQuote();
    const { proposalId, total } = await sendProposal(quoteId, 10000, 0.23);
    expect(total).toBe(12300);
    expect((await acceptProposal(proposalId)).status).toBe(200);

    let inv = await listInvoicesForQuote(quoteId);
    const sinal = active(inv, "sinal")[0];
    expect(sinal.amount).toBe(3690);

    // Pay the sinal → 70% saldo auto-issued.
    expect((await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id))).status).toBe(200);
    inv = await listInvoicesForQuote(quoteId);
    expect(active(inv, "saldo")).toHaveLength(1);

    // ANNUL the paid sinal (paga → anulada). The auto-saldo it spawned must not
    // be left as an active 70% debt with no live 30% sinal behind it.
    const ann = await faturaPATCH(jsonReq({ status: "anulada" }), params(sinal.id));
    expect(ann.status).toBe(200);
    expect((await ann.json()).saldoAnnulled).toBeTruthy();

    inv = await listInvoicesForQuote(quoteId);
    expect(active(inv, "sinal")).toHaveLength(0);
    expect(active(inv, "saldo")).toHaveLength(0); // orphan saldo annulled

    // Financeiro must agree: anulada excluded from BOTH issued and paid.
    const m = computeEventMetrics(await dossierFor(quoteId), new Date(NOW_ISO));
    expect(m.ledgerIssued).toBe(0);
    expect(m.ledgerPaid).toBe(0);
    expect(m.pctPaid).toBe(0);
    const rec = reconcileFinance(await dossierFor(quoteId));
    expect(rec.ledgerPaid).toBe(0);
    expect(rec.diverges).toBe(false); // no informal payments either → coherent
  });

  it("odd-cent total 1000,01 → pay sinal + saldo → computeEventMetrics reconciles to the exact cent", async () => {
    const quoteId = await createQuote();
    const { proposalId, total } = await sendProposal(quoteId, 1000.01, 0);
    expect(cents(total)).toBe(100001);
    expect((await acceptProposal(proposalId)).status).toBe(200);

    let inv = await listInvoicesForQuote(quoteId);
    const sinal = active(inv, "sinal")[0];
    expect(cents(sinal.amount)).toBe(30000); // 300,00

    expect((await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id))).status).toBe(200);
    inv = await listInvoicesForQuote(quoteId);
    const saldo = active(inv, "saldo")[0];
    expect(cents(saldo.amount)).toBe(70001); // 700,01 (exact total − sinal)

    // Pay the saldo too.
    expect((await faturaPATCH(jsonReq({ status: "paga" }), params(saldo.id))).status).toBe(200);

    const m = computeEventMetrics(await dossierFor(quoteId), new Date(NOW_ISO));
    expect(cents(m.contracted)).toBe(100001);
    expect(cents(m.ledgerPaid)).toBe(100001); // no lost/gained cent across the chain
    expect(cents(m.ledgerIssued)).toBe(100001);
    expect(m.pctPaid).toBe(1);
  });

  it("annul + reissue: FT numbers stay unique/monotonic, anulada keeps its own number, no double-count", async () => {
    const quoteId = await createQuote();
    const { proposalId } = await sendProposal(quoteId, 10000, 0.23);
    expect((await acceptProposal(proposalId)).status).toBe(200);

    let inv = await listInvoicesForQuote(quoteId);
    const sinal = active(inv, "sinal")[0];
    expect(seqNum(sinal.number)).toBe(1); // FT 2026/0001

    // Pay → saldo auto-issued (FT ...0002); then annul the sinal → saldo annulled.
    await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id));
    await faturaPATCH(jsonReq({ status: "anulada" }), params(sinal.id));
    inv = await listInvoicesForQuote(quoteId);
    expect(active(inv, "sinal")).toHaveLength(0);
    expect(active(inv, "saldo")).toHaveLength(0);
    const annulledNumbers = inv.map((i) => i.number).sort();

    // Reissue the 30/70 pair via the split route (dup guard sees no ACTIVE sinal).
    const reissue = await faturaPOST(
      jsonReq({ quoteId, clientName: "Cliente Ledger", split: true, total: 12300 }),
    );
    expect(reissue.status).toBe(201);

    inv = await listInvoicesForQuote(quoteId);
    const numbers = inv.map((i) => i.number);
    expect(new Set(numbers).size).toBe(numbers.length); // no reused fiscal number

    // The reissued pair got FRESH numbers (0003/0004); the anulada kept 0001/0002.
    const reissued = [...active(inv, "sinal"), ...active(inv, "saldo")];
    expect(reissued).toHaveLength(2);
    for (const r of reissued) expect(annulledNumbers).not.toContain(r.number);
    const reissuedSeq = reissued.map((r) => seqNum(r.number)).sort((a, b) => a - b);
    expect(reissuedSeq).toEqual([3, 4]);

    // ledgerIssued counts ONLY the live pair (anulada 0001/0002 excluded) — the
    // annulled originals must not double-count into the issued total.
    const m = computeEventMetrics(await dossierFor(quoteId), new Date(NOW_ISO));
    expect(m.ledgerIssued).toBe(12300);
  });

  it("revised proposal after accept: auto-saldo closes the ORIGINAL sinal's total, ledger stays self-consistent", async () => {
    const quoteId = await createQuote();
    // Proposal A: subtotal 10000 @ 23% → total 12300. Accept → sinal 3690.
    const { proposalId, total: totalA } = await sendProposal(quoteId, 10000, 0.23);
    expect(totalA).toBe(12300);
    expect((await acceptProposal(proposalId)).status).toBe(200);
    const sinal = active(await listInvoicesForQuote(quoteId), "sinal")[0];
    expect(sinal.amount).toBe(3690);

    // A REVISED proposal B (double the price) is drafted+sent AFTER the sinal was
    // already billed. getProposalByQuote now returns B — but the auto-saldo must
    // NOT rebase onto B; it must remain the remainder of the ALREADY-BILLED sinal.
    const { total: totalB } = await sendProposal(quoteId, 20000, 0.23);
    expect(totalB).toBe(24600);

    // Pay the original sinal → auto-saldo.
    expect((await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id))).status).toBe(200);
    const saldo = active(await listInvoicesForQuote(quoteId), "saldo")[0];

    // Saldo = totalA − sinal (12300 − 3690 = 8610), i.e. 70% of the ORIGINAL deal,
    // NOT 70% of the revised 24600 (17220). sinal + saldo must close totalA to the cent.
    expect(saldo.amount).toBe(8610);
    expect(cents(sinal.amount) + cents(saldo.amount)).toBe(cents(totalA));

    const m = computeEventMetrics(await dossierFor(quoteId), new Date(NOW_ISO));
    expect(m.ledgerIssued).toBe(12300); // sinal + saldo, self-consistent with what was billed
  });

  it("payments array vs ledger: reconcileFinance dedups a doubly-tracked sinal; metrics never double-count", async () => {
    const quoteId = await createQuote();
    const { proposalId, total } = await sendProposal(quoteId, 10000, 0.23);
    expect((await acceptProposal(proposalId)).status).toBe(200);

    const inv = await listInvoicesForQuote(quoteId);
    const sinal = active(inv, "sinal")[0];
    await faturaPATCH(jsonReq({ status: "paga" }), params(sinal.id)); // ledger sinal paid

    // The SAME sinal was also jotted into the informal payments array.
    const informalSinal: Payment = {
      id: "pay-sinal",
      kind: "sinal",
      amount: 3690,
      date: "2026-07-21",
      paid: true,
      note: "sinal (informal)",
    };
    await updateQuote(quoteId, { payments: [informalSinal] });

    const rec = reconcileFinance(await dossierFor(quoteId));
    // Both track the same 3690 → they AGREE (no divergence, no summing of the two).
    expect(rec.informalPaid).toBe(3690);
    expect(rec.ledgerPaid).toBe(3690);
    expect(rec.diverges).toBe(false);

    const m = computeEventMetrics(await dossierFor(quoteId), new Date(NOW_ISO));
    // ledgerPaid is the ledger truth ONLY — the informal 3690 is not added on top.
    expect(m.ledgerPaid).toBe(3690);
    expect(m.informalPaid).toBe(3690);
    expect(cents(m.ledgerPaid)).toBe(369000); // exactly the sinal, not 2×
    expect(total).toBe(12300);
  });
});
