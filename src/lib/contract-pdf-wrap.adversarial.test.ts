import { describe, it, expect, beforeAll } from "vitest";
import { PDFDocument, StandardFonts, type PDFFont } from "pdf-lib";
import { wrap } from "./contract-pdf";

// Regression cover for the contract-PDF line wrapper. The bug: `wrap` sanitised
// the whole raw text to WinAnsi BEFORE splitting on "\n" — but winAnsiSafe maps
// "\n" (a control char, cp 0x0A < 0x20) to "?", so the split never saw any
// newline and a multi-line contract body collapsed onto a single line joined by
// stray "?" characters. Fix: split on the raw newlines first, sanitise each
// paragraph after. These tests pin that order.

let font: PDFFont;
beforeAll(async () => {
  const doc = await PDFDocument.create();
  font = await doc.embedFont(StandardFonts.Helvetica);
});

const WIDE = 100_000; // wide enough that width-wrapping never triggers here

describe("contract-pdf wrap()", () => {
  it("respects internal newlines instead of collapsing them to '?'", () => {
    const lines = wrap(font, "Primeira linha\nSegunda linha", 11, WIDE);
    // Two rows, one per paragraph — NOT a single "Primeira linha?Segunda linha".
    expect(lines).toEqual(["Primeira linha", "Segunda linha"]);
    expect(lines.every((l) => !l.includes("?"))).toBe(true);
  });

  it("preserves a blank line as an empty row (paragraph break)", () => {
    expect(wrap(font, "Parágrafo A\n\nParágrafo B", 11, WIDE)).toEqual([
      "Parágrafo A",
      "",
      "Parágrafo B",
    ]);
  });

  it("still sanitises un-encodable chars per paragraph while keeping the split", () => {
    // The emoji is not WinAnsi-encodable → "?"; the newline must still split.
    const lines = wrap(font, "Olá 💐\nAdeus", 11, WIDE);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain("?"); // emoji sanitised
    expect(lines[0]).not.toContain("💐");
    expect(lines[1]).toBe("Adeus"); // second paragraph intact
  });

  it("keeps Portuguese accents intact (Latin-1) across newlines", () => {
    expect(wrap(font, "Ação e coração\nÉvora", 11, WIDE)).toEqual(["Ação e coração", "Évora"]);
  });

  it("still wraps a long single paragraph by width", () => {
    const long = "palavra ".repeat(40).trim();
    const lines = wrap(font, long, 11, 200);
    expect(lines.length).toBeGreaterThan(1);
    expect(lines.every((l) => font.widthOfTextAtSize(l, 11) <= 200)).toBe(true);
  });
});
