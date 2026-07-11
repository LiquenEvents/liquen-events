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

import { POST } from "./route";
import { createProposalToken } from "@/lib/proposal-token";
import { updateQuoteWith } from "@/lib/quotes-store";

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

  it("accepts a proposal: marks it aceite and advances the quote", async () => {
    seedProposal("p3");
    const res = await POST(postReq({ token: createProposalToken("p3"), action: "aceitar" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ ok: true, status: "aceite" });
    expect(proposalsDb.store.get("p3")?.status).toBe("aceite");
    expect(proposalsDb.store.get("p3")?.respondedAt).toBeTruthy();
    // Quote advances AND the client's decision lands in the activity log
    // (via updateQuoteWith, so a concurrent back-office edit can't drop it).
    expect(updateQuoteWith).toHaveBeenCalledWith("q-p3", expect.any(Function));
    expect(quotesDb.store.get("q-p3")).toMatchObject({
      status: "aceite",
      activityLog: [expect.objectContaining({ kind: "status_change", actor: "Cliente Teste" })],
    });
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
