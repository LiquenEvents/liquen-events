import { test, expect } from "@playwright/test";

/**
 * Drives the 4-step contact wizard end to end. The POST to /api/contacto is
 * intercepted so the test is deterministic and sends no real email/push.
 */
test.describe("Contact wizard", () => {
  test("completes all steps and shows the success screen", async ({ page }) => {
    await page.route("**/api/contacto", (route) =>
      route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "ok" }) }),
    );

    await page.goto("/contacto");

    // Step 1 — event type
    await page.getByRole("button", { name: /Corporativo/ }).click();
    await page.getByRole("button", { name: /Continuar/ }).click();

    // Step 2 — contact details
    await page.getByPlaceholder("O seu nome completo").fill("Ana Teste");
    await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
    await page.getByRole("button", { name: /Continuar/ }).click();

    // Step 3 — details (all optional)
    await page.getByRole("button", { name: /Continuar/ }).click();

    // Step 4 — message + submit
    await page.locator("textarea").fill("Gostaríamos de organizar uma conferência para 200 pessoas.");
    await page.getByRole("button", { name: /Enviar Pedido/ }).click();

    await expect(page.getByText(/Mensagem/i).first()).toBeVisible();
    await expect(page.getByText(/Enviado com sucesso/i)).toBeVisible();
  });

  test("blocks progress until name and email are provided", async ({ page }) => {
    await page.goto("/contacto");
    await page.getByRole("button", { name: /Corporativo/ }).click();
    await page.getByRole("button", { name: /Continuar/ }).click();

    // On step 2 the Continuar button is disabled with empty contact fields.
    const continuar = page.getByRole("button", { name: /Continuar/ });
    await expect(continuar).toBeDisabled();

    await page.getByPlaceholder("O seu nome completo").fill("Ana");
    await page.getByPlaceholder("email@exemplo.com").fill("ana@exemplo.pt");
    await expect(continuar).toBeEnabled();
  });
});
