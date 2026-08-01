import { describe, it, expect, vi, afterEach } from "vitest";
import { buildEventIcs } from "./export";
import { eventCountdown } from "./util";
import type { Quote } from "@/lib/orcamento/types";

/**
 * Adversarial coverage for the calendar/agenda date surface:
 *  - `buildEventIcs` (.ics export) fed free-form / malformed dates and
 *    timezone-sensitive DTEND arithmetic.
 *  - `eventCountdown` "faltam X dias" label around the local midnight boundary.
 *
 * The `date`/`endDate` quote fields are only length-trimmed by the validation
 * schema (`trimmed(20)`), never format-checked, so anything from "a definir" to
 * a full ISO timestamp can reach these helpers.
 *
 * Timezone is pinned per-test via `process.env.TZ` (Node re-reads it lazily, so
 * a Date created afterwards uses the new zone) and always restored, so the file
 * is deterministic regardless of the machine's own zone.
 */

const NOW = new Date("2026-06-10T10:00:00.000Z");
const q = (over: Partial<Quote> = {}): Quote =>
  ({ id: "LIQ-1", name: "Cliente", date: "2026-09-12", ...over }) as unknown as Quote;

describe("buildEventIcs — free-form / malformed dates must not crash the export", () => {
  it("returns null (never throws a RangeError) for a free-form date string", () => {
    expect(() => buildEventIcs(q({ date: "a definir" }), NOW)).not.toThrow();
    expect(buildEventIcs(q({ date: "a definir" }), NOW)).toBeNull();
  });

  it("returns null for a full ISO timestamp instead of a malformed VALUE=DATE", () => {
    expect(() => buildEventIcs(q({ date: "2026-09-12T10:00:00Z" }), NOW)).not.toThrow();
    expect(buildEventIcs(q({ date: "2026-09-12T10:00:00Z" }), NOW)).toBeNull();
  });

  it("ignores a garbage endDate (lexically after the start) instead of crashing", () => {
    let ics: string | null = null;
    expect(() => {
      ics = buildEventIcs(q({ endDate: "zzz" }), NOW);
    }).not.toThrow();
    expect(ics).toContain("DTSTART;VALUE=DATE:20260912");
    // Falls back to a single-day event: DTEND = start + 1 (exclusive).
    expect(ics).toContain("DTEND;VALUE=DATE:20260913");
  });
});

describe("buildEventIcs — DTEND arithmetic is calendar-correct and timezone-independent", () => {
  it("rolls a month boundary (Jan 31 → DTEND Feb 1)", () => {
    expect(buildEventIcs(q({ date: "2026-01-31" }), NOW)).toContain("DTEND;VALUE=DATE:20260201");
  });

  it("rolls a year boundary (Dec 31 → DTEND Jan 1 next year)", () => {
    expect(buildEventIcs(q({ date: "2026-12-31" }), NOW)).toContain("DTEND;VALUE=DATE:20270101");
  });

  it("keeps DTEND = start + 1 day even in a far-east zone (UTC+14)", () => {
    // A local-noon parse of the day would land on the previous UTC date here and
    // drop a day off DTEND; UTC arithmetic must keep it at 20260913.
    process.env.TZ = "Pacific/Kiritimati";
    try {
      expect(buildEventIcs(q({ date: "2026-09-12" }), NOW)).toContain("DTEND;VALUE=DATE:20260913");
    } finally {
      delete process.env.TZ;
    }
  });
});

describe("eventCountdown — 'today' tracks the LOCAL calendar day, not UTC", () => {
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TZ;
  });

  it("east of UTC (UTC+9): an event on the local date reads Hoje, not Amanhã", () => {
    process.env.TZ = "Asia/Tokyo";
    vi.useFakeTimers();
    // UTC 20:00 on the 20th → 05:00 on the 21st in Tokyo.
    vi.setSystemTime(new Date("2026-07-20T20:00:00.000Z"));
    expect(eventCountdown("2026-07-21")).toEqual({ label: "Hoje", tone: "today" });
    expect(eventCountdown("2026-07-20")).toEqual({ label: "há 1 dia", tone: "past" });
    expect(eventCountdown("2026-07-22")).toEqual({ label: "Amanhã", tone: "soon" });
  });

  it("west of UTC (UTC-10): the local date still reads Hoje", () => {
    process.env.TZ = "Pacific/Honolulu";
    vi.useFakeTimers();
    // UTC 05:00 on the 21st → 19:00 on the 20th in Honolulu.
    vi.setSystemTime(new Date("2026-07-21T05:00:00.000Z"));
    expect(eventCountdown("2026-07-20")).toEqual({ label: "Hoje", tone: "today" });
    expect(eventCountdown("2026-07-21")).toEqual({ label: "Amanhã", tone: "soon" });
  });
});
