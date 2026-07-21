import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("@/lib/logger", () => ({ log: logger }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST } from "./route";

function post(body?: string, contentType = "application/json"): NextRequest {
  return new Request("https://liquen.test/api/security/csp-report", {
    method: "POST",
    headers: { "Content-Type": contentType },
    body,
  }) as unknown as NextRequest;
}

beforeEach(() => {
  rl.result = { ok: true };
  logger.warn.mockReset();
  vi.clearAllMocks();
});

describe("POST /api/security/csp-report", () => {
  it("accepts a report body unauthenticated (public by design) → 204", async () => {
    const res = await POST(
      post(
        JSON.stringify({
          "csp-report": {
            "document-uri": "https://liquen.pt/",
            "violated-directive": "script-src",
            "blocked-uri": "https://evil.example/x.js",
          },
        }),
      ),
    );
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      "CSP violation",
      expect.objectContaining({ blockedUri: "https://evil.example/x.js" }),
    );
  });

  it("accepts the modern report-to shape (documentURL/effectiveDirective/blockedURL)", async () => {
    const res = await POST(
      post(
        JSON.stringify({
          documentURL: "https://liquen.pt/a",
          effectiveDirective: "img-src",
          blockedURL: "https://evil.example/pixel.png",
        }),
      ),
    );
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      "CSP violation",
      expect.objectContaining({
        documentUri: "https://liquen.pt/a",
        blockedUri: "https://evil.example/pixel.png",
      }),
    );
  });

  it("accepts the Reporting API array shape (report nested under .body) → 204", async () => {
    const res = await POST(
      post(
        JSON.stringify([
          {
            type: "csp-violation",
            age: 10,
            url: "https://liquen.pt/b",
            body: {
              documentURL: "https://liquen.pt/b",
              effectiveDirective: "connect-src",
              blockedURL: "https://evil.example/beacon",
            },
          },
        ]),
        "application/reports+json",
      ),
    );
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledWith(
      "CSP violation",
      expect.objectContaining({
        documentUri: "https://liquen.pt/b",
        blockedUri: "https://evil.example/beacon",
      }),
    );
  });

  it("ignores non-CSP report types in the Reporting API array (no log)", async () => {
    const res = await POST(
      post(
        JSON.stringify([{ type: "deprecation", body: { id: "x" } }]),
        "application/reports+json",
      ),
    );
    expect(res.status).toBe(204);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("application/csp-report content-type still parses → 204", async () => {
    const res = await POST(
      post(JSON.stringify({ "csp-report": { "document-uri": "x" } }), "application/csp-report"),
    );
    expect(res.status).toBe(204);
  });

  it("malformed JSON body must not 500 → 204 (report ignored)", async () => {
    const res = await POST(post("{ not json"));
    expect(res.status).toBe(204);
  });

  it("empty body must not 500 → 204", async () => {
    const res = await POST(post(undefined));
    expect(res.status).toBe(204);
  });

  it("a non-object JSON body (e.g. a bare string) must not 500 → 204", async () => {
    const res = await POST(post(JSON.stringify("just a string")));
    expect(res.status).toBe(204);
  });

  it("rate-limited callers get 429 and are not logged", async () => {
    rl.result = { ok: false, retryAfter: 5 };
    const res = await POST(post(JSON.stringify({ "csp-report": {} })));
    expect(res.status).toBe(429);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  it("never echoes report content back in the response body", async () => {
    const res = await POST(
      post(JSON.stringify({ "csp-report": { "document-uri": "https://secret/" } })),
    );
    expect(await res.text()).toBe("");
  });
});
