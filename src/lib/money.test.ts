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
