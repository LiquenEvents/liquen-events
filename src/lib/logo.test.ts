import { describe, it, expect } from "vitest";
import { logoDimsFor, logoHeight } from "./logo";

const WIDE = "/logos/clientes/aernnova.avif"; // [304, 36] — thin wordmark
const TALL = "/logos/clientes/convento-espinheiro.avif"; // [316, 378] — upright mark
const UNKNOWN = "/logos/clientes/__missing__.avif";

describe("logoDimsFor", () => {
  it("returns the real dimensions for a known logo", () => {
    expect(logoDimsFor(WIDE)).toEqual([304, 36]);
  });

  it("returns a sensible default for an unknown logo", () => {
    expect(logoDimsFor(UNKNOWN)).toEqual([400, 120]);
  });
});

describe("logoHeight", () => {
  it("clamps a very wide logo down to the minimum height", () => {
    expect(logoHeight(WIDE)).toBe(26);
  });

  it("gives an upright logo a taller height, never above the max", () => {
    const h = logoHeight(TALL);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThanOrEqual(46);
  });

  it("uses sqrt(targetArea) when dimensions are unknown", () => {
    expect(logoHeight(UNKNOWN)).toBe(40); // round(sqrt(1600))
  });

  it("honours custom min/max bounds", () => {
    expect(logoHeight(WIDE, 1600, 30, 50)).toBe(30);
  });
});
