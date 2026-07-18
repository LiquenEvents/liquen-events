import { describe, it, expect } from "vitest";
import { splitThirtySeventy, eur, eur0, round2 } from "./money";

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
