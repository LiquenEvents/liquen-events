import { describe, it, expect } from "vitest";
import { calculatePrice } from "./pricing";
import type { QuoteFormData } from "./types";

/**
 * Adversarial money-math coverage for the quote engine.
 *
 * The breakdown we show a client MUST add up: the subtotal and IVA lines we
 * print are the ones the client checks by hand, so `subtotal + iva` has to
 * equal `total` to the cent for every reachable input. Rounding each of the
 * three independently from the unrounded subtotal breaks that invariant.
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

describe("calculatePrice — subtotal/IVA/total must reconcile", () => {
  it("keeps subtotal + iva === total for an awkward fractional subtotal", () => {
    // 51 guests + urgente(+40%) → unrounded subtotal 5062.40, which rounds
    // the three lines in opposite directions.
    const r = calculatePrice(form({ guests: 51, urgency: "urgente" }));
    expect(r.subtotal + r.iva).toBe(r.total);
  });

  it("reconciles across a sweep of surcharge combinations", () => {
    const locations = [
      "lisboa",
      "porto",
      "grande_cidade",
      "pequena_cidade",
      "internacional",
    ] as const;
    const urgencies = ["standard", "rush", "urgente"] as const;
    for (const locationType of locations) {
      for (const urgency of urgencies) {
        for (let guests = 50; guests <= 70; guests++) {
          for (const date of ["", "2026-07-04", "2026-03-04"]) {
            const r = calculatePrice(form({ locationType, urgency, guests, date }));
            expect(r.subtotal + r.iva).toBe(r.total);
          }
        }
      }
    }
  });
});
