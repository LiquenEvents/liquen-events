import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));
const stores = vi.hoisted(() => ({
  quotes: vi.fn(async () => [] as unknown[]),
  proposals: vi.fn(async () => [] as unknown[]),
  suppliers: vi.fn(async () => [] as unknown[]),
  tasks: vi.fn(async () => [] as unknown[]),
  calendar: vi.fn(async () => [] as unknown[]),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: stores.quotes }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: stores.proposals }));
vi.mock("@/lib/suppliers-store", () => ({ listSuppliers: stores.suppliers }));
vi.mock("@/lib/tasks-store", () => ({ listTasks: stores.tasks }));
vi.mock("@/lib/calendar-store", () => ({ listCalendarEvents: stores.calendar }));

import { GET } from "./route";

function get(): NextRequest {
  return new Request("https://liquen.test/api/backup") as unknown as NextRequest;
}

beforeEach(() => {
  authState.authed = true;
  for (const fn of Object.values(stores)) {
    fn.mockReset();
    fn.mockResolvedValue([]);
  }
  vi.clearAllMocks();
});

describe("GET /api/backup", () => {
  it("401 without auth (never reads any store)", async () => {
    authState.authed = false;
    const res = await GET(get());
    expect(res.status).toBe(401);
    expect(stores.quotes).not.toHaveBeenCalled();
  });

  it("empty data → 200 with a well-formed export, never 500", async () => {
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({
      counts: { quotes: 0, proposals: 0, suppliers: 0, tasks: 0, calendarEvents: 0 },
      quotes: [],
      proposals: [],
      suppliers: [],
      tasks: [],
      calendarEvents: [],
    });
    expect(typeof json.exportedAt).toBe("string");
    expect(Number.isNaN(Date.parse(json.exportedAt))).toBe(false);
  });

  it("exports each dataset and reports accurate counts", async () => {
    stores.quotes.mockResolvedValue([{ id: "q1" }, { id: "q2" }]);
    stores.proposals.mockResolvedValue([{ id: "p1" }]);
    stores.suppliers.mockResolvedValue([{ id: "s1" }, { id: "s2" }, { id: "s3" }]);
    stores.tasks.mockResolvedValue([{ id: "t1" }]);
    stores.calendar.mockResolvedValue([{ id: "c1" }]);
    const res = await GET(get());
    const json = await res.json();
    expect(json.counts).toEqual({
      quotes: 2,
      proposals: 1,
      suppliers: 3,
      tasks: 1,
      calendarEvents: 1,
    });
    expect(json.quotes).toHaveLength(2);
  });

  it("sets a downloadable JSON Content-Disposition/Content-Type", async () => {
    const res = await GET(get());
    expect(res.headers.get("Content-Type")).toContain("application/json");
    const cd = res.headers.get("Content-Disposition") ?? "";
    expect(cd).toContain("attachment");
    expect(cd).toContain("liquen-backup-");
    expect(cd).toContain(".json");
  });

  it("a single store rejecting does not 500 — that dataset degrades to [] (per-store catch)", async () => {
    stores.suppliers.mockRejectedValue(new Error("db down"));
    stores.quotes.mockResolvedValue([{ id: "q1" }]);
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.suppliers).toEqual([]);
    expect(json.counts.suppliers).toBe(0);
    expect(json.counts.quotes).toBe(1);
  });

  it("all stores rejecting still yields a 200 empty backup (never 500 on failure)", async () => {
    for (const fn of Object.values(stores)) fn.mockRejectedValue(new Error("total outage"));
    const res = await GET(get());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.counts).toEqual({
      quotes: 0,
      proposals: 0,
      suppliers: 0,
      tasks: 0,
      calendarEvents: 0,
    });
  });
});
