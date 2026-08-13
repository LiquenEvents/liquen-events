import { describe, it, expect } from "vitest";
import { longDate, daysUntil, isHighSeason } from "./workdays";

// `d()` builds a local-time date so the assertions are timezone-independent.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 10, 0, 0);

describe("longDate", () => {
  it("formats an ISO date per locale", () => {
    expect(longDate("2027-02-23", "pt")).toBe("23 de fevereiro de 2027");
    expect(longDate("2027-02-23", "en")).toBe("23 February 2027");
  });

  it("returns empty for anything that isn't yyyy-mm-dd", () => {
    expect(longDate("", "pt")).toBe("");
    expect(longDate("23/02/2027", "pt")).toBe("");
  });
});

describe("daysUntil", () => {
  it("counts whole days ahead", () => {
    expect(daysUntil("2026-08-05", d(2026, 8, 1))).toBe(4);
  });

  it("returns null for today, the past and malformed input", () => {
    expect(daysUntil("2026-08-01", d(2026, 8, 1))).toBeNull();
    expect(daysUntil("2026-07-30", d(2026, 8, 1))).toBeNull();
    expect(daysUntil("", d(2026, 8, 1))).toBeNull();
  });
});

describe("isHighSeason", () => {
  it("covers May to October in the Alentejo", () => {
    expect(isHighSeason("2027-05-01")).toBe(true);
    expect(isHighSeason("2027-10-31")).toBe(true);
    expect(isHighSeason("2027-04-30")).toBe(false);
    expect(isHighSeason("2027-11-01")).toBe(false);
    expect(isHighSeason("")).toBe(false);
  });
});
