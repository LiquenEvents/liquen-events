import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PÍLULA DOS FILTROS ANDA — E O SINAL CHEGA ANTES DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido na Pixelmatters: o segmento activo de uma barra de filtros não muda
 * de cor de repente — há um indicador que ANDA de um segmento para o outro. É
 * a peça mais copiável do site deles, e o ecrã onde mais se sente é o dos
 * filtros das Propostas.
 *
 * ── PORQUE É QUE ISTO SÓ SE MEDE NUM BROWSER ──────────────────────────────
 *
 * Porque a pílula é POSICIONADA POR MEDIÇÃO: o componente pergunta ao browser
 * onde está o segmento activo e quanto mede. No jsdom todos os elementos medem
 * zero, portanto lá a pílula não chega sequer a existir — e o teste de lá
 * guarda outra coisa (que sem medição o botão activo fica com o seu próprio
 * fundo, para nunca haver um controlo sem nada escolhido).
 *
 * Aqui guarda-se o que só um browser sabe: que ela MUDA DE SÍTIO e de
 * LARGURA, e que a mudança é uma transição e não um salto.
 */
test("a pílula dos filtros das Propostas anda de segmento em vez de saltar", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  exigirLogin(await entrarNoBackOffice(page));
  await garantirPedido(page);
  await page.reload();

  await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .getByRole("button", { name: /^Propostas$/ })
    .first()
    .click();

  const grupo = page.getByRole("radiogroup", { name: /Filtrar propostas por estado/i });
  await expect(grupo).toBeVisible();

  const pilula = grupo.locator("span[aria-hidden='true']").first();
  await expect(
    pilula,
    "a pílula não chegou a ser medida — o filtro ficou sem marca deslizante",
  ).toBeVisible();

  const medir = () =>
    pilula.evaluate((e) => {
      const cs = getComputedStyle(e);
      return {
        translate: cs.translate,
        largura: cs.width,
        propriedade: cs.transitionProperty,
        duracao: cs.transitionDuration,
      };
    });

  const antes = await medir();
  // É uma TRANSIÇÃO, e não uma troca. Se alguém tirar a transição, a pílula
  // continua a chegar ao sítio certo — e o teste teria de continuar verde sem
  // isso, que é como este cheque morria.
  expect(antes.propriedade, "a pílula deixou de ter transição — passou a saltar").toContain(
    "translate",
  );
  expect(antes.duracao, "a pílula perdeu a duração").not.toBe("0s");

  const segmentos = grupo.getByRole("radio");
  const quantos = await segmentos.count();
  expect(quantos, "o filtro de estado ficou sem segmentos").toBeGreaterThan(1);

  await segmentos.nth(1).click();
  // Espera pela chegada: 250 ms de percurso mais folga.
  await expect
    .poll(async () => (await medir()).translate, {
      message: "a pílula não mudou de sítio ao trocar de filtro",
    })
    .not.toBe(antes.translate);

  const depois = await medir();
  expect(
    depois.largura,
    "a pílula não acompanhou a largura do segmento — «Todas · 2» e «Aceites» não medem o mesmo",
  ).not.toBe(antes.largura);

  // E nunca dois fundos brancos ao mesmo tempo: assim que a pílula existe, o
  // segmento activo larga o seu. Um fundo a mais lê-se como dois filtros
  // escolhidos.
  const brancos = await grupo.evaluate(
    (g) =>
      Array.from(g.querySelectorAll('[role="radio"]')).filter((b) =>
        (b as HTMLElement).className.includes("bg-white"),
      ).length,
  );
  expect(brancos, "o segmento activo ficou com fundo próprio POR BAIXO da pílula").toBe(0);
});
