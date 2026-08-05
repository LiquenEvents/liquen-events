import { test, expect, type Page } from "@playwright/test";

/**
 * Drives the quote request form (the site's main conversion path) end to end.
 * The POST to /api/orcamento is intercepted so the test is deterministic and
 * sends no real email/push — same approach as the contacto spec.
 */

/** Fills every field the form now requires. */
async function fillAll(page: Page, name = "Ana Teste") {
  await page.getByRole("radio", { name: "Casamento", exact: true }).click();
  await page.getByLabel("Data ainda a definir").check();
  await page.getByLabel("Ainda a definir", { exact: true }).check();
  // Dizer "ainda não sabemos" deixou de bastar: pede-se uma estimativa, porque
  // uma proposta precisa de uma ordem de grandeza para poder existir.
  await page.getByPlaceholder("Ex.: entre 100 e 150").fill("entre 100 e 150");
  await page.getByPlaceholder("Ex.: Évora, Alentejo…").fill("Évora");
  await page.getByPlaceholder("O seu nome").fill(name);
  await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
  await page.getByPlaceholder("+351 9XX XXX XXX").fill("912345678");
  await page
    .getByPlaceholder("Estilo, cores, ambiente, inspirações que guardou…")
    .fill("Algo natural, com flores do campo e tons de branco e verde.");
}

test.describe("Pedido de orçamento", () => {
  test("submete o formulário e chega à confirmação com a referência", async ({ page }) => {
    await page.route("**/api/orcamento", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "LIQ-E2E-TEST", status: "ok" }),
      }),
    );

    await page.goto("/orcamento");
    await fillAll(page);
    await page.getByRole("button", { name: /Enviar pedido/ }).click();

    // Hand-off lands on the confirmation page showing the reference id.
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-TEST$/);
    await expect(page.getByText("LIQ-E2E-TEST")).toBeVisible();
  });

  test("submeter incompleto mostra os erros e não avança", async ({ page }) => {
    await page.goto("/orcamento");

    // The submit stays operable (accessible pattern) — submitting an incomplete
    // form surfaces announced errors instead of a silently disabled button.
    const enviar = page.getByRole("button", { name: /Enviar pedido/ });
    await expect(enviar).toBeEnabled();

    await enviar.click();
    await expect(page.getByText("Selecione o tipo de evento.")).toBeVisible();
    await expect(page).toHaveURL(/\/orcamento$/);

    // Every field is required now, so filling only the contact details must
    // still be refused — with the reason named, on the field that's missing.
    await page.getByRole("radio", { name: "Corporativo", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Ana");
    await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
    await enviar.click();
    await expect(page).toHaveURL(/\/orcamento$/);
    await expect(page.getByText("Indique o local ou a região.")).toBeVisible();
  });

  test("aceita “ainda a definir” como resposta à data e ao nº de pessoas", async ({ page }) => {
    await page.route("**/api/orcamento", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "LIQ-E2E-OPEN", status: "ok" }),
      }),
    );

    await page.goto("/orcamento");
    await fillAll(page, "Rita Aberta");
    // Neither a date nor a headcount was typed — both checkboxes carry them.
    await expect(page.getByLabel("Data ainda a definir")).toBeChecked();
    await page.getByRole("button", { name: /Enviar pedido/ }).click();
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-OPEN$/);
  });

  test("“ainda a definir” pede uma estimativa, e sem ela não avança", async ({ page }) => {
    await page.goto("/orcamento");
    await page.getByRole("radio", { name: "Casamento", exact: true }).click();

    // Antes de marcar a caixa, o campo da estimativa não existe: quem sabe o
    // número não tem de ver um campo a mais.
    const estimativa = page.getByPlaceholder("Ex.: entre 100 e 150");
    await expect(estimativa).toHaveCount(0);

    await page.getByLabel("Ainda a definir", { exact: true }).check();
    await expect(estimativa).toBeVisible();

    // Deixá-la em branco trava o envio, com a razão certa — não a mensagem de
    // "indique quantas pessoas", que já não se aplica.
    await page.getByLabel("Data ainda a definir").check();
    await page.getByPlaceholder("Ex.: Évora, Alentejo…").fill("Évora");
    await page.getByPlaceholder("O seu nome").fill("Rita Sem Numero");
    await page.getByPlaceholder("email@exemplo.com").fill("rita@exemplo.pt");
    await page.getByPlaceholder("+351 9XX XXX XXX").fill("912345678");
    await page
      .getByPlaceholder("Estilo, cores, ambiente, inspirações que guardou…")
      .fill("Simples e com muita luz.");
    await page.getByRole("button", { name: /Enviar pedido/ }).click();
    await expect(page.getByText("Dê-nos uma estimativa, nem que seja um intervalo.")).toBeVisible();
    await expect(page).not.toHaveURL(/confirmacao/);

    // Com o intervalo escrito, segue.
    await estimativa.fill("entre 100 e 150");
    await page.route("**/api/orcamento", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: "LIQ-E2E-EST", status: "ok" }),
      }),
    );
    await page.getByRole("button", { name: /Enviar pedido/ }).click();
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-EST$/);
  });

  test("os nomes dos noivos só aparecem no casamento, e só ao escrever o nome", async ({
    page,
  }) => {
    await page.goto("/orcamento");
    const noivo = page.getByPlaceholder("Nome do noivo");

    // Casamento escolhido, nome ainda em branco → os campos não existem.
    await page.getByRole("radio", { name: "Casamento", exact: true }).click();
    await expect(noivo).toHaveCount(0);

    // Começa a escrever o nome → aparecem.
    await page.getByPlaceholder("O seu nome").fill("Ana");
    await expect(noivo).toBeVisible();
    await expect(page.getByPlaceholder("Nome da noiva")).toBeVisible();

    // Muda para um tipo de evento sem noivos → desaparecem, mesmo com o nome
    // escrito. Um aniversário não tem noivos.
    await page.getByRole("radio", { name: "Aniversário", exact: true }).click();
    await expect(noivo).toHaveCount(0);
  });

  test("o rascunho sobrevive a sair e voltar à página", async ({ page }) => {
    await page.goto("/orcamento");
    await page.getByRole("radio", { name: "Aniversário", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Maria Rascunho");

    // Navigate away and back — the locally saved draft restores the fields.
    await page.goto("/sobre");
    await page.goto("/orcamento");

    await expect(page.getByPlaceholder("O seu nome")).toHaveValue("Maria Rascunho");
    await expect(page.getByRole("radio", { name: "Aniversário", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });
});
