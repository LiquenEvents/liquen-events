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
      /**
       * `[data-tile-idx] picture` e não `picture`: este teste dizia respeito à
       * GRELHA e apanhava o primeiro `<picture>` da página, fosse ele de quem
       * fosse. Passou a haver outro antes dele — o herói da própria página da
       * galeria, que desde os heróis em AVIF é um `<picture>` com UMA só fonte
       * (AVIF), tendo o `<img>` em WebP por baixo como rede. O teste reprovou a
       * dizer `Received array: ["image/avif"]`, e tinha razão sobre o que via:
       * não estava a olhar para um mosaico.
       *
       * A regra das duas fontes é da grelha, onde as duas escadas coexistem por
       * `media`. Do herói trata o `e2e/heroi-avif.spec.ts`, que é onde a regra
       * dele — uma fonte AVIF e um `<img>` WebP que pinta — faz sentido.
       */
      const fontes = await page.evaluate(() =>
        [...document.querySelectorAll("[data-tile-idx] picture")]
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
      // O desfocado vive no `<picture>` (ver `.g-moldura`); o `<img>` continua
      // aqui porque o blur tardio pode cair nele quando não há `<picture>`.
      const pintado = [...el.querySelectorAll("picture, img")].find((n) =>
        /data:image/.test((n as HTMLElement).style.backgroundImage || ""),
      );
      const temCor = /rgb|#/.test(el.style.backgroundColor || "");
      if (!pintado && !temCor) maus.push(el.getAttribute("data-tile-idx") ?? "?");
    }
    return maus;
  });
  expect(vazios, `mosaicos sem placeholder nenhum: ${vazios.join(", ")}`).toEqual([]);
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TER O DESFOCADO NÃO É MOSTRÁ-LO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O teste acima conta placeholders no DOM, e a tabela do GALERIA-AFTER também
 * ("Placeholder no 1.º ecrã: 16 de 16"). Os dois estavam certos e os dois
 * deixavam passar o defeito: o desfocado era pintado no `<img>`, que a classe
 * `g-foto` põe a `opacity: 0` até a fotografia carregar. Medido no sítio
 * construído, antes da correcção: **16 mosaicos com desfocado no DOM, 0 a
 * mostrá-lo**, em telemóvel e em secretária.
 *
 * Este teste pergunta a única coisa que interessa a quem está a olhar: o
 * elemento que leva a pintura chega a ter opacidade? Não mede beleza, mede
 * visibilidade — e é o que faltava para o defeito não poder voltar em silêncio.
 */
test("@galeria o desfocado que se envia é o desfocado que se vê", async ({ page }) => {
  await page.goto("/galeria");
  const r = await page.evaluate(() => {
    const invisiveis: string[] = [];
    let comBlur = 0;
    for (const t of document.querySelectorAll("[data-tile-idx]")) {
      const el = t as HTMLElement;
      const pintado = [...el.querySelectorAll("picture, img")].find((n) =>
        /data:image/.test((n as HTMLElement).style.backgroundImage || ""),
      ) as HTMLElement | undefined;
      if (!pintado) continue;
      comBlur += 1;
      const opacidade = Number(getComputedStyle(pintado).opacity);
      if (!(opacidade > 0.01)) {
        invisiveis.push(`${el.getAttribute("data-tile-idx")} (${pintado.tagName}, ${opacidade})`);
      }
    }
    return { comBlur, invisiveis };
  });

  expect(
    r.comBlur,
    "não encontrei nenhum mosaico com desfocado — o teste não testou nada",
  ).toBeGreaterThan(0);
  expect(
    r.invisiveis,
    `mosaicos com desfocado pintado num elemento invisível: ${r.invisiveis.join(", ")}`,
  ).toEqual([]);
});
test("@galeria a grelha não salta: cada foto tem caixa antes de chegar", async ({ page }) => {
  await page.goto("/galeria");
  const semCaixa = await page.evaluate(() => {
    const maus: string[] = [];
    for (const t of document.querySelectorAll("[data-tile-idx]")) {
      const el = t as HTMLElement;
      /**
       * As fotos 1 a 4 existem DUAS vezes no DOM — nos satélites do
       * mosaico-herói (`hidden sm:block`) e no masonry (`sm:hidden`) — e o CSS
       * esconde uma das cópias conforme o tamanho do ecrã. A que está
       * escondida tem altura zero, e isso está certo: não é um mosaico sem
       * caixa, é um mosaico que não está a ser desenhado.
       */
      if (el.offsetParent === null) continue;
      /**
       * A célula tem de ter ALTURA sem depender da fotografia. Como lá chega é
       * indiferente, e há duas maneiras legítimas em uso: os mosaicos do
       * masonry declaram `aspect-ratio` (a proporção real da foto), e os cinco
       * do mosaico-herói recebem a altura das linhas da grelha
       * (`h-[320px] sm:h-[480px]`). A primeira versão deste teste exigia
       * `aspect-ratio` em todos e reprovava os cinco do herói — estava a
       * verificar o MECANISMO em vez da propriedade.
       */
      if (el.getBoundingClientRect().height < 1) {
        maus.push(`mosaico ${el.dataset.tileIdx} sem altura reservada`);
      }
      // E a própria imagem declara dimensões, para o browser não ter de
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

test("@galeria os dados estruturados das fotografias têm URLs válidos", async ({ page }) => {
  /**
   * Um `contentUrl` com um espaço por codificar é um URL inválido: o motor de
   * busca não o consegue ir buscar e a entrada inteira não serve para nada.
   * Aconteceu — há fotografias com espaços no nome ("Natalia e Jonathan-620.jpg")
   * e a primeira versão disto interpolava o caminho tal e qual. O JSON-LD
   * continua a validar, o HTML continua bonito, e o efeito é zero.
   */
  await page.goto("/galeria");
  const urls = await page.evaluate(() => {
    const scripts = [...document.querySelectorAll('script[type="application/ld+json"]')];
    for (const s of scripts) {
      const dados = JSON.parse(s.textContent || "{}");
      if (dados["@type"] !== "ItemList") continue;
      return (dados.itemListElement ?? []).map(
        (e: { item?: { contentUrl?: string } }) => e.item?.contentUrl ?? "",
      );
    }
    return [];
  });

  expect(urls.length, "não encontrei o ItemList das fotografias").toBeGreaterThan(0);
  const invalidos = urls.filter((u: string) => {
    if (!u) return true;
    try {
      // Um URL válido sobrevive à ida e volta; um com espaços crus não.
      return new URL(u).href !== u;
    } catch {
      return true;
    }
  });
  expect(invalidos, `contentUrl inválidos: ${invalidos.join(", ")}`).toEqual([]);
});

test("@galeria nenhuma fotografia fica descarregada e invisível", async ({ page }) => {
  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O DEFEITO QUE ISTO GUARDA, E PORQUE É QUE NINGUÉM DEU POR ELE
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Medido no primeiro ecrã: fotografias DESCARREGADAS E DESCODIFICADAS que
   * ficavam invisíveis para sempre — 3 de 3 em secretária, 2 de 2 em telemóvel,
   * ainda presas aos 9,6 s.
   *
   * A classe `g-foto` põe o `<img>` a `opacity: 0`; quem lha devolve é
   * `g-foto-pronta`, posta pelo `onLoad` do React. Mas a fotografia vem no HTML
   * do servidor: se acabar de descarregar ANTES da hidratação, esse `onLoad`
   * nunca dispara. Acontece precisamente às fotos mais rápidas — as do primeiro
   * ecrã.
   *
   * Os testes que já cá estavam não o podiam apanhar. Um verifica que o
   * placeholder EXISTE, outro que a caixa tem altura, outro que a resolução não
   * é excessiva. Nenhum perguntou a coisa mais simples: **vê-se?**
   *
   * Por isso este teste não olha para classes nem para estado. Pergunta ao
   * browser a opacidade COMPUTADA de cada fotografia que já tem bytes.
   */
  await page.goto("/galeria");
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(2000);

  const presas = await page.evaluate(() => {
    const maus: string[] = [];
    for (const im of document.querySelectorAll("img")) {
      if (!im.currentSrc.includes("/_img/g/")) continue;
      // Só interessam as que JÁ têm imagem: uma que ainda não chegou tem todo
      // o direito de estar transparente.
      if (!im.complete || im.naturalWidth === 0) continue;
      if (Number(getComputedStyle(im).opacity) < 0.99) {
        maus.push(im.currentSrc.split("/").pop() ?? "?");
      }
    }
    return maus;
  });

  expect(
    presas,
    `fotografias descarregadas e invisíveis (opacidade < 1): ${presas.join(", ")}`,
  ).toEqual([]);
});
