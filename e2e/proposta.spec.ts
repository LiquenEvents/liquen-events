import { test, expect } from "@playwright/test";

/**
 * Public proposal link (/proposta/[token]). The token is the only authorisation,
 * so the most important behaviours to guard are: a bad/forged token never leaks
 * a proposal, and the page is kept out of search indexes.
 */
test.describe("Proposta — link público", () => {
  test("um token inválido mostra uma mensagem amigável e não revela qualquer proposta", async ({
    page,
  }) => {
    await page.goto("/proposta/token-obviamente-invalido");
    await expect(page.getByRole("heading", { name: /inválido ou expirado/i })).toBeVisible();
    // Nunca deve aparecer o CTA de resposta para um token inválido.
    await expect(page.getByRole("button", { name: /aceitar proposta/i })).toHaveCount(0);
  });

  test("a página é noindex (link privado por cliente)", async ({ page }) => {
    await page.goto("/proposta/qualquer-coisa");
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/i);
  });
});
