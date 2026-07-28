import { describe, it, expect } from "vitest";
import { buildClientConfirmation } from "./client-confirmation";

describe("buildClientConfirmation", () => {
  it("builds a Portuguese quote confirmation with the reference in the body", () => {
    const { subject, html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    // The reference is deliberately NOT in the subject: it's ~28 chars and ate
    // the whole line on a phone. It lives in the preheader and the body.
    expect(subject).not.toContain("LIQ-ABC-1234");
    expect(subject).toMatch(/Recebemos/);
    expect(html).toContain("Olá Ana");
    expect(html).toContain("LIQ-ABC-1234");
    expect(text).toContain("LIQ-ABC-1234");
  });

  it("promises a WINDOW, never a named day", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(html).toContain("48 horas úteis");
    // A calendar date is a promise the team can miss in high season for
    // reasons the client can't see; the window is the one they always keep.
    expect(html).not.toMatch(/segunda-feira|terça-feira|quarta-feira|quinta-feira|sexta-feira/);
    expect(text).toContain("48 horas úteis");
  });

  it("mirrors the event back in prose and in the recap", () => {
    const { html, text } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: {
        typeLabel: "Casamento",
        date: "2027-02-23",
        guests: 120,
        location: "Évora",
        plural: true,
      },
    });
    expect(html).toContain("para o casamento");
    expect(html).toContain("23 de fevereiro de 2027");
    expect(html).toContain("cerca de 120");
    expect(html).toContain("Évora");
    // Plural register for a couple.
    expect(html).toContain("vosso pedido");
    expect(text).toContain("Casamento");
  });

  it("uses the singular register for non-couple events", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Jantar de Gala", plural: false },
    });
    expect(html).toContain("o seu pedido");
    expect(html).not.toContain("vosso pedido");
  });

  it("handles an open date with the Alentejo seasons note", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
      event: { typeLabel: "Casamento", date: "", plural: true },
    });
    expect(html).toContain("ainda a definir");
    expect(html).toContain("fins de semana");
  });

  it("builds an English contact confirmation (no reference, no steps)", () => {
    const { subject, html } = buildClientConfirmation({
      locale: "en",
      name: "John",
    });
    expect(subject).toMatch(/received your message/);
    expect(html).toContain("Hello John");
    expect(html).not.toContain("LIQ-");
    // The 3-step ladder would be a lie with no proposal coming.
    expect(html).not.toContain("What happens next");
  });

  it("greets by first name only, and copes with an empty name", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "  Ana   Maria  Silva ",
    });
    expect(html).toContain("Olá Ana,");

    const bare = buildClientConfirmation({ locale: "pt", name: "   " });
    expect(bare.html).toContain("Olá,");
    expect(bare.html).not.toContain("Olá ,");
  });

  it("strips bidi overrides that would reverse the rendering", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana‮",
    });
    expect(html).not.toContain("‮");
  });

  it("is a complete document with a preheader and dark-mode support", () => {
    const { html } = buildClientConfirmation({
      locale: "pt",
      name: "Ana",
      referenceId: "LIQ-ABC-1234",
    });
    expect(html).toMatch(/^<!doctype html>/i);
    expect(html).toContain('lang="pt-PT"');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain("prefers-color-scheme: dark");
    expect(html).toContain("mso-hide:all"); // hidden preheader
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
