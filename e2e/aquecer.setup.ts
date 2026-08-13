import { test as setup, expect } from "@playwright/test";
import { exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * AQUECER O SERVIDOR DE DESENVOLVIMENTO, UMA VEZ, ANTES DE TUDO.
 *
 * ── Porque é que isto existe ──────────────────────────────────────────────
 * Os passeios desta configuração correm contra `next dev`, que compila cada
 * rota À PRIMEIRA VISITA. O estúdio de propostas e o dossier do evento são dos
 * maiores pacotes do back office: medido nesta máquina, a primeira abertura de
 * «Fazer proposta» passava dos 15 s, e a primeira do dossier deixava a página
 * pintada mas ainda POR HIDRATAR durante segundos — o HTML está lá, os
 * manípulos ainda não. Um clique nessa janela não faz nada e não deixa rasto:
 * o passeio segue e falha vinte linhas à frente, com a cara de um botão que
 * «não existe».
 *
 * Foi exactamente isso que aconteceu na primeira corrida verdadeira desta
 * suite: quatro passeios vermelhos, todos por compilação, nenhum por defeito. E
 * a saída preguiçosa — deixar as repetições do CI taparem — ensinaria a suite a
 * ser verde à segunda, que é como se aprende a não olhar para a primeira.
 *
 * Este ficheiro paga essa factura UMA vez: entra, semeia o pedido e visita as
 * rotas pesadas. Quando os passeios começam, o servidor já compilou tudo o que
 * eles vão pedir.
 *
 * NÃO É UM TESTE e não afirma nada sobre o produto — as asserções que tem
 * existem só para falhar cedo e com nome, em vez de deixarem a suite inteira
 * falhar por arrasto.
 */
setup("aquecer as rotas pesadas do back office", async ({ page }) => {
  setup.setTimeout(240_000);

  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
  exigirLogin(
    await nav
      .waitFor({ state: "visible", timeout: 60_000 })
      .then(() => true)
      .catch(() => false),
  );

  // O pedido de que todos os passeios precisam, criado uma só vez.
  const quoteId = await garantirPedido(page);

  // «Fazer proposta» → o cartão do cliente → o estúdio. É o caminho que compila
  // o maior dos pacotes preguiçosos.
  //
  // Os cliques INSISTEM: é este ficheiro que apanha a página mais fria de
  // todas, e um clique numa página ainda por hidratar não faz nada. Trocar de
  // vista e escolher o mesmo cliente são acções idempotentes, portanto insistir
  // não constrói nada a dobrar.
  const fazerProposta = nav.getByRole("button", { name: /^Fazer proposta$/ }).first();
  await expect(async () => {
    await fazerProposta.click();
    await expect(page.getByRole("heading", { level: 1, name: /^Fazer proposta$/ })).toBeVisible({
      timeout: 5_000,
    });
  }).toPass({ timeout: 120_000 });

  const cliente = page.locator("main li button:visible").first();
  await expect(cliente, "o cartão do cliente semeado").toBeVisible({ timeout: 90_000 });
  await expect(async () => {
    await cliente.click();
    await expect(page.getByLabel(/^Linha 1 do grupo 1$/).first()).toBeVisible({ timeout: 8_000 });
  }).toPass({ timeout: 120_000 });

  // O dossier do evento, que é outra rota e outro pacote.
  await page.goto(`/orcamento/admin/evento/${quoteId}`);
  await expect(page.getByText(/Estúdio de propostas \(PDF\)/i).first()).toBeVisible({
    timeout: 90_000,
  });

  // A vista de carregamento de material partilha o invólucro do back office mas
  // tem rota própria; um id inexistente serve para a compilar (o que interessa
  // é o pacote, não o conteúdo).
  await page.goto("/orcamento/admin/carregamento/aquecimento");
  await page.waitForLoadState("domcontentloaded");
});
