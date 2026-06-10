import { test, expect } from "@playwright/test";

/**
 * The English mirror (/en/*) must serve the same pages in English under a
 * crawlable URL, with reciprocal hreflang so search engines index both.
 */
test.describe("i18n — espelho inglês (/en)", () => {
  test("/en/sobre serve o locale inglês", async ({ page }) => {
    await page.goto("/en/sobre");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    // Self-canonical para a própria URL EN.
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/en\/sobre$/);
  });

  test("a página portuguesa fica pt-PT e aponta o seu alternate inglês", async ({ page }) => {
    await page.goto("/sobre");
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT");
    await expect(page.locator('link[hreflang="en"]')).toHaveAttribute("href", /\/en\/sobre$/);
    await expect(page.locator('link[hreflang="x-default"]')).toHaveAttribute("href", /\/sobre$/);
  });

  test("o seletor de idioma leva à URL /en e de volta", async ({ page }) => {
    // Target by visible text ("PT"/"EN") so it works whatever the page language.
    const toggle = () => page.getByRole("group", { name: /idioma|language/i }).first();

    await page.goto("/sobre");
    await toggle().getByText("EN", { exact: true }).click();
    await page.waitForURL((url) => url.pathname === "/en/sobre", { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "en", { timeout: 15_000 });

    await toggle().getByText("PT", { exact: true }).click();
    // NB: an "ends with /sobre" regex would also match /en/sobre and pass while
    // still on the mirror — match the exact pathname and wait out slow dev
    // compiles before asserting the language.
    await page.waitForURL((url) => url.pathname === "/sobre", { timeout: 15_000 });
    await expect(page.locator("html")).toHaveAttribute("lang", "pt-PT", { timeout: 15_000 });
  });
});
