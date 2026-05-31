import { test, expect } from "@playwright/test";

test.describe("Home", () => {
  test("loads with the brand title", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Líquen/i);
  });

  test("navigates to Serviços from the navbar", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Serviços" }).first().click();
    await expect(page).toHaveURL(/\/servicos/);
  });

  test("contact page renders the enquiry wizard", async ({ page }) => {
    await page.goto("/contacto");
    await expect(
      page.getByRole("heading", { name: /Que tipo de evento/i }),
    ).toBeVisible();
  });
});
