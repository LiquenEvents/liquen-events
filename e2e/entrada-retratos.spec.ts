import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";

/**
 * RETRATOS DA PÁGINA DE ENTRADA — para o antes e o depois se poderem ver.
 *
 * Instrumento, não teste: fotografa nas três medidas que a missão pede
 * (1440, 1920 e 393).
 *
 * O CONTRASTE não se mede aqui. Mede-se com `node scripts/medir-entrada-admin.mjs`,
 * que já existe para isso e faz a única conta honesta: esconde as letras,
 * percorre os píxeis do fundo POR BAIXO delas e fica com o mais claro — o pior
 * caso, não a média. Uma segunda medição aqui seria uma segunda verdade.
 *
 *   MEDICAO_ETIQUETA=depois npx playwright test --config playwright.medicao.config.ts \
 *     --grep @retratos
 */

const MEDIDAS = [
  { nome: "desktop-1440", width: 1440, height: 900 },
  { nome: "desktop-1920", width: 1920, height: 1080 },
  { nome: "telemovel-393", width: 393, height: 852 },
];

const PASTA = "e2e/retratos";

test("@retratos a entrada, nas três medidas", async ({ page }) => {
  test.setTimeout(180_000);
  const etiqueta = (process.env.MEDICAO_ETIQUETA ?? "depois").replace(/[^a-zA-Z0-9_-]/g, "");
  await mkdir(PASTA, { recursive: true });

  for (const m of MEDIDAS) {
    await page.setViewportSize({ width: m.width, height: m.height });
    await page.goto("/orcamento/admin");
    await expect(page.getByRole("button", { name: /Entrar com palavra-passe/i })).toBeVisible({
      timeout: 20_000,
    });
    // A fotografia é o elemento de LCP: esperar que esteja mesmo pintada, senão
    // o retrato apanha o desfocado de 16 px.
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(600);
    await page.screenshot({ path: `${PASTA}/${etiqueta}-${m.nome}.png`, fullPage: false });
  }
});
