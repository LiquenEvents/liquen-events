import { describe, expect, it } from "vitest";
import { fitWithin, keepOriginal } from "./image-prep";

/**
 * Pure-logic coverage for the upload image preparation. The canvas/decode path
 * needs a real browser; these pin the sizing math and the skip heuristics that
 * decide whether a photo is re-encoded at all.
 */

describe("fitWithin", () => {
  it("caps the long edge and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ w: 1500, h: 2000 });
  });

  it("never upscales a small image", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ w: 800, h: 600 });
  });

  it("survives degenerate dimensions", () => {
    expect(fitWithin(0, 0, 2000)).toEqual({ w: 1, h: 1 });
    expect(fitWithin(1, 100000, 2000)).toEqual({ w: 1, h: 2000 });
  });
});

describe("keepOriginal", () => {
  it("keeps small already-supported files untouched", () => {
    expect(keepOriginal("image/jpeg", 500_000)).toBe(true);
    expect(keepOriginal("image/png", 1_500_000)).toBe(true);
    expect(keepOriginal("image/webp", 100)).toBe(true);
  });

  it("re-encodes big files even when the format is supported", () => {
    // A telemóvel photo of 6 MB was exactly what blew the host's body limit.
    expect(keepOriginal("image/jpeg", 6_000_000)).toBe(false);
  });

  it("always re-encodes unsupported formats (HEIC from iPhones)", () => {
    expect(keepOriginal("image/heic", 100_000)).toBe(false);
    expect(keepOriginal("image/heif", 100_000)).toBe(false);
    expect(keepOriginal("", 100_000)).toBe(false);
  });

  it("uses a tighter byte gate for mood-board photos than for covers", () => {
    // 1.2 MB supported file: kept as-is for a cover (≤1.5 MB), re-encoded for a
    // board (≤1.0 MB) so a board of many photos stays light.
    expect(keepOriginal("image/jpeg", 1_200_000, "cover")).toBe(true);
    expect(keepOriginal("image/jpeg", 1_200_000, "board")).toBe(false);
  });
});
