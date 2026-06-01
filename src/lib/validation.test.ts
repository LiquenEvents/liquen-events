import { describe, it, expect } from "vitest";
import { contactSchema, quoteFormSchema, pushSubscriptionSchema, firstError } from "./validation";

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
