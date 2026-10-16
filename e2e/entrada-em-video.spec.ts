import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DA ENTRADA TOCAM — E SÓ QUANDO DEVEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/10): os três vídeos de fundo na capa, «super fluidos, sem
 * travar». As regras estão provadas sem browser (entrada-em-video.test.ts,
 * EntradaEmVideo.test.tsx); aqui prova-se o que só um browser mostra:
 *   · o vídeo chega a TOCAR (o tempo avança) e fica à vista por cima da foto;
 *   · a fotografia continua por baixo — é o LCP, e é o que fica sem vídeo;
 *   · com movimento reduzido o vídeo toca na mesma (decisão dela, 16/10).
 *
 * O Chromium dos testes não tem H.264, por isso toca a rede em WebM — o mesmo
 * componente, o mesmo caminho, outro ficheiro. Tem a etiqueta `@movimento`
 * para correr no job que vai contra o build de produção.
 */

test.describe("@movimento a entrada em vídeo", () => {
  test("o vídeo 1 entra por cima da fotografia e toca", async ({ page }) => {
    test.setTimeout(60_000);
    await page.goto("/");
    const primeiro = page.locator('[data-entrada-video="0"]');
    // Arranca sozinho, do HTML, sem esperar por nada (pedido dela, 16/10).
    await expect(primeiro).toHaveCSS("opacity", "1", { timeout: 25_000 });
    expect(await primeiro.evaluate((v: HTMLVideoElement) => v.currentSrc)).toMatch(
      /\/videos\/entrada\/v2\/entrada-1-1080\./,
    );

    const t1 = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.waitForTimeout(800);
    const t2 = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    expect(t2, "o tempo do vídeo não avançou: está parado").toBeGreaterThan(t1);

    // O vídeo 2 já está a ser preparado enquanto o 1 toca.
    await expect(page.locator('[data-entrada-video="1"]')).toHaveAttribute("src", /entrada-2-/);

    // E a fotografia continua lá por baixo.
    await expect(page.locator("section img.hero-settle")).toHaveCount(1);
  });

  // Decisão dela (16/10): os vídeos tocam MESMO com «reduzir movimento».
  test("com movimento reduzido o vídeo toca na mesma", async ({ browser }) => {
    test.setTimeout(60_000);
    const ctx = await browser.newContext({ reducedMotion: "reduce" });
    const page = await ctx.newPage();
    await page.goto("/");
    const primeiro = page.locator('[data-entrada-video="0"]');
    await expect(primeiro).toHaveCSS("opacity", "1", { timeout: 25_000 });
    const t1 = await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime);
    await page.waitForTimeout(800);
    expect(await primeiro.evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(t1);
    await ctx.close();
  });
});
