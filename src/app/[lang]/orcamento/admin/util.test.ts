import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { randomId, eur, eur2, eventCountdown } from "./util";

/**
 * Adversarial coverage for the admin shared-helper module `util.ts`.
 *
 * These helpers back many admin screens, so we hammer boundaries, malformed
 * input, locale/timezone edges and rounding rather than happy paths.
 *
 * pt-PT currency strings separate the amount from "€" with a non-breaking
 * space (U+00A0). Normalise all whitespace before comparing so the assertions
 * stay readable and robust across ICU builds.
 */
const norm = (s: string): string => s.replace(/\s/g, " ");

describe("randomId", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns a base36 string of at most 8 chars", () => {
    for (let i = 0; i < 200; i++) {
      const id = randomId();
      expect(typeof id).toBe("string");
      expect(id.length).toBeLessThanOrEqual(8);
      // only base36 alphabet (digits + lowercase letters), never uppercase/punctuation
      expect(id).toMatch(/^[0-9a-z]*$/);
    }
  });

  it("is deterministic for a fixed Math.random and slices chars [2,10)", () => {
    // 0.5 -> "0.i" in base36; slice(2,10) drops "0." leaving "i".
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    expect(randomId()).toBe((0.5).toString(36).slice(2, 10));
  });

  it("produces different ids when the RNG advances", () => {
    const seq = [0.111111, 0.999999];
    let i = 0;
    vi.spyOn(Math, "random").mockImplementation(() => seq[i++]);
    expect(randomId()).not.toBe(randomId());
  });

  it("PINNED (edge): Math.random() === 0 yields an EMPTY id", () => {
    // (0).toString(36) === "0"; slice(2,10) === "". Astronomically rare
    // (p ~ 2^-53) but documents that randomId can collide on "". See NEEDS
    // DECISION — not changed here to avoid altering the id algorithm.
    vi.spyOn(Math, "random").mockReturnValue(0);
    expect(randomId()).toBe("");
  });

  it("can return fewer than 8 chars when the fraction is short", () => {
    // 0.25 -> "0.9" in base36 -> slice(2,10) -> "9" (single char).
    vi.spyOn(Math, "random").mockReturnValue(0.25);
    const id = randomId();
    expect(id.length).toBeLessThan(8);
    expect(id).toBe("9");
  });
});

describe("eur (0-decimal formatter, re-exported from money.eur0)", () => {
  it("formats whole euros with no decimal part", () => {
    expect(norm(eur(50))).toBe("50 €");
    expect(norm(eur(0))).toBe("0 €");
  });

  it("rounds to the nearest whole euro (half rounds up)", () => {
    expect(norm(eur(1.5))).toBe("2 €");
    expect(norm(eur(1.4))).toBe("1 €");
    expect(norm(eur(0.4))).toBe("0 €");
  });

  it("coerces falsy/NaN/undefined amounts to 0 (via `n || 0`)", () => {
    expect(norm(eur(NaN))).toBe("0 €");
    expect(norm(eur(undefined as unknown as number))).toBe("0 €");
    expect(norm(eur(null as unknown as number))).toBe("0 €");
    expect(norm(eur(0))).toBe("0 €");
  });

  it("keeps the sign for negative amounts", () => {
    expect(norm(eur(-50))).toContain("-50");
    expect(norm(eur(-50))).toContain("€");
  });

  it("handles huge magnitudes without throwing", () => {
    const out = norm(eur(1_000_000_000));
    expect(out).toContain("€");
    // no decimal comma in the 0-decimal formatter
    expect(out).not.toContain(",");
  });

  it("NOTE: `n || 0` maps -0 and even a legitimate 0 the same — and would also swallow a real 0 total (documented, intended by money.ts)", () => {
    expect(norm(eur(-0))).toBe("0 €");
  });
});

describe("eur2 (2-decimal formatter, re-exported from money.eur)", () => {
  it("always shows two decimal places with a comma separator", () => {
    expect(norm(eur2(50))).toBe("50,00 €");
    expect(norm(eur2(1.5))).toBe("1,50 €");
    expect(norm(eur2(0))).toBe("0,00 €");
  });

  it("coerces NaN/undefined/null to 0,00", () => {
    expect(norm(eur2(NaN))).toBe("0,00 €");
    expect(norm(eur2(undefined as unknown as number))).toBe("0,00 €");
    expect(norm(eur2(null as unknown as number))).toBe("0,00 €");
  });

  it("keeps the sign for negatives and stays 2dp", () => {
    expect(norm(eur2(-50))).toBe("-50,00 €");
  });

  it("differs from the 0-decimal `eur` for the same amount (guards the eur/eur2 alias swap)", () => {
    // util re-maps money.eur0 -> `eur` and money.eur -> `eur2`; this pins the
    // swap so a future re-export edit that flips them is caught.
    expect(norm(eur(1.5))).toBe("2 €"); // 0 decimals
    expect(norm(eur2(1.5))).toBe("1,50 €"); // 2 decimals
    expect(eur(1.5)).not.toBe(eur2(1.5));
  });
});

describe("eventCountdown", () => {
  // Pin the clock so `new Date()` / toISOString() are deterministic. Env TZ may
  // vary, but the helper compares LOCAL-noon to LOCAL-noon and Math.round()s
  // whole days, so day counts are stable regardless of DST/offset.
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-20T09:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // helper: date N days from the pinned "today" (2026-07-20)
  const dayOffset = (n: number): string => {
    const d = new Date("2026-07-20T12:00:00.000Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };

  it("returns null when no date is given", () => {
    expect(eventCountdown()).toBeNull();
    expect(eventCountdown(undefined)).toBeNull();
    expect(eventCountdown("")).toBeNull();
  });

  it("labels the event day itself as Hoje/today", () => {
    expect(eventCountdown("2026-07-20")).toEqual({ label: "Hoje", tone: "today" });
  });

  it("labels tomorrow as Amanhã/soon", () => {
    expect(eventCountdown(dayOffset(1))).toEqual({ label: "Amanhã", tone: "soon" });
  });

  it("uses 'faltam N dias'/soon for 2..7 days out", () => {
    expect(eventCountdown(dayOffset(2))).toEqual({ label: "faltam 2 dias", tone: "soon" });
    expect(eventCountdown(dayOffset(7))).toEqual({ label: "faltam 7 dias", tone: "soon" });
  });

  it("switches soon -> future at the 8-day boundary (still 'dias')", () => {
    expect(eventCountdown(dayOffset(8))).toEqual({ label: "faltam 8 dias", tone: "future" });
    expect(eventCountdown(dayOffset(30))).toEqual({ label: "faltam 30 dias", tone: "future" });
  });

  it("switches 'dias' -> 'semanas' after 30 days, always plural (never 'semana')", () => {
    // 31 days -> round(31/7) = 4 weeks (min in this branch is 4, so never singular)
    expect(eventCountdown(dayOffset(31))).toEqual({ label: "faltam 4 semanas", tone: "future" });
    expect(eventCountdown(dayOffset(90))).toEqual({ label: "faltam 13 semanas", tone: "future" });
  });

  it("switches 'semanas' -> 'meses' after 90 days, always plural (never 'mês')", () => {
    // 91 days -> round(91/30) = 3 months (min in this branch is 3)
    expect(eventCountdown(dayOffset(91))).toEqual({ label: "faltam 3 meses", tone: "future" });
    expect(eventCountdown(dayOffset(365))).toEqual({ label: "faltam 12 meses", tone: "future" });
  });

  it("handles very-far-future dates", () => {
    const r = eventCountdown(dayOffset(1000));
    expect(r?.tone).toBe("future");
    expect(r?.label).toMatch(/^faltam \d+ meses$/);
  });

  it("uses singular 'dia' for exactly one day past", () => {
    expect(eventCountdown(dayOffset(-1))).toEqual({ label: "há 1 dia", tone: "past" });
  });

  it("uses plural 'dias' for multiple days past", () => {
    expect(eventCountdown(dayOffset(-2))).toEqual({ label: "há 2 dias", tone: "past" });
    expect(eventCountdown(dayOffset(-400))).toEqual({ label: "há 400 dias", tone: "past" });
  });

  it("counts whole days regardless of the time component in 'today' (noon anchoring)", () => {
    // Move the clock late in the UTC day; the event is still 'tomorrow'.
    vi.setSystemTime(new Date("2026-07-20T23:30:00.000Z"));
    expect(eventCountdown("2026-07-21")).toEqual({ label: "Amanhã", tone: "soon" });
  });

  it("BUG-GUARD: malformed date strings return null (not 'faltam NaN meses')", () => {
    expect(eventCountdown("nao-e-data")).toBeNull();
    expect(eventCountdown("2026-13-99")).toBeNull();
    expect(eventCountdown("garbage")).toBeNull();
  });

  it("BUG-GUARD: a full ISO datetime (has its own time part) is rejected as null, not NaN", () => {
    // `date + "T12:00:00"` -> "...T15:30:00ZT12:00:00" -> Invalid Date -> NaN.
    expect(eventCountdown("2026-08-20T15:30:00Z")).toBeNull();
  });
});

describe("module boundary (client-safe)", () => {
  const src = readFileSync(new URL("./util.ts", import.meta.url), "utf8");

  it("does not import any server-only *-store module", () => {
    expect(src).not.toMatch(/from\s+["'][^"']*-store["']/);
    expect(src).not.toMatch(/["']server-only["']/);
  });

  it("sources euro formatting from the single money helper", () => {
    expect(src).toMatch(/from\s+["']@\/lib\/money["']/);
  });
});
