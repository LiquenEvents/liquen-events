import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mock the data layer + side effects; keep the HMAC token + route logic real ──
const proposalsDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
const quotesDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));

vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (id: string) => proposalsDb.store.get(id) ?? null),
  updateProposal: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const cur = proposalsDb.store.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    proposalsDb.store.set(id, next);
    return next;
  }),
}));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => quotesDb.store.get(id) ?? null),
  updateQuoteWith: vi.fn(
    async (id: string, mutate: (q: Record<string, unknown>) => Record<string, unknown>) => {
      const next = mutate(quotesDb.store.get(id) ?? { id });
      quotesDb.store.set(id, next);
      return next;
    },
  ),
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
// Isolate from the rate limiter (it has its own tests).
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => ({ ok: true })),
  clientIp: () => "test-ip",
  sweep: () => {},
}));
// Isolate from the (server-only) contract + invoice stores so accepting doesn't
// touch the repository/filesystem. `getContractByProposal` defaults to null so
// the accept path creates a fresh contract + sinal invoice; the idempotency test
// overrides it to return an existing one.
const contractsDb = vi.hoisted(() => ({ existing: null as Record<string, unknown> | null }));
vi.mock("@/lib/contracts-store", () => {
  const getContractByProposal = vi.fn(async () => contractsDb.existing);
  const createContract = vi.fn(async (c: Record<string, unknown>) => c);
  // Espelha o helper real sobre os primitivos mockados: regista via
  // createContract e só reporta created:true quando não pré-existia contrato —
  // assim as asserções existentes sobre createContract continuam válidas.
  const createContractIfAbsent = vi.fn(async (c: Record<string, unknown>) => {
    const existing = await getContractByProposal();
    if (existing) return { created: false, contract: existing };
    await createContract(c);
    return { created: true, contract: c };
  });
  return {
    getContractByProposal,
    createContract,
    createContractIfAbsent,
    newContractId: vi.fn(() => "contract-id"),
  };
});
vi.mock("@/lib/invoices-store", () => ({
  createInvoice: vi.fn(async (i: Record<string, unknown>) => i),
  newInvoiceId: vi.fn(() => "invoice-id"),
  nextInvoiceNumber: vi.fn(async () => "FT 2026/0001"),
  splitThirtySeventy: (total: number) => ({
    sinal: Math.round(total * 0.3 * 100) / 100,
    saldo: Math.round(total * 0.7 * 100) / 100,
  }),
}));

import { POST } from "./route";
import { createProposalToken } from "@/lib/proposal-token";
import { updateQuoteWith } from "@/lib/quotes-store";
import { createContract, createContractIfAbsent } from "@/lib/contracts-store";
import type { Contract } from "@/lib/contract-types";
import { createInvoice } from "@/lib/invoices-store";

/** The consent payload the accept path now requires (terms + signer name). */
const CONSENT = { acceptedTerms: true, acceptedName: "Cliente Teste" };

function postReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/proposta", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function seedProposal(id: string, over: Record<string, unknown> = {}) {
  proposalsDb.store.set(id, {
    id,
    quoteId: `q-${id}`,
    clientName: "Cliente Teste",
    clientEmail: "cliente@example.com",
    total: 12500,
    status: "enviada",
    ...over,
  });
}

beforeEach(() => {
  process.env.SESSION_SECRET = "integration-test-secret-1234567890";
  proposalsDb.store.clear();
  quotesDb.store.clear();
  contractsDb.existing = null;
  vi.clearAllMocks();
});

describe("POST /api/proposta", () => {
  it("rejects an invalid token with 401 and touches nothing", async () => {
    seedProposal("p1");
    const res = await POST(postReq({ token: "not-a-valid-token", action: "aceitar" }));
    expect(res.status).toBe(401);
    expect(proposalsDb.store.get("p1")?.status).toBe("enviada");
    expect(updateQuoteWith).not.toHaveBeenCalled();
  });

  it("rejects a malformed request (missing action) with 400", async () => {
    seedProposal("p2");
    const res = await POST(postReq({ token: createProposalToken("p2") }));
    expect(res.status).toBe(400);
  });

  it("returns 404 when the proposal no longer exists", async () => {
    const res = await POST(postReq({ token: createProposalToken("ghost"), action: "aceitar" }));
    expect(res.status).toBe(404);
  });

  it("rejects acceptance without terms consent (or signer name) with 400", async () => {
    seedProposal("p3a");
    // Missing acceptedTerms/acceptedName entirely.
    const bare = await POST(postReq({ token: createProposalToken("p3a"), action: "aceitar" }));
    expect(bare.status).toBe(400);
    // Terms ticked but no name.
    const noName = await POST(
      postReq({ token: createProposalToken("p3a"), action: "aceitar", acceptedTerms: true }),
    );
    expect(noName.status).toBe(400);
    // Nothing was mutated.
    expect(proposalsDb.store.get("p3a")?.status).toBe("enviada");
    expect(updateQuoteWith).not.toHaveBeenCalled();
    expect(createContract).not.toHaveBeenCalled();
  });

  it("accepts a proposal: marks it aceite, advances the quote, records a contract + 30% sinal invoice", async () => {
    seedProposal("p3");
    const res = await POST(
      postReq({ token: createProposalToken("p3"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, status: "aceite" });
    expect(proposalsDb.store.get("p3")?.status).toBe("aceite");
    expect(proposalsDb.store.get("p3")?.respondedAt).toBeTruthy();
    // Quote advances AND the client's decision lands in the activity log
    // (via updateQuoteWith, so a concurrent back-office edit can't drop it).
    expect(updateQuoteWith).toHaveBeenCalledWith("q-p3", expect.any(Function));
    // Two audit entries land: the client's decision, then the contract/sinal note.
    expect(quotesDb.store.get("q-p3")).toMatchObject({
      status: "aceite",
      activityLog: expect.arrayContaining([
        expect.objectContaining({ kind: "status_change", actor: "Cliente Teste" }),
        expect.objectContaining({ kind: "note_added" }),
      ]),
    });
    // A signed contract is recorded (name + terms version snapshot)…
    expect(createContract).toHaveBeenCalledWith(
      expect.objectContaining({
        proposalId: "p3",
        status: "aceite",
        acceptedName: "Cliente Teste",
      }),
    );
    // …and the 30% sinal invoice is auto-issued into the ledger (12500 × 0.3).
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sinal", amount: 3750 }),
    );
  });

  it("carries the proposal's vatRate into the auto-sinal, not a hardcoded 0.23 (FIX 4)", async () => {
    seedProposal("p-vat", { vatRate: 0.13 });
    const res = await POST(
      postReq({ token: createProposalToken("p-vat"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sinal", vatRate: 0.13 }),
    );
  });

  it("defaults the auto-sinal vatRate to 0.23 when the proposal carries none", async () => {
    seedProposal("p-novat"); // seedProposal doesn't set vatRate
    const res = await POST(
      postReq({ token: createProposalToken("p-novat"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    expect(createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sinal", vatRate: 0.23 }),
    );
  });

  it("does not duplicate the contract/invoice when one already exists for the proposal", async () => {
    seedProposal("p3b");
    contractsDb.existing = { id: "existing", proposalId: "p3b", status: "aceite" };
    const res = await POST(
      postReq({ token: createProposalToken("p3b"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    expect(createContract).not.toHaveBeenCalled();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("a concurrent accept that loses the contract-creation race issues no 2nd contract/sinal (TOCTOU #40)", async () => {
    seedProposal("p8");
    // Corrida: ambos os aceites passaram o getContractByProposal (nenhum via
    // contrato), mas o índice único deixou só o OUTRO vencer o insert — o nosso
    // helper reporta created:false. Não podemos então emitir um 2.º sinal.
    vi.mocked(createContractIfAbsent).mockResolvedValueOnce({
      created: false,
      // Only `created:false` matters here; the contract fields are immaterial.
      contract: { id: "winner", proposalId: "p8", status: "aceite" } as Contract,
    });
    const res = await POST(
      postReq({ token: createProposalToken("p8"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    // Proposta na mesma marcada aceite, mas sem sinal duplicado.
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("seeds the production plan (and event checklist) on an empty quote when accepted", async () => {
    seedProposal("p6", { category: "particulares" });
    const res = await POST(
      postReq({ token: createProposalToken("p6"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    const quote = quotesDb.store.get("q-p6") as Record<string, unknown>;
    // Production plan seeded, non-empty, each item prefixed with its phase.
    const plan = quote.productionPlan as { label: string }[];
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
    expect(plan.some((i) => i.label.startsWith("Sourcing · "))).toBe(true);
    // Event checklist seeded from the canonical template too.
    const checklist = quote.checklist as unknown[];
    expect(Array.isArray(checklist)).toBe(true);
    expect(checklist.length).toBeGreaterThan(0);
    // A single system audit entry summarises the seed.
    const log = quote.activityLog as { kind: string; actor: string }[];
    expect(log.filter((e) => e.kind === "note_added" && e.actor === "Sistema")).toHaveLength(1);
  });

  it("does not re-seed a quote that already has a production plan (idempotent)", async () => {
    seedProposal("p7", { category: "particulares" });
    // Pre-existing, hand-built plan + checklist must survive untouched.
    const existingPlan = [{ id: "keep-1", label: "Tarefa à mão", done: true }];
    const existingChecklist = [{ id: "keep-2", label: "Item à mão", done: false }];
    quotesDb.store.set("q-p7", {
      id: "q-p7",
      productionPlan: existingPlan,
      checklist: existingChecklist,
    });
    const res = await POST(
      postReq({ token: createProposalToken("p7"), action: "aceitar", ...CONSENT }),
    );
    expect(res.status).toBe(200);
    const quote = quotesDb.store.get("q-p7") as Record<string, unknown>;
    // Neither field was overwritten or appended to.
    expect(quote.productionPlan).toEqual(existingPlan);
    expect(quote.checklist).toEqual(existingChecklist);
    // No "Sistema" seed note was added (nothing to seed).
    const log = (quote.activityLog ?? []) as { kind: string; actor: string }[];
    expect(log.some((e) => e.actor === "Sistema")).toBe(false);
  });

  it("declines a proposal: marks it rejeitada and the quote rejeitado", async () => {
    seedProposal("p4");
    const res = await POST(postReq({ token: createProposalToken("p4"), action: "recusar" }));
    const json = await res.json();
    expect(json.status).toBe("rejeitada");
    expect(proposalsDb.store.get("p4")?.status).toBe("rejeitada");
    expect(quotesDb.store.get("q-p4")).toMatchObject({ status: "rejeitado" });
  });

  it("is idempotent: a second response returns the recorded one without re-updating", async () => {
    seedProposal("p5", { status: "aceite" });
    const res = await POST(postReq({ token: createProposalToken("p5"), action: "recusar" }));
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, status: "aceite", already: true });
    expect(updateQuoteWith).not.toHaveBeenCalled();
  });
});
