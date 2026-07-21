import { describe, it, expect } from "vitest";
import { deriveRequestLifecycle } from "./LifecycleStepper";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ADVERSARIAL cobertura de `deriveRequestLifecycle` (stepper do back office),
 * comparada com a sua irmã `deriveStage` do Dossier.
 *
 * Foco: paridade das fases ancoradas na data. `deriveStage` normaliza sempre a
 * porção da DATA (`quote.date.slice(0, 10)`) antes de ancorar ao fim do dia,
 * porque a rota manual/importação não proíbe um `quote.date` com componente
 * horária (ISO completo). O stepper concatenava `${quote.date}T23:59:59` sem
 * essa normalização, produzindo `NaN` e deixando um evento JÁ PASSADO preso uma
 * fase atrás — apesar de `countdownDays` (linha seguinte) já tratar ambos os
 * formatos. Resultado: contradição com `deriveStage` e com a própria doc do
 * componente ("data já passada → todas as fases concluídas").
 *
 * Todos os testes injectam um `today` fixo — nunca dependem do relógio real.
 */

const TODAY = new Date("2026-07-18T09:00:00Z");

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "q1",
    submittedAt: "2026-01-01T10:00:00Z",
    status: "pendente",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Evento teste",
    date: "2026-09-12",
    endDate: "",
    location: "Lisboa",
    locationType: "lisboa",
    guests: 80,
    duration: 6,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    name: "Ana Cliente",
    email: "ana@example.com",
    phone: "912345678",
    company: "",
    nif: "",
    acceptTerms: true,
    acceptMarketing: false,
    priceBreakdown: {
      basePrice: 0,
      guestCost: 0,
      packageMultiplier: 1,
      locationSurcharge: 0,
      weekendSurcharge: 0,
      seasonSurcharge: 0,
      urgencySurcharge: 0,
      addonsCost: 0,
      subtotal: 10000,
      iva: 2300,
      total: 12300,
      rangeMin: 12000,
      rangeMax: 13000,
      isEstimate: false,
    },
    ...over,
  };
}

describe("deriveRequestLifecycle — date-anchored parity with deriveStage", () => {
  it("plain yyyy-mm-dd past event is recognised as passed (baseline)", () => {
    const q = makeQuote({ status: "aceite", date: "2026-07-01" });
    expect(deriveRequestLifecycle(q, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: true,
    });
  });

  it("full-ISO datetime past event is ALSO recognised as passed (regression)", () => {
    // Same event, same day, but `quote.date` carries a time component — allowed
    // by the manual/import route. `deriveStage` slices to the date part and
    // reports the event as passed; the stepper must not diverge by leaving a
    // long-past event stuck at an earlier phase.
    const q = makeQuote({ status: "aceite", date: "2026-07-01T15:00:00" });
    expect(deriveRequestLifecycle(q, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: true,
    });
  });

  it("full-ISO datetime event within the week reaches the evento phase (atual)", () => {
    // countdownDays already handles the datetime; guard the fix keeps the
    // not-yet-passed 'semana do evento' case (atual, not allDone) intact.
    const q = makeQuote({ status: "aceite", date: "2026-07-22T18:00:00" });
    expect(deriveRequestLifecycle(q, TODAY)).toEqual({
      perdido: false,
      currentIndex: 4,
      allDone: false,
    });
  });

  it("malformed date never marks the event passed nor crashes (safe)", () => {
    const q = makeQuote({ status: "aceite", date: "not-a-date" });
    expect(deriveRequestLifecycle(q, TODAY)).toEqual({
      perdido: false,
      currentIndex: 2,
      allDone: false,
    });
  });
});
