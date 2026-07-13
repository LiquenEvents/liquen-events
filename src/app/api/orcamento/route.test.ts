import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const store = vi.hoisted(() => ({
  create: vi.fn(async () => {}),
  list: vi.fn(async () => [{ id: "LIQ-1" }]),
}));
const authed = vi.hoisted(() => ({ ok: false }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));

vi.mock("@/lib/quotes-store", () => ({
  createQuote: store.create,
  listQuotes: store.list,
  generateQuoteId: () => "LIQ-TEST-0000000000000000",
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST, GET } from "./route";
import { sendMail } from "@/lib/mail";

const sendMailMock = vi.mocked(sendMail);

function req(method: "POST" | "GET", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validForm = { name: "Ana Silva", email: "ana@example.com", phone: "", guests: 50 };

beforeEach(() => {
  rl.result = { ok: true };
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento", () => {
  it("creates a quote and returns its reference id", async () => {
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.id).toMatch(/^LIQ-/);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("sends a confirmation email to the client, after the team notification", async () => {
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ replyTo: validForm.email });
    expect(sendMailMock.mock.calls[1][0]).toMatchObject({ to: validForm.email });
  });

  it("silently drops a honeypot hit without persisting or emailing", async () => {
    const res = await POST(req("POST", { form: validForm, website: "i-am-a-bot" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok"); // indistinguishable from success, to the bot
    expect(store.create).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload (name too short) with 400", async () => {
    const res = await POST(req("POST", { form: { name: "A", email: "bad" } }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("returns 429 when throttled", async () => {
    rl.result = { ok: false, retryAfter: 10 };
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(429);
  });
});

describe("GET /api/orcamento", () => {
  it("requires authentication (401 for the public)", async () => {
    authed.ok = false;
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });

  it("returns the quote list for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "LIQ-1" }]);
  });
});
