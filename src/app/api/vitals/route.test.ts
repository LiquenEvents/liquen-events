import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * O endpoint dos Web Vitals é PÚBLICO — o corpo é escrito por quem quiser — e
 * o que ele regista vai direito para os registos de produção da Vercel, que
 * ficam conservados e consultáveis.
 *
 * Limpar só no cliente (WebVitals.tsx) não chega: um bot, um separador antigo
 * ainda com o pacote anterior, ou um pedido forjado à mão poriam na mesma um
 * `/portal/<token>` nos registos. Estes testes falham se o servidor voltar a
 * confiar no que lhe mandam.
 */
const rl = vi.hoisted(() => ({ ok: true }));
const logger = vi.hoisted(() => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }));

vi.mock("@/lib/logger", () => ({ log: logger }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST } from "./route";

const PORTAL_TOKEN =
  "eyJ0eXAiOiJwb3J0YWwiLCJxaWQiOiJMSVEtTTFBMkIzLTlGM0M3QTFCMkQ0RTVGNjAiLCJleHAiOjE4MTcwNDU5MDIwNjd9.xYFYVlyLqOb33tAqHDgzJBtmszJm7XHFxgQ3Oy3zGyY";
const PROPOSAL_TOKEN = "eyJ0eXAiOiJwcm9wb3NhbCIsInBpZCI6InByb3BfMTIzIn0.AbCdEf-_1234567890xyz";

function post(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/vitals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

function vital(path: string) {
  return { name: "LCP", value: 1234.6, rating: "good", path, nav: "navigate", conn: "4g" };
}

/** Tudo o que foi entregue ao logger, numa string pesquisável. */
function logged(): string {
  return JSON.stringify(logger.info.mock.calls);
}

beforeEach(() => {
  rl.ok = true;
  vi.clearAllMocks();
});

describe("POST /api/vitals — o token nunca chega aos registos", () => {
  it("não regista o token do portal, mesmo que o cliente o envie por inteiro", async () => {
    const res = await POST(post(vital(`/portal/${PORTAL_TOKEN}`)));
    expect(res.status).toBe(204);
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logged()).not.toContain(PORTAL_TOKEN);
    expect(logged()).toContain("/portal/[token]");
  });

  it("não regista o token da proposta (o que autoriza aceitar a proposta)", async () => {
    await POST(post(vital(`/en/proposta/${PROPOSAL_TOKEN}`)));
    expect(logged()).not.toContain(PROPOSAL_TOKEN);
    expect(logged()).toContain("/en/proposta/[token]");
  });

  it("continua a registar as rotas normais tal e qual — a métrica não perde valor", async () => {
    await POST(post(vital("/en/servicos/casamentos")));
    const call = logger.info.mock.calls[0];
    expect(call[0]).toBe("web-vital");
    expect(call[1]).toMatchObject({
      metric: "LCP",
      value: 1235, // arredondado (ms)
      rating: "good",
      path: "/en/servicos/casamentos",
      nav: "navigate",
      conn: "4g",
    });
  });

  it("aguenta um pedido sem `path`", async () => {
    await POST(post({ name: "CLS", value: 0.0123456, rating: "good" }));
    expect(logger.info).toHaveBeenCalledTimes(1);
    expect(logger.info.mock.calls[0][1]).toMatchObject({ path: undefined, value: 0.0123 });
  });

  it("continua a recusar corpos inválidos sem registar nada", async () => {
    await POST(post({ name: "NOPE", value: "x" }));
    expect(logger.info).not.toHaveBeenCalled();
  });
});
