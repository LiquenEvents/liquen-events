import { describe, it, expect } from "vitest";
import { isWorkday, replyByOn, replyByDate, longDate, daysUntil, isHighSeason } from "./workdays";

// Local-time dates throughout: isWorkday/replyByOn read getDay()/getDate(), so
// constructing with `new Date(y, m, d)` keeps the assertions independent of the
// runner's timezone.
const d = (y: number, m: number, day: number) => new Date(y, m - 1, day, 10, 0, 0);

describe("isWorkday", () => {
  it("rejects Saturday and Sunday", () => {
    expect(isWorkday(d(2026, 8, 1))).toBe(false); // Saturday
    expect(isWorkday(d(2026, 8, 2))).toBe(false); // Sunday
    expect(isWorkday(d(2026, 7, 31))).toBe(true); // Friday
  });

  it("rejects fixed Portuguese national holidays", () => {
    expect(isWorkday(d(2026, 4, 25))).toBe(false); // Liberdade, a Saturday in 2026
    expect(isWorkday(d(2026, 6, 10))).toBe(false); // Dia de Portugal, a Wednesday
    expect(isWorkday(d(2026, 12, 25))).toBe(false);
  });
});

describe("replyByOn", () => {
  it("counts two working days, skipping the weekend", () => {
    // Thursday → Friday (1) → Monday (2).
    expect(replyByOn(d(2026, 7, 30)).getDate()).toBe(3);
    expect(replyByOn(d(2026, 7, 30)).getMonth()).toBe(7); // August
  });

  it("skips a national holiday that falls mid-week", () => {
    // Monday 8 June → Tuesday (1) → Wed 10 June is Dia de Portugal → Thursday (2).
    const on = replyByOn(d(2026, 6, 8));
    expect(on.getDate()).toBe(11);
  });

  it("never returns the starting day itself", () => {
    const from = d(2026, 7, 29);
    expect(replyByOn(from).getTime()).toBeGreaterThan(from.getTime());
  });
});

describe("replyByDate", () => {
  it("writes out the weekday in the visitor's language", () => {
    expect(replyByDate(d(2026, 7, 30), "pt")).toContain("segunda-feira");
    expect(replyByDate(d(2026, 7, 30), "en")).toContain("Monday");
  });
});

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
