import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const rl = vi.hoisted(() => ({
  result: { ok: true } as { ok: boolean; retryAfter?: number },
  /** Grava POR QUE CHAVE (e com que tecto) a rota limita — um duplo que deitasse
   *  fora os argumentos deixava passar um balde partilhado por toda a gente. */
  limit: vi.fn(async (_chave: string, _max: number, _janelaMs: number) => rl.result),
}));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("@/lib/logger", () => ({ log: logger }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rl.limit,
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

  /**
   * O balde é POR ORIGEM. Um balde único para o endereço inteiro seria pior do
   * que não ter limite nenhum: bastava um browser em ciclo para calar os
   * relatórios de toda a gente — que é exactamente a altura em que eles
   * interessam.
   */
  it("limita por origem, com o tecto de 30 por minuto", async () => {
    await POST(post(JSON.stringify({ "csp-report": {} })));
    expect(rl.limit).toHaveBeenCalledWith("csp:test-ip", 30, 60_000);
  });

  it("rate-limited callers get 429 and are not logged", async () => {
    rl.result = { ok: false, retryAfter: 5 };
    const res = await POST(post(JSON.stringify({ "csp-report": {} })));
    expect(res.status).toBe(429);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  /**
   * O endereço é público por necessidade (é o browser que escreve aqui). O
   * limite de pedidos por minuto já cá estava; o que faltava era o tecto DENTRO
   * do pedido — um único POST com mil relatórios enchia os registos.
   */
  it("regista no máximo 20 relatórios por pedido", async () => {
    const muitos = Array.from({ length: 200 }, (_, i) => ({
      type: "csp-violation",
      body: { documentURL: `https://liquen.pt/${i}`, blockedURL: "https://evil.example/x" },
    }));
    const res = await POST(post(JSON.stringify(muitos), "application/reports+json"));
    expect(res.status).toBe(204);
    expect(logger.warn).toHaveBeenCalledTimes(20);
  });

  it("corta cada campo antes de o registar", async () => {
    const enorme = "https://evil.example/" + "a".repeat(50_000);
    const res = await POST(post(JSON.stringify({ "csp-report": { "blocked-uri": enorme } })));
    expect(res.status).toBe(204);
    const registado = logger.warn.mock.calls[0][1] as { blockedUri?: string };
    expect(registado.blockedUri!.length).toBe(300);
  });

  it("never echoes report content back in the response body", async () => {
    const res = await POST(
      post(JSON.stringify({ "csp-report": { "document-uri": "https://secret/" } })),
    );
    expect(await res.text()).toBe("");
  });
});
