import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({ del: vi.fn(async (id: string) => id) }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/calendar-store", () => ({ deleteCalendarEvent: store.del }));

import { DELETE } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(): NextRequest {
  return new Request("https://liquen.test/api/calendario/e1", {
    method: "DELETE",
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/calendario/[id]", () => {
  it("DELETE rejects the unauthenticated with 401", async () => {
    expect((await DELETE(req(), ctx("e1"))).status).toBe(401);
    expect(store.del).not.toHaveBeenCalled();
  });

  it("DELETE removes the event when authenticated", async () => {
    authed.ok = true;
    const res = await DELETE(req(), ctx("e1"));
    expect(res.status).toBe(200);
    expect(store.del).toHaveBeenCalledWith("e1");
  });
});
