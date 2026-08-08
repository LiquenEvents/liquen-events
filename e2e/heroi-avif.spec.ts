import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HERÓI EM AVIF — E AS DUAS COISAS QUE PODIAM CORRER MAL EM SILÊNCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O herói é a maior imagem de cada página e, medido em secretária, é o elemento
 * de LCP. Passou a ser servido em AVIF através de um `<picture>`, o que traz
 * dois riscos que NÃO se veem a olhar para a página — ela fica bonita nos dois
 * casos:
 *
 *  1. **Descarregar duas vezes.** O `priority` do `next/image` emite um
 *     `<link rel="preload">` para o `srcset` do `<img>`, que é WebP. Se esse
 *     preload sobrevivesse ao lado de um `<picture>` que escolhe o AVIF, o
 *     browser trazia os dois — o dobro dos bytes precisamente no elemento mais
 *     pesado. Por isso o preload é escrito à mão, com `type="image/avif"`.
 *  2. **Ficar sem herói.** Um browser escolhe a `<source>` pelo `type`, não por
 *     ela existir nem por ele a saber ler... mas quem não sabe ler AVIF salta-a
 *     e cai no `<img>`. Esse `<img>` TEM de continuar a ser WebP: é a rede.
 *
 * Nenhuma das duas dá erro. Uma custa bytes, a outra deixa uma página sem a sua
 * fotografia — e as duas passariam despercebidas num Chromium moderno, que é o
 * que corre aqui. Daí este ficheiro olhar para o HTML e não para o ecrã.
 */

/** A pasta dos logótipos também é `/_img`, e esses são WebP de propósito. */
const HEROI_WEBP = /\/_img\/(?!l\/)[^"']+\.webp/;

test("o pré-carregamento do herói aponta para o AVIF, e é o único", async ({ page }) => {
  await page.goto("/");

  const preloads = await page.evaluate(() =>
    [...document.querySelectorAll('link[rel="preload"][as="image"]')].map((l) => ({
      tipo: l.getAttribute("type") ?? "",
      srcset: l.getAttribute("imagesrcset") ?? l.getAttribute("imageSrcSet") ?? "",
      href: l.getAttribute("href") ?? "",
    })),
  );

  const avif = preloads.filter((p) => p.tipo === "image/avif");
  expect(avif, `preloads de imagem encontrados: ${JSON.stringify(preloads)}`).toHaveLength(1);
  expect(avif[0].srcset).toContain(".avif");

  // E nenhum preload do MESMO herói em WebP ao lado — que era o desperdício.
  const webpDeHeroi = preloads.filter((p) => HEROI_WEBP.test(p.srcset) || HEROI_WEBP.test(p.href));
  expect(
    webpDeHeroi,
    `há preload de herói em WebP a duplicar o AVIF: ${JSON.stringify(webpDeHeroi)}`,
  ).toEqual([]);
});

test("por baixo do AVIF do herói continua a haver um WebP que pinta", async ({ page }) => {
  await page.goto("/");

  const heroi = await page.evaluate(() => {
    for (const p of document.querySelectorAll("picture")) {
      const fontes = [...p.querySelectorAll("source")].map((s) => s.type);
      if (!fontes.includes("image/avif")) continue;
      const im = p.querySelector("img");
      if (!im) continue;
      return {
        fontes,
        // O que o `<img>` traz por si — o que um browser sem AVIF usaria.
        atributoSrc: im.getAttribute("src") ?? "",
        atributoSrcset: im.getAttribute("srcset") ?? "",
        // O que ESTE browser escolheu, que deve ser o AVIF.
        escolhido: im.currentSrc,
        pintou: im.complete && im.naturalWidth > 0,
      };
    }
    return null;
  });

  expect(heroi, "não encontrei nenhum <picture> com fonte AVIF na página inicial").not.toBeNull();
  // A rede: sem AVIF, o browser fica-se pelo `<img>`, e ele é WebP.
  const rede = `${heroi!.atributoSrcset} ${heroi!.atributoSrc}`;
  expect(rede, `o <img> do herói não oferece WebP nenhum: ${rede}`).toMatch(/\.webp/);
  // E neste browser, que sabe AVIF, foi mesmo o AVIF que veio — e pintou. Sem
  // esta última parte o teste passaria com um AVIF que o pré-gerador não
  // escreveu: o `currentSrc` aponta na mesma para o ficheiro que falta.
  expect(heroi!.escolhido, `o browser escolheu ${heroi!.escolhido}`).toContain(".avif");
  expect(heroi!.pintou, `o herói não chegou a pintar: ${heroi!.escolhido}`).toBe(true);
});
