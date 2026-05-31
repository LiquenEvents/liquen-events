import { describe, it, expect } from "vitest";
import { calculatePrice, isWeekend, isHighSeason, formatPrice } from "./pricing";
import type { QuoteFormData } from "./types";

/**
 * The quote engine produces the numbers we send to clients, so it is tested
 * exhaustively. Base reference used across cases:
 *   conferencias → basePrice 2800, pricePerPax 16, minGuests 50
 *   packages     → essencial 1.0, completo 1.45, premium 2.1
 *   IVA          → 23%
 */
function form(over: Partial<QuoteFormData> = {}): Partial<QuoteFormData> {
  return {
    category: "empresas",
    eventType: "conferencias",
    guests: 100,
    packageTier: "essencial",
    locationType: "lisboa",
    urgency: "standard",
    addons: [],
    ...over,
  };
}

describe("date helpers", () => {
  it("treats Friday and Saturday as weekend (not Sunday)", () => {
    expect(isWeekend("2026-01-02")).toBe(true); // Friday
    expect(isWeekend("2026-01-03")).toBe(true); // Saturday
    expect(isWeekend("2026-01-04")).toBe(false); // Sunday
    expect(isWeekend("2026-01-05")).toBe(false); // Monday
  });

  it("flags summer months and December as high season", () => {
    expect(isHighSeason("2026-07-15")).toBe(true); // July
    expect(isHighSeason("2026-12-10")).toBe(true); // December
    expect(isHighSeason("2026-03-15")).toBe(false); // March
  });

  it("handles empty date defensively", () => {
    expect(isWeekend("")).toBe(false);
    expect(isHighSeason("")).toBe(false);
  });
});

describe("calculatePrice — guards", () => {
  it("returns an empty estimate when category/type are missing", () => {
    const r = calculatePrice({ category: null, eventType: null });
    expect(r.total).toBe(0);
    expect(r.subtotal).toBe(0);
    expect(r.isEstimate).toBe(true);
  });

  it("returns empty when the event type is unknown for the category", () => {
    const r = calculatePrice({ category: "empresas", eventType: "casamentos" });
    expect(r.total).toBe(0);
  });
});

describe("calculatePrice — core maths", () => {
  it("computes base + per-guest + 23% IVA", () => {
    const r = calculatePrice(form());
    // (2800 + 16*100) * 1.0 = 4400; IVA 23% → total 5412
    expect(r.basePrice).toBe(2800);
    expect(r.guestCost).toBe(1600);
    expect(r.subtotal).toBe(4400);
    expect(r.iva).toBe(1012);
    expect(r.total).toBe(5412);
  });

  it("clamps guests to the event minimum", () => {
    const r = calculatePrice(form({ guests: 10 })); // min 50
    // (2800 + 16*50) = 3600 → total round(3600*1.23) = 4428
    expect(r.guestCost).toBe(800);
    expect(r.total).toBe(4428);
  });

  it.each([
    ["essencial", 5412],
    ["completo", 7847],
    ["premium", 11365],
  ] as const)("applies the %s package multiplier", (tier, total) => {
    expect(calculatePrice(form({ packageTier: tier })).total).toBe(total);
  });
});

describe("calculatePrice — surcharges", () => {
  it("adds a location surcharge (internacional = 50%)", () => {
    const r = calculatePrice(form({ locationType: "internacional" }));
    expect(r.locationSurcharge).toBe(2200); // 4400 * 0.5
  });

  it("adds 15% on weekends and 10% in high season", () => {
    const weekend = calculatePrice(form({ date: "2026-07-04", guests: 100 }));
    // 2026-07-04 is a Saturday in July → both surcharges apply
    expect(weekend.weekendSurcharge).toBe(660); // 4400 * 0.15
    expect(weekend.seasonSurcharge).toBe(440); // 4400 * 0.10
  });

  it.each([
    ["standard", 0],
    ["rush", 880],
    ["urgente", 1760],
  ] as const)("applies %s urgency surcharge", (urgency, expected) => {
    expect(calculatePrice(form({ urgency })).urgencySurcharge).toBe(expected);
  });
});

describe("calculatePrice — add-ons", () => {
  it("prices per-pax add-ons by guest count", () => {
    const r = calculatePrice(
      form({ addons: [{ id: "a", name: "x", tier: "essencial", price: 10, quantity: 1, pricingType: "per_pax" }] })
    );
    expect(r.addonsCost).toBe(1000); // 10 * 100 guests
  });

  it("prices fixed add-ons by quantity only", () => {
    const r = calculatePrice(
      form({ addons: [{ id: "a", name: "x", tier: "essencial", price: 500, quantity: 2, pricingType: "fixed" }] })
    );
    expect(r.addonsCost).toBe(1000); // 500 * 2
  });
});

describe("calculatePrice — estimate range", () => {
  it("uses a wide ±20% band when key fields are missing", () => {
    const r = calculatePrice(form({ date: "" })); // no date → estimate
    expect(r.isEstimate).toBe(true);
    expect(r.rangeMin).toBe(Math.round(r.total * 0.8));
    expect(r.rangeMax).toBe(Math.round(r.total * 1.2));
  });

  it("narrows to ±8% once date, location and guests are set", () => {
    const r = calculatePrice(form({ date: "2026-03-04" }));
    expect(r.isEstimate).toBe(false);
    expect(r.rangeMin).toBe(Math.round(r.total * 0.92));
    expect(r.rangeMax).toBe(Math.round(r.total * 1.08));
  });
});

describe("formatPrice", () => {
  it("formats euros in pt-PT with no decimals", () => {
    expect(formatPrice(5412)).toMatch(/5\s?412/);
    expect(formatPrice(5412)).toMatch(/€/);
  });
});
