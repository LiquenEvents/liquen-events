import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
const mail = vi.hoisted(() => ({ sent: true }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: mail.sent })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "liquen.alentejo@gmail.com",
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";
import { sendMail } from "@/lib/mail";

function post(body: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/inbox/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authState.authed = true;
  rl.result = { ok: true };
  mail.sent = true;
  vi.clearAllMocks();
});

describe("POST /api/inbox/reply", () => {
  it("401 without auth (and never sends)", async () => {
    authState.authed = false;
    const res = await POST(post({ to: "c@x.com", message: "olá" }));
    expect(res.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("429 when rate-limited", async () => {
    rl.result = { ok: false, retryAfter: 30 };
    const res = await POST(post({ to: "c@x.com", message: "olá" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends a valid reply and returns 200", async () => {
    const res = await POST(post({ to: "Cliente <c@x.com>", subject: "Oi", message: "olá" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailed: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("400 when the recipient is missing/invalid", async () => {
    expect((await POST(post({ message: "olá" }))).status).toBe(400);
    expect((await POST(post({ to: "not-an-email", message: "olá" }))).status).toBe(400);
  });

  it("400 when the message is empty", async () => {
    expect((await POST(post({ to: "c@x.com", message: "" }))).status).toBe(400);
  });

  it("400 on malformed JSON (must not be a 500)", async () => {
    const res = await POST(post("{ not json", true));
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects header-injection newlines in the recipient (400)", async () => {
    const res = await POST(post({ to: "c@x.com\r\nBcc: evil@x.com", message: "olá" }));
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
});
