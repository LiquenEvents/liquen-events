import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO ANEL, DOIS AFASTAMENTOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Da análise da loja da Apple: `--sk-focus-offset: 1px` nos controlos e
 * `--sk-focus-offset-container: 3px` nos contentores. A razão é boa — um anel
 * colado a um cartão grande LÊ-SE COMO BORDA, não como foco. É o detalhe que
 * separa «temos foco visível» de «temos um sistema de foco».
 *
 * ── PORQUE É QUE ISTO SE MEDE NUM BROWSER, E COM O TECLADO ────────────────
 *
 * Duas razões, e as duas custaram tempo a perceber:
 *
 *  · O anel é `:focus-visible`, e um `.focus()` de script NÃO faz casar esse
 *    selector no Chromium — quem decide é a modalidade da última entrada. Com
 *    um `.focus()`, o elemento fica focado e sem anel nenhum, e o teste
 *    concluía «não há foco visível» sobre uma interface que o tem. Daí o TAB.
 *  · O anel tem uma transição de 150 ms. Medido a meio, devolve valores
 *    intermédios — apanhei `1,067px` e `2,135px` a caminho dos 2 e dos 4 —,
 *    e um teste que compare números exactos falha por chegar cedo. Daí esperar
 *    que assente.
 */

/** Leva o foco ao elemento pelo teclado, e devolve o anel já assente. */
async function anelDe(
  page: import("@playwright/test").Page,
  alvo: import("@playwright/test").Locator,
) {
  await alvo.scrollIntoViewIfNeeded();
  await page.keyboard.press("Tab");
  for (let i = 0; i < 200; i += 1) {
    if (await alvo.evaluate((el) => el === document.activeElement)) break;
    await page.keyboard.press("Tab");
  }
  expect(
    await alvo.evaluate((el) => el === document.activeElement),
    "não consegui levar o foco ao elemento com o TAB",
  ).toBe(true);
  // O anel cresce em 150 ms; medir antes disso devolve números a meio caminho.
  await page.waitForTimeout(350);
  return alvo.evaluate((el) => getComputedStyle(el).boxShadow);
}

/** Os dois raios do anel, em píxeis: a auréola e o musgo. */
function raios(sombra: string): number[] {
  return [...sombra.matchAll(/0px 0px 0px (\d+(?:\.\d+)?)px/g)].map((m) => Number(m[1]));
}

test("um controlo leva o anel apertado; uma linha inteira leva-o folgado", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  exigirLogin(await entrarNoBackOffice(page));
  await garantirPedido(page);
  await page.reload();

  // O CARTÃO DE DINHEIRO da Visão Geral: uma caixa, não um botão.
  const cartao = page.getByRole("button", { name: /^Ganho:/ }).first();
  await expect(cartao).toBeVisible();
  const doCartao = raios(await anelDe(page, cartao));
  expect(
    doCartao,
    `o cartão «Ganho» ficou com o anel ${JSON.stringify(doCartao)} — esperava a folga de ` +
      `contentor (4 e 6 px). Falta-lhe a classe \`foco-largo\`?`,
  ).toEqual([4, 6]);

  // E UM CONTROLO pequeno, para provar que o afastamento apertado continua a
  // ser o normal — senão isto não são dois afastamentos, é um novo.
  const controlo = page.getByRole("radiogroup").first().getByRole("radio").first();
  if (await controlo.count()) {
    const doControlo = raios(await anelDe(page, controlo));
    expect(
      doControlo,
      `um segmento de filtro ficou com ${JSON.stringify(doControlo)} — o anel apertado (2 e 4 px) ` +
        `é o normal da casa, e só as CAIXAS o abrem`,
    ).toEqual([2, 4]);
  }
});
