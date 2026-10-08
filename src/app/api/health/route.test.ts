import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { NextRequest } from "next/server";

const sb = vi.hoisted(() => ({
  client: null as unknown,
  chamadas: 0,
}));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => {
    sb.chamadas += 1;
    return sb.client;
  },
}));

import { GET } from "./route";

const TOKEN = "token-de-teste-nao-secreto";

function get(authorization?: string): NextRequest {
  return new Request("https://liquen.test/api/health", {
    headers: authorization ? { authorization } : {},
  }) as unknown as NextRequest;
}
const comToken = () => get(`Bearer ${TOKEN}`);

// Build a minimal Supabase-like stub whose HEAD count query resolves to the
// given result (or throws when `throws` is set).
function fakeSupabase(result: { error: unknown } | "throw") {
  return {
    from: () => ({
      select: () => ({
        abortSignal: () =>
          result === "throw" ? Promise.reject(new Error("boom")) : Promise.resolve(result),
      }),
    }),
  };
}

beforeEach(() => {
  sb.client = null;
  sb.chamadas = 0;
  process.env.HEALTH_TOKEN = TOKEN;
  vi.clearAllMocks();
});
afterEach(() => {
  delete process.env.HEALTH_TOKEN;
});

describe("GET /api/health — ao público, só «ok» (auditoria externa, S3)", () => {
  it("sem cabeçalho: {status:'ok'} e mais nada, sem tocar na base de dados", async () => {
    sb.client = fakeSupabase({ error: { message: "em baixo" } });
    const res = await GET(get());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(sb.chamadas).toBe(0);
  });

  it("com um token errado, igual ao público", async () => {
    const res = await GET(get("Bearer outro-token"));
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("sem HEALTH_TOKEN definido, ninguém vê o detalhe — nem com um token qualquer", async () => {
    delete process.env.HEALTH_TOKEN;
    const res = await GET(get("Bearer "));
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("não mostra uptime, hora, versão nem integrações", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    const json = await (await GET(get())).json();
    for (const k of ["uptime", "time", "version", "checks"]) expect(json).not.toHaveProperty(k);
    delete process.env.SMTP_HOST;
  });
});

describe("GET /api/health — com Authorization: Bearer <HEALTH_TOKEN>", () => {
  it("no Supabase configured → 200, status ok, database:fallback", async () => {
    sb.client = null;
    const res = await GET(comToken());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.checks.database).toBe("fallback");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("database responding → 200, ok, database:ok", async () => {
    sb.client = fakeSupabase({ error: null });
    const res = await GET(comToken());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.checks.database).toBe("ok");
  });

  it("database query returns an error → 503 degraded, database:down", async () => {
    sb.client = fakeSupabase({ error: { message: "relation missing" } });
    const res = await GET(comToken());
    expect(res.status).toBe(503);
    const json = await res.json();
    expect(json.status).toBe("degraded");
    expect(json.checks.database).toBe("down");
  });

  it("database query throwing → 503 degraded, database:down (never throws out of the route)", async () => {
    sb.client = fakeSupabase("throw");
    const res = await GET(comToken());
    expect(res.status).toBe(503);
    expect((await res.json()).checks.database).toBe("down");
  });

  it("shows the build SHA", async () => {
    process.env.VERCEL_GIT_COMMIT_SHA = "abcdef1234567";
    const json = await (await GET(comToken())).json();
    expect(json.version).toBe("abcdef1");
    delete process.env.VERCEL_GIT_COMMIT_SHA;
  });

  it("reports integration booleans only, never secret values", async () => {
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.VAPID_PUBLIC_KEY = "pub";
    const json = await (await GET(comToken())).json();
    expect(json.checks.email).toBe(true);
    expect(json.checks.push).toBe(true);
    expect(json.checks.email).not.toBe("smtp.example.com");
    delete process.env.SMTP_HOST;
    delete process.env.VAPID_PUBLIC_KEY;
  });

  it("includes a fresh ISO timestamp and a numeric uptime", async () => {
    const json = await (await GET(comToken())).json();
    expect(Number.isNaN(Date.parse(json.time))).toBe(false);
    expect(typeof json.uptime).toBe("number");
  });
});
