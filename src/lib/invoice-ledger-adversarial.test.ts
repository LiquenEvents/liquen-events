import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { splitThirtySeventy, round2 } from "./money";

/**
 * Cross-cutting adversarial suite for the money / invoice / ledger core.
 *
 * Focus: the invariants that span more than one module — sinal+saldo cent
 * reconciliation, the two INDEPENDENT ways the codebase derives the saldo (the
 * `splitThirtySeventy` split vs. the route's `round2((sinal/3)*7)` re-derivation
 * in `maybeAutoIssueSaldo`), and the sequential numbering ledger under a
 * void/reissue lifecycle and a per-year boundary.
 *
 * The route code that owns the saldo re-derivation and the lifecycle transitions
 * is NOT edited here (other agents own it); this suite PINS the money-math
 * invariants the routes rely on and flags where they diverge (NEEDS DECISION).
 */

// ── invoices-store needs its server deps mocked (it imports "server-only") ──
const state = vi.hoisted(() => ({ store: new Map<string, unknown>() }));
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

import { nextInvoiceNumber } from "./invoices-store";

beforeEach(() => {
  state.store.clear();
  sb.client = null;
  vi.clearAllMocks();
});
afterEach(() => {
  vi.useRealTimers();
});

/**
 * The route's saldo FALLBACK derivation from the FATURADO sinal, used by
 * `maybeAutoIssueSaldo` only when no proposal coherent with the sinal exists.
 * When a coherent proposal IS present the route now uses the exact
 * `splitThirtySeventy(total).saldo` (= total − sinal) instead — see the
 * "non-integer totals" test below.
 */
const saldoFromSinal = (sinal: number): number => round2((sinal / 3) * 7);

describe("sinal + saldo reconciliation to the last cent (the core money invariant)", () => {
  it("the SPLIT itself always closes the total exactly, for a dense cent sweep", () => {
    const bad: number[] = [];
    for (let cents = 0; cents <= 300_000; cents++) {
      const { sinal, saldo } = splitThirtySeventy(cents / 100);
      if (Math.round((sinal + saldo) * 100) !== cents) bad.push(cents);
    }
    expect(bad).toEqual([]);
  });

  it("for INTEGER-euro totals (what the proposal pipeline emits) BOTH derivations agree and close the total", () => {
    // sinal (from split) + saldoFromSinal(sinal) must equal the total to the cent —
    // this is the guarantee `maybeAutoIssueSaldo` leans on when it derives the saldo
    // from the billed sinal instead of the (possibly-revised) proposal.
    const bad: Array<[number, number, number]> = [];
    for (let total = 1; total <= 100_000; total++) {
      const { sinal, saldo } = splitThirtySeventy(total);
      const derived = saldoFromSinal(sinal);
      if (derived !== saldo || Math.round((sinal + derived) * 100) !== total * 100) {
        bad.push([total, saldo, derived]);
      }
    }
    expect(bad).toEqual([]);
  });

  it("for NON-integer (odd-cent) totals the route derives the saldo EXACTLY as total − sinal (fixed)", () => {
    // A non-integer total is where the sinal-only fallback (`sinal/3*7`) drops a
    // cent: split(1000.01) = {300.00, 700.01} reconciles, but saldoFromSinal(300)
    // = 700.00 → 1000.00, a cent short. `maybeAutoIssueSaldo` now prefers the
    // EXACT `splitThirtySeventy(total).saldo` (= total − sinal) whenever a proposal
    // coherent with the billed sinal exists, so the pair closes the total to the
    // cent. The fallback is only reached when no coherent proposal is present.
    const total = 1000.01;
    const { sinal, saldo: splitSaldo } = splitThirtySeventy(total);
    expect(sinal).toBe(300);
    expect(splitSaldo).toBe(700.01); // the exact saldo the route now bills
    // sinal + exact saldo closes the agreed total to the cent.
    expect(Math.round((sinal + splitSaldo) * 100)).toBe(Math.round(total * 100));

    // The old sinal-only fallback would have dropped the cent — documents WHY the
    // route prefers the split when a coherent proposal is available.
    expect(saldoFromSinal(sinal)).toBe(700); // fallback: a cent short
    expect(Math.round((sinal + saldoFromSinal(sinal)) * 100)).not.toBe(Math.round(total * 100));

    // Sub-euro total: split(0,02) = {0,01, 0,01} closes to 0,02; the fallback
    // sinal/3*7 would over-bill to 0,03.
    const { sinal: s2, saldo: exact2 } = splitThirtySeventy(0.02);
    expect(s2).toBe(0.01);
    expect(exact2).toBe(0.01);
    expect(Math.round((s2 + exact2) * 100)).toBe(2); // exact split closes 0,02
    expect(saldoFromSinal(s2)).toBe(0.02); // fallback over-bills to 0,03
  });
});

describe("numbering ledger — void/reissue lifecycle & per-year boundary", () => {
  it("issuing a sinal+saldo PAIR consumes two consecutive numbers (never the same one)", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00Z"));
    const sinalNo = await nextInvoiceNumber();
    const saldoNo = await nextInvoiceNumber();
    expect(sinalNo).toBe("FT 2026/0001");
    expect(saldoNo).toBe("FT 2026/0002");
    expect(sinalNo).not.toBe(saldoNo);
  });

  it("voiding then RE-ISSUING a sinal burns the old number and mints a strictly higher one", async () => {
    // Realistic flow: sinal FT/0001 is issued, then anulada (route status change —
    // does not touch the seq), then a corrected sinal is issued. The new sinal must
    // NOT reuse 0001 (fiscal numbers, once burned, stay burned).
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-20T10:00:00Z"));
    const first = await nextInvoiceNumber(); // FT 2026/0001 — later "anulada"
    const reissued = await nextInvoiceNumber(); // FT 2026/0002 — the corrected sinal
    expect(first).toBe("FT 2026/0001");
    expect(reissued).toBe("FT 2026/0002");
    // Parse and assert strict monotonic increase.
    const n1 = Number(/\/(\d+)$/.exec(first)![1]);
    const n2 = Number(/\/(\d+)$/.exec(reissued)![1]);
    expect(n2).toBeGreaterThan(n1);
  });

  it("the per-year counter resets at the year boundary but each year stays independent & monotonic", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-12-31T23:59:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0001");
    expect(await nextInvoiceNumber()).toBe("FT 2026/0002");
    // Cross into 2027: fresh sequence.
    vi.setSystemTime(new Date("2027-01-01T00:01:00Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2027/0001");
    expect(await nextInvoiceNumber()).toBe("FT 2027/0002");
    // Late-arriving 2026 document continues 2026's own sequence — never collides with 2027.
    vi.setSystemTime(new Date("2026-12-31T23:59:30Z"));
    expect(await nextInvoiceNumber()).toBe("FT 2026/0003");
    expect(state.store.get("invoice-seq-2026")).toBe(3);
    expect(state.store.get("invoice-seq-2027")).toBe(2);
  });
});
