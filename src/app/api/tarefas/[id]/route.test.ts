import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
  del: vi.fn(async (id: string) => id),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/tasks-store", () => ({ updateTask: store.update, deleteTask: store.del }));

import { PATCH, DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "PATCH" | "DELETE", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/tarefas/t1", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/tarefas/[id]", () => {
  it("PATCH and DELETE reject the unauthenticated with 401", async () => {
    expect((await PATCH(req("PATCH", { done: true }), ctx("t1"))).status).toBe(401);
    expect((await DELETE(req("DELETE"), ctx("t1"))).status).toBe(401);
    expect(store.update).not.toHaveBeenCalled();
    expect(store.del).not.toHaveBeenCalled();
  });

  it("PATCH updates the task when authenticated", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { done: true }), ctx("t1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith("t1", { done: true });
  });

  it("DELETE removes the task when authenticated", async () => {
    authed.ok = true;
    const res = await DELETE(req("DELETE"), ctx("t1"));
    expect(res.status).toBe(200);
    expect(store.del).toHaveBeenCalledWith("t1");
  });

  it("blocks mass-assignment of id/createdAt via PATCH", async () => {
    authed.ok = true;
    await PATCH(req("PATCH", { done: true, id: "t2-evil", createdAt: "2000-01-01" }), ctx("t1"));
    expect(store.update).toHaveBeenCalledWith("t1", { done: true });
  });

  it("rejects invalid field values with 400", async () => {
    authed.ok = true;
    const res = await PATCH(req("PATCH", { priority: "urgente" }), ctx("t1"));
    expect(res.status).toBe(400);
    expect(store.update).not.toHaveBeenCalled();
  });
});
