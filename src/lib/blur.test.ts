import { describe, it, expect } from "vitest";
import { blurFor } from "./blur";

// The neutral placeholder returned for any image missing from blur-map.json.
const FALLBACK =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vOdgAA=";
const KNOWN = "/imagens/20_10_2025_0044.jpg";

describe("blurFor", () => {
  it("always returns a next/image-ready blur placeholder shape", () => {
    const r = blurFor(KNOWN);
    expect(r.placeholder).toBe("blur");
    expect(typeof r.blurDataURL).toBe("string");
  });

  it("returns the generated data URL for a known image", () => {
    const r = blurFor(KNOWN);
    expect(r.blurDataURL.startsWith("data:image/webp;base64,")).toBe(true);
    expect(r.blurDataURL).not.toBe(FALLBACK);
    expect(r.blurDataURL.length).toBeGreaterThan(100);
  });

  it("falls back to the neutral placeholder for an unknown image", () => {
    expect(blurFor("/imagens/__missing__.jpg").blurDataURL).toBe(FALLBACK);
  });
});
