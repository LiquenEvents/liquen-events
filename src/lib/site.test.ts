import { describe, it, expect } from "vitest";
import { SITE, AREAS_SERVED, abs } from "./site";

describe("abs", () => {
  it("joins the canonical origin with a path", () => {
    expect(abs("/servicos")).toBe(`${SITE.url}/servicos`);
  });

  it("returns the bare origin when given no path", () => {
    expect(abs()).toBe(SITE.url);
  });
});

describe("SITE identity invariants", () => {
  it("uses an absolute https canonical URL with no trailing slash", () => {
    expect(SITE.url).toMatch(/^https:\/\//);
    expect(SITE.url.endsWith("/")).toBe(false);
  });

  it("keeps the founding year and contact details consistent", () => {
    expect(SITE.founded).toBe("2018");
    expect(SITE.email).toContain("@");
    expect(SITE.locale).toBe("pt_PT");
  });

  it("declares a national service area, not a single home region", () => {
    // The site-wide service area is the country, not a home region: a
    // region-first list here is what made every page read as "Évora vendor".
    expect(AREAS_SERVED[0]).toBe("Portugal");
    expect(AREAS_SERVED).not.toContain("Alentejo");
    expect(AREAS_SERVED).not.toContain("Évora");
  });
});
