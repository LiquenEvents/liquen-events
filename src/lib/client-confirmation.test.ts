import { describe, it, expect } from "vitest";
import { buildClientConfirmation } from "./client-confirmation";

describe("buildClientConfirmation", () => {
  it("builds a Portuguese quote confirmation with the reference", () => {
    const { subject, html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(subject).toContain("LIQ-ABC-1234");
    expect(subject).toMatch(/Recebemos/);
    expect(html).toContain("Olá Ana");
    expect(html).toContain("LIQ-ABC-1234");
    expect(text).toContain("LIQ-ABC-1234");
  });

  it("builds an English contact confirmation (no reference)", () => {
    const { subject, html } = buildClientConfirmation({ locale: "en", name: "John" });
    expect(subject).toBe("We've received your message");
    expect(html).toContain("Hello John");
    expect(html).not.toContain("LIQ-");
  });

  it("escapes HTML in the client-provided name", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: '<img src=x onerror="alert(1)">',
    });
    expect(html).not.toContain('<img src=x onerror="alert(1)">');
    expect(html).toContain("&lt;img");
  });
});
