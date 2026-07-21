import type { QuoteFormData, PriceBreakdown } from "./types";
import { EVENT_TYPES_BY_CATEGORY, PACKAGES, LOCATION_SURCHARGES } from "./data";

export function isWeekend(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00");
  return d.getDay() === 5 || d.getDay() === 6;
}

export function isHighSeason(dateStr: string): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr + "T12:00:00");
  const m = d.getMonth();
  return (m >= 5 && m <= 8) || m === 11;
}

export function formatPrice(n: number): string {
  return new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function calculatePrice(form: Partial<QuoteFormData>): PriceBreakdown {
  const empty: PriceBreakdown = {
    basePrice: 0,
    guestCost: 0,
    packageMultiplier: 1,
    locationSurcharge: 0,
    weekendSurcharge: 0,
    seasonSurcharge: 0,
    urgencySurcharge: 0,
    addonsCost: 0,
    subtotal: 0,
    iva: 0,
    total: 0,
    rangeMin: 0,
    rangeMax: 0,
    isEstimate: true,
  };

  if (!form.category || !form.eventType) return empty;

  const categoryTypes = EVENT_TYPES_BY_CATEGORY[form.category];
  const et = categoryTypes?.find((e) => e.id === form.eventType);
  if (!et) return empty;

  const guests = Math.max(form.guests ?? et.minGuests, et.minGuests);
  const basePrice = et.basePrice;
  const guestCost = et.pricePerPax * guests;

  let packageMultiplier = 1.0;
  if (form.packageTier && form.packageTier !== "personalizado") {
    const pkg = PACKAGES.find((p) => p.id === form.packageTier);
    packageMultiplier = pkg?.multiplier ?? 1.0;
  }

  const packaged = (basePrice + guestCost) * packageMultiplier;

  const locRate = LOCATION_SURCHARGES[form.locationType ?? "lisboa"];
  const locationSurcharge = packaged * locRate;

  const weekend = form.date ? isWeekend(form.date) : false;
  const weekendSurcharge = weekend ? packaged * 0.15 : 0;

  const highSeason = form.date ? isHighSeason(form.date) : false;
  const seasonSurcharge = highSeason ? packaged * 0.1 : 0;

  let urgencyRate = 0;
  if (form.urgency === "rush") urgencyRate = 0.2;
  if (form.urgency === "urgente") urgencyRate = 0.4;
  const urgencySurcharge = packaged * urgencyRate;

  let addonsCost = 0;
  for (const addon of form.addons ?? []) {
    const qty = addon.quantity ?? 1;
    if (addon.pricingType === "per_pax") {
      addonsCost += addon.price * guests * qty;
    } else {
      addonsCost += addon.price * qty;
    }
  }

  const subtotal =
    packaged +
    locationSurcharge +
    weekendSurcharge +
    seasonSurcharge +
    urgencySurcharge +
    addonsCost;
  const iva = subtotal * 0.23;

  // Round the subtotal and IVA lines independently, then derive the total from
  // those rounded lines so the breakdown we show the client always adds up
  // (subtotal + iva === total). Rounding `subtotal * 1.23` on its own drifts a
  // cent away from the printed lines for awkward fractional subtotals.
  const roundedSubtotal = Math.round(subtotal);
  const roundedIva = Math.round(iva);
  const total = roundedSubtotal + roundedIva;

  const isEstimate = !form.date || !form.locationType || !form.guests;
  const variance = isEstimate ? 0.2 : 0.08;

  return {
    basePrice,
    guestCost,
    packageMultiplier,
    locationSurcharge: Math.round(locationSurcharge),
    weekendSurcharge: Math.round(weekendSurcharge),
    seasonSurcharge: Math.round(seasonSurcharge),
    urgencySurcharge: Math.round(urgencySurcharge),
    addonsCost: Math.round(addonsCost),
    subtotal: roundedSubtotal,
    iva: roundedIva,
    total,
    rangeMin: Math.round(total * (1 - variance)),
    rangeMax: Math.round(total * (1 + variance)),
    isEstimate,
  };
}
