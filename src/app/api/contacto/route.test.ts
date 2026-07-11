import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const mail = vi.hoisted(() => ({ send: vi.fn(async () => ({ sent: true })) }));
const push = vi.hoisted(() => ({ send: vi.fn(async () => ({ sent: 0 })) }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));

vi.mock("@/lib/mail", () => ({ sendMail: mail.send, esc: (v: unknown) => String(v ?? "") }));
vi.mock("@/lib/push", () => ({ sendPushToAll: push.send }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST } from "./route";

function postReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/contacto", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

const valid = { nome: "Ana Silva", email: "ana@example.com", mensagem: "Olá, quero um orçamento." };

beforeEach(() => {
  rl.result = { ok: true };
  vi.clearAllMocks();
});

describe("POST /api/contacto", () => {
  it("sends the enquiry (email + push) and a confirmation to the client", async () => {
    const res = await POST(postReq(valid));
    expect(res.status).toBe(200);
    expect(mail.send).toHaveBeenCalledTimes(2);
    const calls = mail.send.mock.calls as unknown as Array<[Record<string, unknown>]>;
    // 1st: team notification (reply goes to the client)…
    expect(calls[0][0]).toMatchObject({ replyTo: "ana@example.com" });
    // …2nd: confirmation TO the client.
    expect(calls[1][0]).toMatchObject({ to: "ana@example.com" });
    expect(push.send).toHaveBeenCalledTimes(1);
  });

  it("silently drops a honeypot hit without emailing", async () => {
    const res = await POST(postReq({ ...valid, website: "i-am-a-bot" }));
    expect(res.status).toBe(200);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("rejects an invalid submission (missing message) with 400", async () => {
    const res = await POST(postReq({ nome: "Ana", email: "ana@example.com" }));
    expect(res.status).toBe(400);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("returns 429 with Retry-After when throttled", async () => {
    rl.result = { ok: false, retryAfter: 42 };
    const res = await POST(postReq(valid));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("42");
    expect(mail.send).not.toHaveBeenCalled();
  });
});
