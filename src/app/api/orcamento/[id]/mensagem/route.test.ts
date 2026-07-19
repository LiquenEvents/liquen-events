import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? { id: "LIQ-1", email: "ana@x.pt", messages: [{ at: "t0", body: "old" }] }
      : null,
  ),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: store.get, updateQuote: store.update }));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/mensagem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/mensagem", () => {
  it("rejects the unauthenticated with 401 and sends nothing", async () => {
    const res = await POST(req({ message: "Olá" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.get).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown quote", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Olá" }), ctx("nope"));
    expect(res.status).toBe(404);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("rejects an empty (whitespace-only) message with 400", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "   " }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("emails the client and appends the message to the quote's log", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Nova mensagem" }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "ana@x.pt" });
    // The existing message is preserved and the new one appended (not clobbered).
    expect(store.update).toHaveBeenCalledWith("LIQ-1", {
      messages: [{ at: "t0", body: "old" }, expect.objectContaining({ body: "Nova mensagem" })],
    });
  });
});
