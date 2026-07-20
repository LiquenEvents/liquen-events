import { describe, it, expect } from "vitest";
import { splitThirtySeventy, eur, eur0, round2 } from "./money";

describe("round2", () => {
  it("rounds to two decimals (half-up on exact .xx5 representable values)", () => {
    expect(round2(1.234)).toBe(1.23);
    expect(round2(1.235)).toBe(1.24); // 1.235*100 = 123.5 → 124
    expect(round2(2.675)).toBe(2.68); // 2.675*100 = 267.5000…06 → 268
    expect(round2(1.005)).toBe(1); // classic float: 1.005*100 = 100.4999… → 100
    expect(round2(0)).toBe(0);
    expect(round2(100)).toBe(100);
  });

  it("handles negatives and large magnitudes", () => {
    expect(round2(-1.005)).toBe(-1); // -1.005*100 = -100.49… → -100
    expect(round2(-2.5)).toBe(-2.5);
    expect(round2(1_000_000.019)).toBe(1_000_000.02);
  });

  it("is idempotent on already-2dp values", () => {
    for (const n of [0.01, 0.99, 3750.55, 8749.99, 12500]) {
      expect(round2(round2(n))).toBe(round2(n));
    }
  });
});

describe("splitThirtySeventy", () => {
  const cases = [12500, 3000.01, 0, 999.99, 1, 100, 250.55, 7, 1_000_000, 33.33];

  it("sinal + saldo sums back exactly to the total (no floating dust)", () => {
    for (const total of cases) {
      const { sinal, saldo } = splitThirtySeventy(total);
      // Compare in integer cents to assert exact cent-level reconstruction.
      expect(Math.round((sinal + saldo) * 100)).toBe(Math.round(total * 100));
    }
  });

  it("both parts are rounded to whole cents", () => {
    for (const total of cases) {
      const { sinal, saldo } = splitThirtySeventy(total);
      expect(sinal).toBe(round2(sinal));
      expect(saldo).toBe(round2(saldo));
    }
  });

  it("sinal is ~30% of the total", () => {
    for (const total of cases) {
      const { sinal } = splitThirtySeventy(total);
      // Within half a cent of the exact 30% share.
      expect(Math.abs(sinal - total * 0.3)).toBeLessThanOrEqual(0.005);
    }
  });

  it("known exact splits", () => {
    expect(splitThirtySeventy(12500)).toEqual({ sinal: 3750, saldo: 8750 });
    expect(splitThirtySeventy(0)).toEqual({ sinal: 0, saldo: 0 });
    expect(splitThirtySeventy(1)).toEqual({ sinal: 0.3, saldo: 0.7 });
    // Odd cents: sinal rounds, saldo is the remainder so the sum is preserved.
    expect(splitThirtySeventy(999.99)).toEqual({ sinal: 300, saldo: 699.99 });
  });

  it("clamps negative totals to zero (matches original behaviour)", () => {
    expect(splitThirtySeventy(-50)).toEqual({ sinal: 0, saldo: 0 });
  });

  it("handles a huge (clamp-boundary) total without floating drift", () => {
    expect(splitThirtySeventy(100_000_000)).toEqual({ sinal: 30_000_000, saldo: 70_000_000 });
  });

  it("a sub-cent total can round the sinal to 0 (remainder falls entirely to saldo)", () => {
    // Documenta o comportamento nas bordas: 30% de 0,01 arredonda a 0,00.
    expect(splitThirtySeventy(0.01)).toEqual({ sinal: 0, saldo: 0.01 });
  });

  it("for INTEGER-euro totals, saldo == round2(sinal/3*7) — the auto-saldo derivation reconciles exactly", () => {
    // O auto-saldo (maybeAutoIssueSaldo) deriva o saldo do sinal faturado via
    // sinal/3*7 em vez do split. Para totais em euros inteiros (o que o pipeline
    // de propostas produz, Math.round), essa derivação coincide ao cêntimo com o
    // saldo do split — logo sinal+saldo fecham sempre o total acordado.
    for (let total = 1; total <= 3000; total += 7) {
      const { sinal, saldo } = splitThirtySeventy(total);
      expect(Math.round((sinal / 3) * 7 * 100) / 100).toBe(saldo);
      expect(Math.round((sinal + saldo) * 100)).toBe(total * 100);
    }
  });
});

describe("round2 — rounding mode is half-up on the FLOATING product (not decimal half-up / not bankers')", () => {
  it("an EXACTLY-representable .xx5 half rounds UP (half-up, not half-even)", () => {
    // 0.125 is exactly representable; 0.125*100 === 12.5 exactly → Math.round → 13.
    // Bankers' (half-even) rounding would give 0.12 — this pins that money.ts is half-up.
    expect(round2(0.125)).toBe(0.13);
    expect(round2(2.5)).toBe(2.5); // already 2dp, unchanged
  });

  it("negative halves round toward +Infinity (Math.round), so |round2| is NOT symmetric", () => {
    // -0.125*100 === -12.5 → Math.round(-12.5) === -12 → -0.12, while +0.125 → +0.13.
    // Invoices are non-negative so this never bites in practice; pinned as documentation.
    expect(round2(-0.125)).toBe(-0.12);
    expect(round2(0.125)).toBe(0.13);
  });

  it("a .xx5 that is NOT exactly representable can round DOWN (float, not decimal, half-up)", () => {
    // 0.145*100 === 14.499999999999998 (< 14.5) → 14 → 0.14, even though decimal
    // half-up would say 0.15. This is inherent to float *100 rounding.
    expect(round2(0.145)).toBe(0.14);
  });

  it("propagates non-finite inputs (NaN/Infinity) unguarded — unlike eur()", () => {
    // NEEDS DECISION: eur()/eur0() coerce falsy/NaN→0, but round2/splitThirtySeventy
    // do not. No reachable caller feeds non-finite (routes clamp via num()), so this
    // is pinned as current behaviour, not asserted-desirable.
    expect(Number.isNaN(round2(NaN))).toBe(true);
    expect(round2(Infinity)).toBe(Infinity);
  });
});

describe("splitThirtySeventy — adversarial reconciliation (integer cents, ruthless)", () => {
  it("sinal + saldo reconciles to the LAST CENT for EVERY cent-aligned total in a dense sweep", () => {
    // 0,00 .. 5.000,00 € in 1-cent steps: the split must always reconstruct the total
    // exactly (no floating dust, no off-by-one cent). Aggregate then assert once so
    // the 500k-iteration sweep isn't drowned in per-iteration expect() overhead.
    const bad: Array<[number, number, number]> = [];
    for (let cents = 0; cents <= 500_000; cents++) {
      const total = cents / 100;
      const { sinal, saldo } = splitThirtySeventy(total);
      if (
        Math.round((sinal + saldo) * 100) !== cents ||
        sinal !== round2(sinal) ||
        saldo !== round2(saldo) ||
        sinal < 0 ||
        saldo < 0
      ) {
        bad.push([total, sinal, saldo]);
      }
    }
    expect(bad).toEqual([]);
  });

  it("reconciles at and around the route's 100.000.000 € cap (huge magnitudes, no drift)", () => {
    for (const total of [
      99_999_999.99, 100_000_000, 100_000_000.01, 88_888_888.88, 66_666_666.67, 33_333_333.33,
    ]) {
      const { sinal, saldo } = splitThirtySeventy(total);
      expect(Math.round((sinal + saldo) * 100)).toBe(Math.round(total * 100));
    }
    expect(splitThirtySeventy(100_000_000)).toEqual({ sinal: 30_000_000, saldo: 70_000_000 });
  });

  it("odd-cent totals push the residue entirely into saldo (sinal never over-collects)", () => {
    // sinal is half-up 30%; saldo is the remainder, so sinal is never MORE than the
    // 30% share by more than half a cent and the client is never over-charged the sinal.
    for (let cents = 0; cents <= 20_000; cents++) {
      const total = cents / 100;
      const { sinal } = splitThirtySeventy(total);
      expect(sinal - total * 0.3).toBeLessThanOrEqual(0.005 + 1e-9);
    }
  });

  it("non-finite totals: NaN→{NaN,NaN}, Infinity→{Infinity,NaN} (pinned; no reachable caller)", () => {
    const nan = splitThirtySeventy(NaN);
    expect(Number.isNaN(nan.sinal)).toBe(true);
    expect(Number.isNaN(nan.saldo)).toBe(true);
    const inf = splitThirtySeventy(Infinity);
    expect(inf.sinal).toBe(Infinity);
    expect(Number.isNaN(inf.saldo)).toBe(true);
  });
});

describe("eur / eur0 formatters", () => {
  // Intl uses a narrow no-break space (U+202F/U+00A0) before the € symbol;
  // normalise whitespace so the assertions aren't brittle.
  const norm = (s: string) => s.replace(/\s/g, " ");

  // Grouping separator is optional: some (small-ICU) Node builds omit it.
  it("eur formats with two decimals (pt-PT)", () => {
    expect(norm(eur(1234.5))).toMatch(/^1\.?234,50\s€$/);
    expect(norm(eur(0))).toMatch(/^0,00\s€$/);
  });

  it("eur0 formats with no decimals (pt-PT)", () => {
    expect(norm(eur0(1234.5))).toMatch(/^1\.?235\s€$/);
    expect(norm(eur0(3000))).toMatch(/^3\.?000\s€$/);
  });

  it("both coerce falsy/NaN to 0", () => {
    expect(norm(eur(NaN))).toMatch(/^0,00\s€$/);
    expect(norm(eur0(NaN))).toMatch(/^0\s€$/);
  });
});
