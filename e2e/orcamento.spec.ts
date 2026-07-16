import { test, expect } from "@playwright/test";

/**
 * Drives the quote request form (the site's main conversion path) end to end.
 * The POST to /api/orcamento is intercepted so the test is deterministic and
 * sends no real email/push — same approach as the contacto spec.
 */
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

    // Required: event type + name + email.
    await page.getByRole("button", { name: "Casamento", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Ana Teste");
    await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");

    await page.getByRole("button", { name: /Enviar pedido/ }).click();

    // Hand-off lands on the confirmation page showing the reference id.
    await expect(page).toHaveURL(/\/orcamento\/confirmacao\/LIQ-E2E-TEST$/);
    await expect(page.getByText("LIQ-E2E-TEST")).toBeVisible();
  });

  test("submeter incompleto mostra os erros e não avança", async ({ page }) => {
    await page.goto("/orcamento");

    // The submit stays operable (accessible pattern) — submitting an incomplete
    // form surfaces an announced error instead of a silently disabled button.
    const enviar = page.getByRole("button", { name: /Enviar pedido/ });
    await expect(enviar).toBeEnabled();

    await enviar.click();
    await expect(page.getByText("Selecione o tipo de evento.")).toBeVisible();
    await expect(page).toHaveURL(/\/orcamento$/);

    // Fill the required fields — type, name and a valid email.
    await page.getByRole("button", { name: "Corporativo", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Ana");
    await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
    await expect(enviar).toBeEnabled();
  });

  test("o rascunho sobrevive a sair e voltar à página", async ({ page }) => {
    await page.goto("/orcamento");
    await page.getByRole("button", { name: "Aniversário", exact: true }).click();
    await page.getByPlaceholder("O seu nome").fill("Maria Rascunho");

    // Navigate away and back — the locally saved draft restores the fields.
    await page.goto("/sobre");
    await page.goto("/orcamento");

    await expect(page.getByPlaceholder("O seu nome")).toHaveValue("Maria Rascunho");
    await expect(page.getByRole("button", { name: "Aniversário", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
