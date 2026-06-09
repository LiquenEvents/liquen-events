import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  list: vi.fn(async () => [{ id: "t1", title: "Existing" }]),
  create: vi.fn(async (t: Record<string, unknown>) => ({ id: "t-new", ...t })),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/tasks-store", () => ({ listTasks: store.list, createTask: store.create }));

import { GET, POST } from "./route";

function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/tarefas", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/tarefas", () => {
  it("GET and POST reject the unauthenticated with 401", async () => {
    expect((await GET(req("GET"))).status).toBe(401);
    expect((await POST(req("POST", { title: "X" }))).status).toBe(401);
    expect(store.list).not.toHaveBeenCalled();
    expect(store.create).not.toHaveBeenCalled();
  });

  it("GET returns the list for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "t1", title: "Existing" }]);
  });

  it("POST creates a task when authenticated", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "Nova tarefa" }));
    expect(res.status).toBe(200);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("POST rejects an empty title with 400", async () => {
    authed.ok = true;
    const res = await POST(req("POST", { title: "   " }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });
});
