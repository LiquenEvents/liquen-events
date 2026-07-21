import { describe, it, expect } from "vitest";
import { portalPath } from "./portal-link";
import { createPortalToken } from "./portal-token";

describe("portal-link — portalPath", () => {
  // Low-entropy, obviously-fake placeholder (a realistic JWT-shaped string trips
  // secret scanners like gitleaks). The token's only role here is to be embedded
  // verbatim in the path; a real minted token is exercised separately below.
  const TOKEN = "portal-test-token";

  it("builds the pt path by default", () => {
    expect(portalPath(TOKEN)).toBe(`/pt/portal/${TOKEN}`);
  });

  it("builds the en path when locale is en", () => {
    expect(portalPath(TOKEN, "en")).toBe(`/en/portal/${TOKEN}`);
  });

  it("coerces any unknown/invalid locale to pt", () => {
    expect(portalPath(TOKEN, "fr")).toBe(`/pt/portal/${TOKEN}`);
    expect(portalPath(TOKEN, "en-US")).toBe(`/pt/portal/${TOKEN}`);
    expect(portalPath(TOKEN, "EN")).toBe(`/pt/portal/${TOKEN}`); // case-sensitive coercion
    expect(portalPath(TOKEN, " en ")).toBe(`/pt/portal/${TOKEN}`);
    expect(portalPath(TOKEN, "")).toBe(`/pt/portal/${TOKEN}`);
  });

  it("coerces null / undefined locale to pt", () => {
    expect(portalPath(TOKEN, undefined)).toBe(`/pt/portal/${TOKEN}`);
    // @ts-expect-error — exercise a null passed from loosely-typed callers.
    expect(portalPath(TOKEN, null)).toBe(`/pt/portal/${TOKEN}`);
  });

  it("always yields exactly one leading slash and a /portal/ segment (no double slashes)", () => {
    for (const lang of [undefined, "en", "pt", "xx"]) {
      const path = portalPath(TOKEN, lang);
      expect(path.startsWith("/")).toBe(true);
      expect(path.startsWith("//")).toBe(false);
      expect(path).toContain("/portal/");
      // No accidental doubled slash anywhere in the assembled path.
      expect(path.includes("//")).toBe(false);
      // Exactly the three expected segments.
      expect(path.split("/").filter(Boolean)).toEqual([
        lang === "en" ? "en" : "pt",
        "portal",
        TOKEN,
      ]);
    }
  });

  it("embeds a real, freshly-minted token verbatim as the final segment", () => {
    const token = createPortalToken("LIQ-ABC-123");
    const path = portalPath(token);
    expect(path).toBe(`/pt/portal/${token}`);
    expect(path.endsWith(token)).toBe(true);
    // base64url tokens carry no path-breaking characters.
    expect(token).toMatch(/^[A-Za-z0-9_.\-]+$/);
  });

  it("does not leak or embed any signing secret — only the opaque token", () => {
    const secret = process.env.SESSION_SECRET;
    const token = createPortalToken("LIQ-XYZ-9");
    const path = portalPath(token, "en");
    if (secret) expect(path).not.toContain(secret);
    // The path is purely the locale + fixed segment + token; nothing else.
    expect(path).toBe(`/en/portal/${token}`);
  });

  it("is a relative path (no scheme / host) by design", () => {
    const path = portalPath(TOKEN);
    expect(path).not.toMatch(/^https?:/);
    expect(path).not.toContain("://");
  });

  it("passes an empty token through, producing a trailing-slash path (pinned behavior)", () => {
    expect(portalPath("")).toBe("/pt/portal/");
  });
});
