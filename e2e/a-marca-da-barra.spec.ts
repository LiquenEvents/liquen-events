import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MARCA AO MEIO DA BARRA — E A CAIXA VAZIA QUE SOBREVIVEU A TRÊS RONDAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Ela pediu a marca maior três vezes seguidas. Das três, eu subi
 * o número da altura — 32 → 48 → 64 — e das três ela voltou a dizer que estava
 * pequena. À terceira mandou também «e mais ao meio», e foi essa a pista que me
 * fez medir em vez de continuar a somar.
 *
 * O ficheiro tinha 3747 × 2238, e o desenho lá dentro 2146 × 1084: **57% da
 * largura e 48% da altura**. Metade da caixa era transparência. Portanto:
 *
 *   · a altura que o CSS pedia era a da TELA, e o desenho saía com menos de
 *     metade dela — `h-16` dava 31 px de marca;
 *   · e o desenho nem sequer estava centrado na sua própria tela (65 px à
 *     direita, 99 px acima), por isso centrar a tela na barra deixava a marca
 *     ao lado do meio, sem nada no CSS que o explicasse.
 *
 * As duas queixas dela, uma só causa, e nenhuma no número que eu andava a
 * mexer. Este passeio é o que impede a mesma caixa vazia de voltar a entrar
 * sem ninguém dar por ela: mede o DESENHO, não o ficheiro.
 */

/** Quanto do ficheiro é desenho, e onde está o centro do desenho nele. */
async function medirATinta(page: import("@playwright/test").Page, url: string) {
  return page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minx = c.width;
    let maxx = -1;
    let miny = c.height;
    let maxy = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        // Desenho = píxel que se vê: opaco o bastante e não quase-branco.
        if (d[i + 3] > 16 && !(d[i] > 245 && d[i + 1] > 245 && d[i + 2] > 245)) {
          if (x < minx) minx = x;
          if (x > maxx) maxx = x;
          if (y < miny) miny = y;
          if (y > maxy) maxy = y;
        }
      }
    }
    return {
      tela: { w: c.width, h: c.height },
      fracaoLargura: (maxx - minx + 1) / c.width,
      fracaoAltura: (maxy - miny + 1) / c.height,
      desvioX: ((minx + maxx) / 2 - c.width / 2) / c.width,
      desvioY: ((miny + maxy) / 2 - c.height / 2) / c.height,
    };
  }, url);
}

test.describe("a marca da barra do back office @movimento", () => {
  test("o desenho enche a caixa e está no meio da barra", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pt/orcamento/admin");

    const marca = page.locator('header img[src*="logo-liquen-marca"]').first();
    await marca.waitFor({ state: "visible" });

    const url = await marca.evaluate((el) => (el as HTMLImageElement).currentSrc);
    const tinta = await medirATinta(page, url);

    /**
     * 1. O FICHEIRO É QUASE TODO DESENHO.
     *
     * É esta a asserção que apanha a avaria de origem. Com o ficheiro antigo
     * dava 0,57 e 0,48 — e a barra parecia ter a marca a metade do tamanho que
     * o CSS dizia, sem nenhuma explicação visível no CSS.
     */
    expect(
      tinta.fracaoLargura,
      `só ${(tinta.fracaoLargura * 100).toFixed(0)}% da largura do ficheiro é desenho — ` +
        "o resto é transparência, e a altura que o CSS pede aplica-se à caixa toda, " +
        "não ao que se vê",
    ).toBeGreaterThan(0.9);
    expect(
      tinta.fracaoAltura,
      `só ${(tinta.fracaoAltura * 100).toFixed(0)}% da altura do ficheiro é desenho`,
    ).toBeGreaterThan(0.9);

    /**
     * 2. E O DESENHO ESTÁ CENTRADO NO SEU PRÓPRIO FICHEIRO.
     *
     * Sem isto, `justify-center` centra uma caixa cujo conteúdo está de lado, e
     * a marca fica ao lado do meio para sempre. Era a segunda metade do «mais
     * ao meio» dela.
     */
    expect(
      Math.abs(tinta.desvioX),
      `o desenho está ${(tinta.desvioX * 100).toFixed(1)}% ao lado do centro do ficheiro`,
    ).toBeLessThan(0.02);
    expect(
      Math.abs(tinta.desvioY),
      `o desenho está ${(tinta.desvioY * 100).toFixed(1)}% acima/abaixo do centro do ficheiro`,
    ).toBeLessThan(0.02);

    /**
     * 3. E A CAIXA ESTÁ MESMO AO MEIO DA BARRA.
     *
     * Ao meio da BARRA, e não a meio do que sobra entre o título e os botões —
     * a razão está por extenso no `AdminClient.tsx`: o espaço que sobra muda de
     * tamanho a cada vista, e a marca andava de um lado para o outro ao mudar
     * de separador.
     */
    const barra = page.locator("header").first();
    const caixaDaBarra = (await barra.boundingBox())!;
    const caixaDaMarca = (await marca.boundingBox())!;
    const centroDaBarra = caixaDaBarra.x + caixaDaBarra.width / 2;
    const centroDaMarca = caixaDaMarca.x + caixaDaMarca.width / 2;
    expect(
      Math.abs(centroDaMarca - centroDaBarra),
      `a marca está a ${Math.abs(centroDaMarca - centroDaBarra).toFixed(1)} px do meio da barra`,
    ).toBeLessThan(2);

    /**
     * 4. E VÊ-SE. Um número que se pede em CSS e que agora É o que se vê.
     */
    expect(
      caixaDaMarca.height,
      `a marca ficou com ${caixaDaMarca.height.toFixed(0)} px de altura — ela pediu-a maior três vezes`,
    ).toBeGreaterThan(48);

    /** E não estoira a barra: a barra é a moldura do painel inteiro. */
    expect(
      caixaDaMarca.height,
      "a marca é mais alta do que a barra que a segura",
    ).toBeLessThanOrEqual(caixaDaBarra.height);
  });
});
