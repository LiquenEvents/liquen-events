import { describe, it, expect } from "vitest";
import { aspectFor, ratioFor, dimsFor } from "./image-meta";

// A real entry from image-dims.json: [2400, 1609].
const KNOWN = "/imagens/20_10_2025_0244.jpg";
const UNKNOWN = "/imagens/__does-not-exist__.jpg";

describe("aspectFor", () => {
  it("returns the real 'w / h' string for a known image", () => {
    expect(aspectFor(KNOWN)).toBe("2400 / 1609");
  });

  it("returns the default 4 / 3 fallback for an unknown image", () => {
    expect(aspectFor(UNKNOWN)).toBe("4 / 3");
  });

  it("honours a custom fallback", () => {
    expect(aspectFor(UNKNOWN, "16 / 9")).toBe("16 / 9");
  });
});

describe("ratioFor", () => {
  it("returns w/h as a number for a known image", () => {
    expect(ratioFor(KNOWN)).toBeCloseTo(2400 / 1609);
  });

  it("returns the fallback ratio for an unknown image", () => {
    expect(ratioFor(UNKNOWN)).toBeCloseTo(4 / 3);
    expect(ratioFor(UNKNOWN, 1)).toBe(1);
  });
});

describe("dimsFor", () => {
  it("returns [width, height] for a known image", () => {
    expect(dimsFor(KNOWN)).toEqual([2400, 1609]);
  });

  it("returns null for an unknown image", () => {
    expect(dimsFor(UNKNOWN)).toBeNull();
  });
});
