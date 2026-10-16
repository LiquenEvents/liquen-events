import { test, expect, type Page } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NO TELEMÓVEL, O «EN» RECEBE O TOQUE — E NÃO O LOGÓTIPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela (16/10): «quando carrego no inglês, aquilo está tão próximo do logótipo
 * que não dá para carregar, vai carregar para o logótipo». O logótipo é
 * `absolute` e o PNG tem margens transparentes largas: a caixa do link ficava
 * por cima do «EN». MEDIDO antes da correcção, no topo da página, a 360, 375
 * e 390 px: 0 de 25 pontos do «EN» chegavam ao botão.
 *
 * Aqui toca-se uma grelha de 5×5 pontos dentro de cada botão (PT, EN e o
 * menu) e confirma-se que TODOS lhes chegam — no topo e depois de descer.
 */

async function pontosQueChegam(page: Page) {
  return page.evaluate(() => {
    const grupo = document.querySelector('[role="group"]:has(button[aria-pressed])');
    const menu = document.querySelector("nav button[aria-expanded]");
    const botoes = [...(grupo?.querySelectorAll("button") ?? []), ...(menu ? [menu] : [])];
    return botoes.map((b) => {
      const q = b.getBoundingClientRect();
      let certos = 0;
      for (let fx = 0.1; fx <= 0.91; fx += 0.2)
        for (let fy = 0.1; fy <= 0.91; fy += 0.2) {
          const el = document.elementFromPoint(q.left + q.width * fx, q.top + q.height * fy);
          if (el && (el === b || b.contains(el))) certos++;
        }
      return { nome: b.textContent?.trim() || "menu", certos, visivel: q.width > 0 };
    });
  });
}

for (const largura of [360, 390]) {
  test.describe(`a ${largura} px`, () => {
    test.use({
      viewport: { width: largura, height: 800 },
      isMobile: true,
      hasTouch: true,
      contextOptions: { reducedMotion: "reduce" },
    });

    test("PT, EN e o menu recebem todos os toques, no topo e depois de descer", async ({
      page,
    }) => {
      await page.goto("/");
      // O primeiro selector é o do telemóvel (o do computador está escondido).
      await expect(page.locator('[role="group"]:has(button[aria-pressed])').first()).toBeVisible();
      const topo = await pontosQueChegam(page);
      expect(topo.map((r) => r.nome)).toEqual(["PT", "EN", "menu"]);
      for (const r of topo) expect(r.certos, `${r.nome} no topo`).toBe(25);
      await page.evaluate(() => scrollTo(0, 900));
      await page.waitForTimeout(700);
      for (const r of await pontosQueChegam(page)) expect(r.certos, `${r.nome} descido`).toBe(25);
    });
  });
}
