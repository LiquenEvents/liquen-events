import { describe, it, expect, vi } from "vitest";

// use-public-pathname.ts is a client module that imports next/navigation at the
// top; stub it so the pure helper can be unit-tested in the node env.
vi.mock("next/navigation", () => ({ usePathname: () => "/" }));

const { stripLocalePrefix } = await import("./use-public-pathname");

/**
 * stripLocalePrefix normalizes the internal `/[lang]/…` path to the locale-less
 * public path so server (build-time `/pt/sobre`) and client (`/sobre`) agree —
 * a regression reintroduces hydration mismatches on every marketing page.
 */
describe("stripLocalePrefix", () => {
  it("strips a leading /pt or /en segment", () => {
    expect(stripLocalePrefix("/pt/sobre")).toBe("/sobre");
    expect(stripLocalePrefix("/en/sobre")).toBe("/sobre");
    expect(stripLocalePrefix("/pt/servicos/casamentos")).toBe("/servicos/casamentos");
  });
  it("maps the bare locale root to /", () => {
    expect(stripLocalePrefix("/pt")).toBe("/");
    expect(stripLocalePrefix("/en")).toBe("/");
  });
  it("leaves already locale-less paths untouched", () => {
    expect(stripLocalePrefix("/")).toBe("/");
    expect(stripLocalePrefix("/sobre")).toBe("/sobre");
    expect(stripLocalePrefix("/servicos/casamentos")).toBe("/servicos/casamentos");
  });
  it("does not strip a path that merely starts with the locale letters", () => {
    expect(stripLocalePrefix("/pentagon")).toBe("/pentagon");
    expect(stripLocalePrefix("/enigma")).toBe("/enigma");
  });
});
