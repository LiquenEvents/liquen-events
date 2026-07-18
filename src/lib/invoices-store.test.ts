import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ── nextInvoiceNumber — the file/dev FALLBACK path ──
// getSupabase → null forces the app-state read-increment-write branch (the
// Supabase RPC path needs a real DB and is intentionally NOT tested here).
// app-state is mocked with an in-memory Map so the counter is deterministic and
// never touches the real data/ file.
const state = vi.hoisted(() => ({ store: new Map<string, unknown>() }));

vi.mock("./supabase", () => ({
  getSupabase: () => null,
  isDatabaseConfigured: () => false,
}));
vi.mock("./app-state", () => ({
  getState: vi.fn(async (key: string) => (state.store.has(key) ? state.store.get(key) : null)),
  setState: vi.fn(async (key: string, value: unknown) => {
    state.store.set(key, value);
  }),
}));
vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { nextInvoiceNumber } from "./invoices-store";

beforeEach(() => {
  state.store.clear();
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
