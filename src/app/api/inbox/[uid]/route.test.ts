import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { InboxMessage } from "@/lib/inbox-types";

const message: InboxMessage = {
  uid: 42,
  from: "Cliente",
  fromAddress: "c@x.pt",
  subject: "Olá",
  date: "2026-07-01T00:00:00.000Z",
  seen: true,
  messageId: "<m@x>",
  references: [],
  attachments: [],
  text: "corpo",
};

const authed = vi.hoisted(() => ({ ok: false }));
const imap = vi.hoisted(() => ({
  // Default: the message exists. Individual tests override behaviour/return.
  getInboxMessage: vi.fn<(uid: number) => Promise<InboxMessage | null>>(async () => message),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/inbox", () => ({ getInboxMessage: imap.getInboxMessage }));

import { GET } from "./route";

function req(): NextRequest {
  return new Request("https://liquen.test/api/inbox/42") as unknown as NextRequest;
}
function call(uid: string) {
  return GET(req(), { params: Promise.resolve({ uid }) });
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("/api/inbox/[uid]", () => {
  it("rejects the unauthenticated with 401 and never touches IMAP", async () => {
    const res = await call("42");
    expect(res.status).toBe(401);
    expect(imap.getInboxMessage).not.toHaveBeenCalled();
  });

  it("returns the message for an authenticated admin", async () => {
    authed.ok = true;
    const res = await call("42");
    expect(res.status).toBe(200);
    expect(imap.getInboxMessage).toHaveBeenCalledWith(42);
    expect((await res.json()).subject).toBe("Olá");
  });

  it("404s (not 500) when the message does not exist", async () => {
    authed.ok = true;
    imap.getInboxMessage.mockResolvedValueOnce(null);
    const res = await call("999");
    expect(res.status).toBe(404);
    expect(imap.getInboxMessage).toHaveBeenCalledWith(999);
  });

  it("502s (a clean upstream error, not a 500) when the IMAP layer throws", async () => {
    authed.ok = true;
    imap.getInboxMessage.mockRejectedValueOnce(new Error("IMAP connection reset"));
    const res = await call("42");
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBeTruthy();
  });

  it("coerces a non-numeric uid to NaN and resolves to 404, never crashing", async () => {
    authed.ok = true;
    imap.getInboxMessage.mockResolvedValueOnce(null);
    const res = await call("abc");
    expect(res.status).toBe(404);
    // Pinning current behaviour: the route passes Number("abc") === NaN through.
    const arg = imap.getInboxMessage.mock.calls[0][0];
    expect(Number.isNaN(arg)).toBe(true);
  });

  it("passes a negative uid through as a negative number (no crash)", async () => {
    authed.ok = true;
    imap.getInboxMessage.mockResolvedValueOnce(null);
    const res = await call("-5");
    expect(res.status).toBe(404);
    expect(imap.getInboxMessage).toHaveBeenCalledWith(-5);
  });
});
