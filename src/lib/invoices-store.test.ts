import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── nextInvoiceNumber — the file/dev FALLBACK path ──
// getSupabase → null forces the app-state read-increment-write branch (the
// Supabase RPC path needs a real DB and is intentionally NOT tested here).
// app-state is mocked with an in-memory Map so the counter is deterministic and
// never touches the real data/ file.
const state = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
// Controllable Supabase stub: null ⇒ dev/file fallback path; an object with a
// mockable `rpc` ⇒ the configured atomic-counter path (FIX 2).
const sb = vi.hoisted(() => ({
  client: null as null | { rpc: (...args: unknown[]) => Promise<unknown> },
}));

vi.mock("./supabase", () => ({
  getSupabase: () => sb.client,
  isDatabaseConfigured: () => sb.client !== null,
}));
vi.mock("./app-state", () => ({
  getState: vi.fn(async (key: string) => (state.store.has(key) ? state.store.get(key) : null)),
  setState: vi.fn(async (key: string, value: unknown) => {
    state.store.set(key, value);
  }),
}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { nextInvoiceNumber, isUniqueViolation } from "./invoices-store";

beforeEach(() => {
  state.store.clear();
  sb.client = null; // default: Supabase unconfigured (dev/file fallback)
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("nextInvoiceNumber — app-state fallback (Supabase unconfigured)", () => {
  it("increments and zero-pads to 4 digits, starting at 0001", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T12:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0001");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0002");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0003");
  });

  it("continues from a persisted counter and grows past 4 digits", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-05T00:00:00Z"));
    state.store.set("invoice-seq-2026", 41);
    expect(await nextInvoiceNumber()).toBe("FT 2026/0042");
    state.store.set("invoice-seq-2026", 9999);
    expect(await nextInvoiceNumber()).toBe("FT 2026/10000");
  });

  it("resets per year (independent counter per year key)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0001");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0002");

    // New year → sequence restarts at 0001.
    vi.setSystemTime(new Date("2027-01-01T00:30:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2027/0001");

    // Back in 2026, its own counter picks up where it left off (separate key).
    vi.setSystemTime(new Date("2026-12-31T23:45:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0003");
  });
});

describe("nextInvoiceNumber — Supabase configured (FIX 2: refuse, don't fall back)", () => {
  it("uses the atomic RPC counter when it succeeds", async () => {
    sb.client = { rpc: vi.fn(async () => ({ data: 7, error: null })) };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0007");
  });

  it("THROWS (refuses to issue) when the RPC returns an error — never the racy app_state counter", async () => {
    // Migração em falta / função inexistente: em produção cair no contador racy
    // podia gerar um número fiscal duplicado. Preferimos recusar e berrar.
    sb.client = {
      rpc: vi.fn(async () => ({ data: null, error: { message: "function does not exist" } })),
    };
    await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
    // O contador de app_state NÃO foi tocado (não houve fallback silencioso).
    const { setState } = await import("./app-state");
    expect(setState).not.toHaveBeenCalled();
  });

  it("THROWS when the RPC itself rejects (e.g. network/permission)", async () => {
    sb.client = {
      rpc: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
  });

  it("THROWS when the RPC returns a non-positive / non-finite value (never a bad FT)", async () => {
    for (const bad of [0, -3, NaN, "abc"]) {
      sb.client = { rpc: vi.fn(async () => ({ data: bad, error: null })) };
      await expect(nextInvoiceNumber()).rejects.toThrow(/Numeração de faturas indisponível/);
    }
  });

  it("zero-pads the RPC value the same way as the fallback path", async () => {
    sb.client = { rpc: vi.fn(async () => ({ data: 12345, error: null })) };
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-01T12:00:00Z"));
    // >4 digits grow naturally (no truncation).
    expect(await nextInvoiceNumber()).toBe("FT 2026/12345");
  });
});

describe("isUniqueViolation — the 23505 backstop recogniser", () => {
  it("recognises the Postgres unique-violation SQLSTATE (23505)", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("recognises the textual message forms (case-insensitive)", () => {
    expect(isUniqueViolation({ message: "duplicate key value violates unique constraint" })).toBe(
      true,
    );
    expect(isUniqueViolation({ message: "UNIQUE CONSTRAINT failed" })).toBe(true);
  });

  it("returns false for unrelated errors and non-objects", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation(undefined)).toBe(false);
    expect(isUniqueViolation("23505")).toBe(false); // a bare string is not an error object
    expect(isUniqueViolation(new Error("connection reset"))).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false); // FK violation, not unique
  });
});
