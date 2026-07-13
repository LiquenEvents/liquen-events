import { describe, it, expect } from "vitest";
import { normalizeLocale, htmlLang, localizeHref } from "./config";

/**
 * The i18n helpers govern locale resolution and cross-locale URL building for
 * every page and link — a regression here silently breaks the English mirror or
 * the canonical PT routing. They are pure, so they get exhaustive unit coverage.
 */
describe("normalizeLocale", () => {
  it("returns 'en' only for exactly 'en'", () => {
    expect(normalizeLocale("en")).toBe("en");
  });
  it("defaults anything else to 'pt' (incl. undefined/null/garbage/case)", () => {
    for (const v of ["pt", "", "EN", "En", "fr", "e n", undefined, null]) {
      expect(normalizeLocale(v)).toBe("pt");
    }
  });
});

describe("htmlLang", () => {
  it("maps locales to BCP-47 tags", () => {
    expect(htmlLang("en")).toBe("en");
    expect(htmlLang("pt")).toBe("pt-PT");
  });
});

describe("localizeHref", () => {
  it("leaves every href unchanged for the PT (canonical) locale", () => {
    expect(localizeHref("/", "pt")).toBe("/");
    expect(localizeHref("/sobre", "pt")).toBe("/sobre");
    expect(localizeHref("/en/sobre", "pt")).toBe("/en/sobre");
  });
  it("prefixes internal hrefs with /en on the English mirror", () => {
    expect(localizeHref("/", "en")).toBe("/en");
    expect(localizeHref("/sobre", "en")).toBe("/en/sobre");
    expect(localizeHref("/servicos/casamentos", "en")).toBe("/en/servicos/casamentos");
  });
  it("does not double-prefix an already-localized href", () => {
    expect(localizeHref("/en", "en")).toBe("/en");
    expect(localizeHref("/en/sobre", "en")).toBe("/en/sobre");
  });
  it("does not mistake a path merely starting with 'en' for a locale prefix", () => {
    expect(localizeHref("/enigma", "en")).toBe("/en/enigma");
    expect(localizeHref("/enderecos", "en")).toBe("/en/enderecos");
  });
  it("passes through external / non-path hrefs untouched", () => {
    for (const h of ["https://example.com", "mailto:a@b.com", "tel:+351919", "#anchor"]) {
      expect(localizeHref(h, "en")).toBe(h);
    }
  });
});
