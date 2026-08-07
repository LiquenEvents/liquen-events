import { test, expect } from "@playwright/test";
import {
  ESCADA_ECRA_GRANDE,
  ESCADA_TELEMOVEL,
  larguraEsperada,
} from "@/app/[lang]/(site)/galeria/gallery-srcset";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GALERIA NÃO PODE ENGORDAR OUTRA VEZ — @galeria
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que aqui está prende os quatro ganhos que custaram a medir, e prende-os
 * pela CAUSA, não pelo sintoma. Cada um destes já esteve errado em produção:
 *
 *  1. **Sobre-resolução.** A galeria serviu ficheiros de 1280 px para caixas de
 *     412 CSS px — 3,11×, em 374 de 374 fotografias, 55 MB por travessia. Não
 *     por descuido: era a aritmética correcta do `sizes` num ecrã DPR 3. Um
 *     `sizes` mal mexido volta a pô-la lá sem ninguém reparar, porque a página
 *     continua a parecer bem — só fica pesada.
 *
 *  2. **Formato.** O AVIF tem de vir à frente e o WebP tem de continuar a
 *     existir. Perder o primeiro é pagar 26% a mais em todas as fotos; perder o
 *     segundo é deixar sem fotografia nenhuma quem não souber AVIF.
 *
 *  3. **Placeholder.** Nenhum mosaico do primeiro ecrã pode aparecer vazio.
 *
 *  4. **CLS.** A grelha não pode saltar. Cada célula tem `aspect-ratio` e cada
 *     `<img>` tem `width`/`height`, portanto a caixa existe antes da
 *     fotografia — e é isso que se verifica.
 *
 * Corre em DOIS tamanhos de ecrã de propósito: o tecto do telemóvel e o do ecrã
 * grande são diferentes, e um teste que só visse um deles deixava metade da
 * regra por guardar.
 */

const ECRAS = [
  { nome: "telemóvel", largura: 412, altura: 915, dpr: 3, escada: ESCADA_TELEMOVEL },
  { nome: "secretária", largura: 1440, altura: 900, dpr: 2, escada: ESCADA_ECRA_GRANDE },
];

for (const ecra of ECRAS) {
  test.describe(`@galeria a galeria em ${ecra.nome}`, () => {
    test.use({
      viewport: { width: ecra.largura, height: ecra.altura },
      deviceScaleFactor: ecra.dpr,
    });

    test(`@galeria nenhuma foto é servida acima do degrau certo (${ecra.nome})`, async ({
      page,
    }) => {
      await page.goto("/galeria");
      await page.waitForLoadState("networkidle").catch(() => {});
      // Descer dois ecrãs para haver mosaicos da grelha carregados, não só o
      // mosaico-herói.
      await page.mouse.wheel(0, ecra.altura * 2);
      await page.waitForTimeout(2500);

      const fotos = await page.evaluate(() => {
        const out: { url: string; css: number }[] = [];
        for (const im of document.querySelectorAll("img")) {
          const r = im.getBoundingClientRect();
          if (!im.currentSrc.includes("/_img/g/") || r.width < 40) continue;
          out.push({ url: im.currentSrc, css: r.width });
        }
        return out;
      });

      expect(fotos.length, "não encontrei fotos da grelha carregadas").toBeGreaterThan(3);

      const excessivas: string[] = [];
      for (const f of fotos) {
        const m = /-(\d+)\.(webp|avif)/.exec(f.url);
        if (!m) continue;
        const servida = Number(m[1]);
        // A regra: nunca mais do que o degrau que cobre 2x a caixa. Um degrau
        // acima do necessário é inevitável (a escada é discreta e o browser
        // arredonda para cima); dois ou três é o desperdício que isto guarda.
        const tecto = larguraEsperada(f.css, ecra.escada);
        if (servida > tecto) {
          excessivas.push(
            `${f.url.split("/").pop()} servida a ${servida}px numa caixa de ${Math.round(f.css)} CSS px (tecto ${tecto})`,
          );
        }
      }
      expect(excessivas, excessivas.join("\n")).toEqual([]);
    });

    test(`@galeria o AVIF vem à frente e o WebP continua a existir (${ecra.nome})`, async ({
      page,
    }) => {
      await page.goto("/galeria");
      const fontes = await page.evaluate(() =>
        [...document.querySelectorAll("picture")]
          .slice(0, 3)
          .map((p) => [...p.querySelectorAll("source")].map((s) => s.type)),
      );
      expect(fontes.length, "não encontrei nenhum <picture> na grelha").toBeGreaterThan(0);
      for (const tipos of fontes) {
        expect(tipos).toContain("image/avif");
        expect(tipos).toContain("image/webp");
        expect(tipos.indexOf("image/avif")).toBeLessThan(tipos.indexOf("image/webp"));
      }
    });
  });
}

test("@galeria nenhum mosaico do primeiro ecrã aparece vazio", async ({ page }) => {
  await page.goto("/galeria");
  const vazios = await page.evaluate(() => {
    const maus: string[] = [];
    for (const t of document.querySelectorAll("[data-tile-idx]")) {
      const el = t as HTMLElement;
      const im = el.querySelector("img");
      const temBlur = im ? /data:image/.test(im.style.backgroundImage || "") : false;
      const temCor = /rgb|#/.test(el.style.backgroundColor || "");
      if (!temBlur && !temCor) maus.push(el.getAttribute("data-tile-idx") ?? "?");
    }
    return maus;
  });
  expect(vazios, `mosaicos sem placeholder nenhum: ${vazios.join(", ")}`).toEqual([]);
});

test("@galeria a grelha não salta: cada foto tem caixa antes de chegar", async ({ page }) => {
  await page.goto("/galeria");
  const semCaixa = await page.evaluate(() => {
    const maus: string[] = [];
    for (const t of document.querySelectorAll("[data-tile-idx]")) {
      const el = t as HTMLElement;
      // A célula reserva o espaço pela proporção...
      if (!el.style.aspectRatio) maus.push(`mosaico ${el.dataset.tileIdx} sem aspect-ratio`);
      // ...e a própria imagem declara dimensões, para o browser não ter de
      // esperar pelos bytes para saber que forma tem.
      const im = el.querySelector("img");
      if (im && (!im.getAttribute("width") || !im.getAttribute("height"))) {
        maus.push(`imagem do mosaico ${el.dataset.tileIdx} sem width/height`);
      }
    }
    return maus;
  });
  expect(semCaixa, semCaixa.join("\n")).toEqual([]);
});
