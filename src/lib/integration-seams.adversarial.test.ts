import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { promises as fsp, rmSync } from "node:fs";
import type { Quote, PriceBreakdown } from "@/lib/orcamento/types";

/**
 * CROSS-MODULE SEAM — integration test (real store, temp FileBackend).
 *
 * Different scenario from api/lifecycle-integration.test.ts (which drives the
 * quote→proposal→accept→sinal→pay→auto-saldo→revert money chain). Here we hunt
 * the SEAM around a *manually-accepted* deal (a `quote.status === "aceite"`
 * reserved offline, with NO proposal/contract) whose event `date` carries a full
 * ISO datetime component — the "datetime class" that already bit deriveStage,
 * the stepper and the ICS builder.
 *
 * The invariant under test spans two INDEPENDENT modules that must agree about
 * the same persisted quote:
 *   • dossier.deriveStage / countdownDays  — slices `date` to its yyyy-mm-dd part
 *     and correctly reports the deal as being in its event-week ("semana_evento").
 *   • followups.computeFollowUps (Rule 4)  — the reminder pipeline that should
 *     raise the matching "semana_evento" follow-up for the team.
 *
 * If the Dossier shows the event is THIS WEEK but the reminder pipeline silently
 * emits nothing for it, the two seams disagree — a real bug the module unit tests
 * miss because they only ever feed clean yyyy-mm-dd dates.
 *
 * Isolation follows api/lifecycle-integration.test.ts: mock ONLY the storage
 * plumbing (real Repository + real FileBackend rooted at a throwaway temp dir),
 * never a domain store. Clock + timezone are pinned so day boundaries are
 * deterministic.
 */

const TMP = vi.hoisted(() => {
  const base = (process.env.TMPDIR || "/tmp").replace(/\/+$/, "");
  return {
    dir: `${base}/liquen-seams-${process.pid}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
  };
});

vi.mock("@/lib/repository", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/repository")>();
  return {
    ...actual,
    createRepository: <T>(mapper: import("@/lib/repository").Mapper<T>) =>
      new actual.Repository<T>(mapper, () => new actual.FileBackend<T>(mapper, TMP.dir)),
  };
});

// ── Real modules under test (store is real; pure derivers are real) ──
import { createQuote, getQuote } from "@/lib/quotes-store";
import { deriveStage, countdownDays } from "@/lib/orcamento/dossier";
import { computeFollowUps } from "@/lib/followups";

// Pinned "now": 2026-07-21 mid-morning UTC. In July, Lisbon is UTC+1 (WEST), so
// the UTC calendar day and the Lisbon calendar day coincide here — the reminder
// pipeline (UTC-anchored, per the cron day-window fix) and the Dossier agree on
// which day "today" is.
const NOW_ISO = "2026-07-21T09:00:00.000Z";
const NOW_MS = Date.parse(NOW_ISO);

// Minimal but valid PriceBreakdown (fields required by the Quote type).
const breakdown = (total: number): PriceBreakdown => ({
  basePrice: total,
  guestCost: 0,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: total,
  iva: 0,
  total,
  rangeMin: total,
  rangeMax: total,
  isEstimate: false,
});

/** A manually-won deal: status "aceite", no proposal/contract, a given event date. */
function acceptedQuote(id: string, date: string): Quote {
  return {
    id,
    submittedAt: "2026-06-01T10:00:00.000Z",
    status: "aceite",
    // QuoteFormData fields
    category: "particulares",
    eventType: "casamentos",
    eventName: "Reserva offline",
    date,
    endDate: "",
    location: "Lisboa",
    locationType: "lisboa",
    guests: 60,
    duration: 1,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    name: "Cliente Reserva",
    email: "reserva@example.com",
    phone: "+351 912 000 000",
    company: "",
    nif: "",
    acceptTerms: true,
    acceptMarketing: false,
    priceBreakdown: breakdown(12000),
    quotedPrice: 12000,
  };
}

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-only-not-a-secret"; // gitleaks:allow — test placeholder
  await fsp.rm(TMP.dir, { recursive: true, force: true });
  vi.useRealTimers();
  vi.setSystemTime(new Date(NOW_ISO));
});

afterAll(() => {
  vi.useRealTimers();
  rmSync(TMP.dir, { recursive: true, force: true });
});

describe("manual-accept seam: Dossier stage ↔ follow-up reminder pipeline", () => {
  it("a datetime-dated accepted deal in its event-week is flagged by BOTH deriveStage and computeFollowUps", async () => {
    // Event 4 days out, stored WITH a time component (the manual/import route
    // does not forbid a full ISO datetime — see dossier.ts).
    const eventDate = "2026-07-25T18:00:00";
    const id = "LIQ-SEAM-DATETIME";
    await createQuote(acceptedQuote(id, eventDate));

    const q = await getQuote(id);
    expect(q).not.toBeNull();

    const now = new Date(NOW_MS);

    // Dossier side: the event is this week.
    expect(countdownDays(q!.date, now)).toBe(4);
    expect(deriveStage({ quote: q!, proposal: null, contract: null, invoices: [] }, now)).toBe(
      "semana_evento",
    );

    // Reminder side: the SAME quote must raise a "semana_evento" follow-up.
    // Before the fix, Rule 4's parseDay() choked on the datetime string
    // (NaN → the `until <= 7` gate is false) and silently emitted nothing,
    // contradicting the Dossier.
    const followUps = computeFollowUps({ quotes: [q!], proposals: [], now: NOW_MS });
    const evt = followUps.find((f) => f.kind === "semana_evento" && f.quoteId === id);
    expect(evt).toBeDefined();
    // The two modules agree on the number of days until the event.
    expect(evt!.duenessDays).toBe(4);
  });

  it("regression: a plain yyyy-mm-dd accepted deal in its event-week is flagged identically (both formats agree)", async () => {
    const id = "LIQ-SEAM-DATEONLY";
    await createQuote(acceptedQuote(id, "2026-07-25"));

    const q = await getQuote(id);
    const now = new Date(NOW_MS);

    expect(deriveStage({ quote: q!, proposal: null, contract: null, invoices: [] }, now)).toBe(
      "semana_evento",
    );

    const followUps = computeFollowUps({ quotes: [q!], proposals: [], now: NOW_MS });
    const evt = followUps.find((f) => f.kind === "semana_evento" && f.quoteId === id);
    expect(evt).toBeDefined();
    expect(evt!.duenessDays).toBe(4);
  });
});
