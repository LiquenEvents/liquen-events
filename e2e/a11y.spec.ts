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
/**
 * O ramo de anúncios (`/casamentos/[polo]`, `/casamentos/destination`,
 * `/casamentos/estilo/[estilo]`) ficava de fora desta lista: 17 páginas por
 * língua, todas atrás de tráfego PAGO, e nenhuma nunca tinha sido visitada
 * por este teste nem pelo `lighthouserc*.json` (a mesma meia dúzia de rotas
 * do menu principal). Foi ali, numa grelha de portefólio real com `alt=""`
 * em fotografias que não são decorativas, que a auditoria de acessibilidade
 * encontrou um defeito genuíno que este ficheiro nunca tinha tido hipótese de
 * apanhar. Uma rota de cada tipo chega para o gate estrutural (axe não
 * distingue decorativo de conteúdo, por isso não apanharia o `alt=""` em si
 * — ver `casamentos/portefolio-alt.test.tsx` para essa verificação — mas
 * cobre o resto: ARIA, rótulos, ordem de foco).
 */
const PAGES = [
  "/",
  "/sobre",
  "/servicos",
  "/galeria",
  "/contacto",
  "/clientes",
  "/casamentos/alentejo",
  "/casamentos/destination",
  "/casamentos/estilo/minimalista",
];

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
