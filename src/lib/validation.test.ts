import { describe, it, expect } from "vitest";
import {
  contactSchema,
  quoteFormSchema,
  quotePayloadSchema,
  quoteUpdateSchema,
  priceBreakdownSchema,
  pushSubscriptionSchema,
  firstError,
} from "./validation";

describe("priceBreakdownSchema / quotePayloadSchema", () => {
  const breakdown = {
    basePrice: 1000,
    guestCost: 500,
    packageMultiplier: 1.2,
    locationSurcharge: 0,
    weekendSurcharge: 100,
    seasonSurcharge: 0,
    urgencySurcharge: 0,
    addonsCost: 250,
    subtotal: 1850,
    iva: 425.5,
    total: 2275.5,
    rangeMin: 2000,
    rangeMax: 2500,
    isEstimate: true,
  };

  it("accepts a well-formed breakdown", () => {
    expect(priceBreakdownSchema.safeParse(breakdown).success).toBe(true);
  });

  it("rejects a poisoned breakdown (non-numeric total)", () => {
    expect(priceBreakdownSchema.safeParse({ ...breakdown, total: "9999" }).success).toBe(false);
  });

  it("rejects absurd values (Infinity / out of bounds)", () => {
    expect(priceBreakdownSchema.safeParse({ ...breakdown, subtotal: Infinity }).success).toBe(
      false,
    );
    expect(priceBreakdownSchema.safeParse({ ...breakdown, total: 99_000_000 }).success).toBe(false);
  });

  it("quotePayloadSchema works without a breakdown (simplified form)", () => {
    const r = quotePayloadSchema.safeParse({ form: { name: "Ana", email: "a@x.pt" } });
    expect(r.success).toBe(true);
  });
});

describe("quoteUpdateSchema — admin PATCH values", () => {
  it("accepts a typical partial update", () => {
    const r = quoteUpdateSchema.safeParse({
      status: "cotado",
      quotedPrice: 12500,
      tags: ["VIP"],
      archived: false,
    });
    expect(r.success).toBe(true);
  });

  it("rejects an invalid status", () => {
    expect(quoteUpdateSchema.safeParse({ status: "inventado" }).success).toBe(false);
  });

  it("rejects a non-numeric price", () => {
    expect(quoteUpdateSchema.safeParse({ quotedPrice: "12500" }).success).toBe(false);
  });

  it("accepts null to clear a clearable field", () => {
    expect(quoteUpdateSchema.safeParse({ quotedPrice: null, followUpAt: null }).success).toBe(true);
  });

  it("rejects malformed payments (bad kind, missing amount)", () => {
    const bad = quoteUpdateSchema.safeParse({
      payments: [{ id: "p1", kind: "gorjeta", date: "2026-08-01", paid: true }],
    });
    expect(bad.success).toBe(false);
    const good = quoteUpdateSchema.safeParse({
      payments: [{ id: "p1", kind: "sinal", amount: 500, date: "2026-08-01", paid: true }],
    });
    expect(good.success).toBe(true);
  });

  it("rejects a malformed guest list entry", () => {
    const r = quoteUpdateSchema.safeParse({
      guestList: [{ id: "g1", name: "Rui", party: 0, rsvp: "confirmado" }],
    });
    expect(r.success).toBe(false);
  });
});

describe("contactSchema", () => {
  it("accepts a valid contact and trims/defaults optionals", () => {
    const r = contactSchema.safeParse({
      nome: "  Maria  ",
      email: "maria@example.com",
      mensagem: "Olá, gostaria de um orçamento.",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nome).toBe("Maria");
      expect(r.data.telefone).toBe("");
      expect(r.data.eventType).toBe("");
    }
  });

  it("rejects a short name", () => {
    const r = contactSchema.safeParse({ nome: "A", email: "a@b.pt", mensagem: "oi" });
    expect(r.success).toBe(false);
  });

  it("rejects an invalid email", () => {
    const r = contactSchema.safeParse({ nome: "Maria", email: "not-an-email", mensagem: "oi" });
    expect(r.success).toBe(false);
  });

  it("rejects an empty message", () => {
    const r = contactSchema.safeParse({ nome: "Maria", email: "a@b.pt", mensagem: "" });
    expect(r.success).toBe(false);
  });

  it("preserves unknown fields (passthrough)", () => {
    const r = contactSchema.safeParse({
      nome: "Maria",
      email: "a@b.pt",
      mensagem: "oi",
      orcamento: "5.000–15.000 €",
    });
    expect(r.success).toBe(true);
    if (r.success) expect((r.data as Record<string, unknown>).orcamento).toBe("5.000–15.000 €");
  });
});

describe("quoteFormSchema", () => {
  it("coerces guests and defaults optionals", () => {
    const r = quoteFormSchema.safeParse({ name: "João", email: "j@x.pt", guests: "120" });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.guests).toBe(120);
      expect(r.data.notes).toBe("");
    }
  });

  it("rejects guests above the sane ceiling", () => {
    const r = quoteFormSchema.safeParse({ name: "João", email: "j@x.pt", guests: 999999 });
    expect(r.success).toBe(false);
  });
});

describe("pushSubscriptionSchema", () => {
  it("accepts a well-formed https subscription", () => {
    const r = pushSubscriptionSchema.safeParse({
      endpoint: "https://push.example.com/abc",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(r.success).toBe(true);
  });

  it("rejects a non-https endpoint", () => {
    const r = pushSubscriptionSchema.safeParse({
      endpoint: "http://push.example.com/abc",
      keys: { p256dh: "key", auth: "auth" },
    });
    expect(r.success).toBe(false);
  });
});

describe("firstError", () => {
  it("returns the first issue message", () => {
    const r = contactSchema.safeParse({ nome: "A", email: "x", mensagem: "" });
    if (!r.success) expect(typeof firstError(r.error)).toBe("string");
  });
});
