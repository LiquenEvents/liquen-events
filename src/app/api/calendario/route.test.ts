import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "e1", title: "Reunião", date: "2026-07-01" }]),
  create: vi.fn(async (e: Record<string, unknown>) => ({ id: "e-new", ...e })),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/calendar-store", () => ({
  listCalendarEvents: store.list,
  createCalendarEvent: store.create,
}));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/calendario", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/calendario", () => {
  it("GET and POST reject the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { title: "X", date: "2026-07-01" }))).status).toBe(401);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("GET returns the events for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "e1", title: "Reunião", date: "2026-07-01" }]);
  });

  it("POST creates an event when authenticated", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Visita ao espaço", date: "2026-08-15" }));
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("POST rejects a malformed/missing date with 400", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Sem data válida", date: "15/08/2026" }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });
});
