import { describe, it, expect } from "vitest";
import {
  DEFAULT_TERMS,
  TERMS_VERSION,
  termsToPlainText,
  type TermsSection,
} from "./contract-terms";

describe("contract-terms — DEFAULT_TERMS invariants", () => {
  it("ships a non-trivial, complete set of sections", () => {
    expect(Array.isArray(DEFAULT_TERMS)).toBe(true);
    expect(DEFAULT_TERMS.length).toBe(9);
  });

  it("has no empty or whitespace-only heading or body", () => {
    for (const s of DEFAULT_TERMS) {
      expect(s.heading.trim().length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
      // No accidental leading/trailing whitespace baked into the text.
      expect(s.heading).toBe(s.heading.trim());
      expect(s.body).toBe(s.body.trim());
    }
  });

  it("numbers headings 1..9 in stable ascending order", () => {
    const numbers = DEFAULT_TERMS.map((s) => {
      const m = s.heading.match(/^(\d+)\./);
      expect(m, `heading "${s.heading}" must start with "<n>."`).not.toBeNull();
      return Number(m![1]);
    });
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("has unique headings and unique bodies (no copy/paste dup)", () => {
    expect(new Set(DEFAULT_TERMS.map((s) => s.heading)).size).toBe(DEFAULT_TERMS.length);
    expect(new Set(DEFAULT_TERMS.map((s) => s.body)).size).toBe(DEFAULT_TERMS.length);
  });

  it("keeps every body free of the section separator so the plain-text snapshot round-trips unambiguously", () => {
    // termsToPlainText joins sections with a blank line ("\n\n"); if a body
    // contained one, splitting a stored snapshot back into sections would drift.
    for (const s of DEFAULT_TERMS) {
      expect(s.body).not.toContain("\n\n");
      expect(s.heading).not.toContain("\n");
    }
  });

  it("uses a stable, dated TERMS_VERSION", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });
});

describe("contract-terms — termsToPlainText", () => {
  it("defaults to DEFAULT_TERMS and includes every heading and body", () => {
    const text = termsToPlainText();
    for (const s of DEFAULT_TERMS) {
      expect(text).toContain(s.heading);
      expect(text).toContain(s.body);
    }
  });

  it("separates sections with exactly one blank line and joins heading/body with a newline", () => {
    const text = termsToPlainText();
    const blocks = text.split("\n\n");
    expect(blocks.length).toBe(DEFAULT_TERMS.length);
    blocks.forEach((block, i) => {
      const [heading, ...bodyLines] = block.split("\n");
      expect(heading).toBe(DEFAULT_TERMS[i].heading);
      expect(bodyLines.join("\n")).toBe(DEFAULT_TERMS[i].body);
    });
  });

  it("does not add a trailing blank line or leading whitespace", () => {
    const text = termsToPlainText();
    expect(text).toBe(text.trim());
    expect(text.endsWith("\n")).toBe(false);
  });

  it("returns an empty string for an empty section list", () => {
    expect(termsToPlainText([])).toBe("");
  });

  it("serializes a single custom section without a trailing separator", () => {
    const one: TermsSection[] = [{ heading: "H", body: "B" }];
    expect(termsToPlainText(one)).toBe("H\nB");
  });

  it("preserves order and content for arbitrary custom sections", () => {
    const custom: TermsSection[] = [
      { heading: "A", body: "alpha" },
      { heading: "B", body: "beta" },
      { heading: "C", body: "gamma" },
    ];
    expect(termsToPlainText(custom)).toBe("A\nalpha\n\nB\nbeta\n\nC\ngamma");
  });

  it("passes empty heading/body straight through (no interpolation, no throw)", () => {
    expect(termsToPlainText([{ heading: "", body: "" }])).toBe("\n");
  });
});
