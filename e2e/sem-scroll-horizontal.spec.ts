import { test, expect, type Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DE SERVIÇO NÃO ROLAM PARA O LADO (auditoria externa, C1)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Em computador, as quatro páginas de serviço tinham scroll horizontal —
 * MEDIDO antes da correcção: 38 px a 1440, 34 a 1280, 27 a 1024. A causa era
 * o mosaico de fotografias: a entrada `zoom` do `Reveal` começa cada mosaico
 * ampliado, e os da borda passavam o ecrã. A imagem do topo (`hero-settle`)
 * também começa ampliada, mas o pai já a cortava.
 *
 * Mede-se duas vezes: ao abrir (os mosaicos ainda à espera, ampliados) e com o
 * mosaico no ecrã (a entrada a decorrer). Os dois momentos tinham a folga.
 */

const SERVICOS = [
  "casamentos",
  "eventos-corporativos",
  "festas-e-aniversarios",
  "batizados-e-comunhoes",
];
const LARGURAS = [1440, 1280, 1024, 390];

async function folga(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

for (const largura of LARGURAS) {
  for (const slug of SERVICOS) {
    test(`/servicos/${slug} a ${largura} px não tem scroll horizontal`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      const res = await page.goto(`/servicos/${slug}`);
      expect(res?.status()).toBe(200);

      expect(await folga(page), "ao abrir").toBeLessThanOrEqual(0);

      // Leva o mosaico ao ecrã e mede a meio da entrada.
      const mosaico = page.locator("section .grid.gap-px").first();
      await mosaico.scrollIntoViewIfNeeded();
      await page.waitForTimeout(150);
      expect(await folga(page), "com o mosaico a entrar").toBeLessThanOrEqual(0);
    });
  }
}
