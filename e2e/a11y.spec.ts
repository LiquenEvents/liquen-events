import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

/**
 * Real, in-browser accessibility audit of the public pages with axe-core.
 *
 * Build gate: ZERO critical violations and ZERO serious ones EXCEPT
 * `color-contrast`. The structural a11y (ARIA, labels, roles, focus order) must
 * stay perfect — any new structural regression fails the build — while the
 * remaining colour-contrast hits are the brand's deliberately faint editorial
 * micro-text (a documented design trade-off, tracked but not build-blocking).
 */
const PAGES = ["/", "/sobre", "/servicos", "/galeria", "/contacto", "/clientes"];

test.describe("Acessibilidade (axe) — páginas públicas", () => {
  for (const path of PAGES) {
    test(`${path} — zero violações estruturais (WCAG 2 A/AA)`, async ({ page }) => {
      await page.goto(path);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      const structural = violations
        .filter(
          (v) => v.impact === "critical" || (v.impact === "serious" && v.id !== "color-contrast"),
        )
        .map((v) => ({ id: v.id, impact: v.impact, nodes: v.nodes.length }));

      expect(structural).toEqual([]);
    });
  }
});
