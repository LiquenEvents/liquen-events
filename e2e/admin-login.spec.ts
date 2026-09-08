import { test, expect } from "@playwright/test";

/**
 * The admin dashboard is gated. Unauthenticated visitors get the login screen,
 * and wrong credentials are rejected (real endpoint, no side effects).
 */
test.describe("Admin login", () => {
  test("shows the login screen when unauthenticated", async ({ page }) => {
    await page.goto("/orcamento/admin");
    await expect(page.getByText(/Área Restrita/i)).toBeVisible();
    await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  });

  test("rejects an incorrect password", async ({ page }) => {
    await page.goto("/orcamento/admin");
    // Pelo `name`: o rótulo «Palavra-passe» é agora partilhado com o botão de
    // mostrar/ocultar, e o botão de entrar diz por que caminho se entra.
      /* O formulário passou a estar fechado por omissão — dois estados, com a
         palavra-passe atrás de um link (`docs/LOGIN.md`). Abre-se primeiro; o link
         só existe onde o browser sabe o que é uma chave de acesso. */
      await page
        .getByRole("button", { name: /^Entrar com palavra-passe$/ })
        .click({ timeout: 5_000 })
        .catch(() => {});
    await page.getByLabel(/^Email$/i).fill("intruso@exemplo.pt");
    await page.locator('input[name="password"]').fill("definitely-wrong");
    await page.getByRole("button", { name: /^Entrar$/ }).click();
    // The server replies "Credenciais incorretas" for a bad login.
    await expect(page.getByText(/incorret/i)).toBeVisible();
  });
});
