import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
// Data the mocked stores return; the route feeds these into the REAL, pure
// lib/followups computation so the orchestration is exercised end-to-end.
const data = vi.hoisted(() => ({
  quotes: [] as unknown[],
  proposals: [] as unknown[],
  invoices: [] as unknown[],
  quotesThrows: false,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({
  listQuotes: vi.fn(async () => {
    if (data.quotesThrows) throw new Error("db down");
    return data.quotes;
  }),
}));
vi.mock("@/lib/proposals-store", () => ({
  listAllProposals: vi.fn(async () => data.proposals),
}));
vi.mock("@/lib/invoices-store", () => ({
  listInvoices: vi.fn(async () => data.invoices),
}));

import { GET } from "./route";

function req(): NextRequest {
  return new Request("https://liquen.test/api/followups") as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  data.quotes = [];
  data.proposals = [];
  data.invoices = [];
  data.quotesThrows = false;
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-07-20T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("/api/followups", () => {
  it("rejects the unauthenticated with 401", async () => {
    const res = await GET(req());
    expect(res.status).toBe(401);
  });

  it("returns 200 with an empty array when there is nothing to chase", async () => {
    authed.ok = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("surfaces an uncontacted pending lead (boundary: submitted > 3 days ago)", async () => {
    authed.ok = true;
    data.quotes = [
      {
        id: "q1",
        name: "Ana",
        status: "pendente",
        submittedAt: "2026-07-01T00:00:00Z", // 19 days before now
        archived: false,
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body).toHaveLength(1);
    expect(body[0]).toMatchObject({ kind: "lead_sem_contacto", quoteId: "q1", clientName: "Ana" });
    expect(body[0].duenessDays).toBeGreaterThanOrEqual(0);
  });

  it("ignores archived (soft-deleted) leads", async () => {
    authed.ok = true;
    data.quotes = [
      {
        id: "q1",
        name: "Ana",
        status: "pendente",
        submittedAt: "2026-07-01T00:00:00Z",
        archived: true,
      },
    ];
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("turns an overdue issued invoice into a payment follow-up", async () => {
    authed.ok = true;
    data.quotes = [{ id: "q9", name: "Bruno", status: "aceite", archived: false }];
    data.invoices = [
      {
        id: "i1",
        number: "2026-001",
        quoteId: "q9",
        amount: 1000,
        status: "emitida",
        dueAt: "2026-07-01",
      },
    ];
    const res = await GET(req());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.some((f: { kind: string }) => f.kind === "pagamento_em_atraso")).toBe(true);
  });

  it("is resilient when a single store rejects: degrades to 200, not 500", async () => {
    authed.ok = true;
    data.quotesThrows = true; // listQuotes rejects — route .catch(() => [])
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});
