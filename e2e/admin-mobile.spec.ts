import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Mobile back-office smoke test (~390px phone, touch).
 *
 * The daily driver for this back office is often a phone. This spec logs in on a
 * phone-sized, touch-enabled viewport and, for each destination, asserts:
 *   1. the view mounts (its H1 shows),
 *   2. the page does NOT scroll horizontally (the #1 "not adapted" smell), and
 *   3. no console / page errors fire.
 * It also checks the mobile menu button opens the full navigation, since on a
 * phone the sidebar is off-canvas. Read-only: never creates/edits/deletes data.
 */

test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /is using quality/i, // next/image quality hint — not a runtime defect
  // Recursos de terceiros (analytics) inalcançáveis na rede onde o teste corre
  // — condição do ambiente, não defeito da aplicação. Um erro lançado pelo
  // nosso próprio código continua a falhar o passeio. (Igual aos outros passeios.)
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
];
const isIgnored = (t: string) => IGNORED_CONSOLE.some((re) => re.test(t));

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !isIgnored(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => {
    if (!isIgnored(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Assert the document does not scroll sideways on this phone width. */
async function expectNoHorizontalOverflow(page: Page, label: string) {
  const { scrollW, clientW } = await page.evaluate(() => ({
    scrollW: document.documentElement.scrollWidth,
    clientW: document.documentElement.clientWidth,
  }));
  expect(scrollW, `Horizontal overflow on "${label}": ${scrollW} > ${clientW}`).toBeLessThanOrEqual(
    clientW + 1,
  );
}

// nav label → H1 heading. The five core items plus the "Mais" destinations whose
// wide tables and image grids are the likeliest to push the page sideways on a
// phone (Faturas, Propostas Aceites, Organização de propostas, Temas,
// Estatísticas). Every label here must exist in nav.tsx — a destination that
// isn't in the sidebar can't be walked.
const VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Visão Geral$/, heading: /^Visão Geral$/ },
  { nav: /^Pedidos$/, heading: /^Pedidos$/ },
  { nav: /^Propostas$/, heading: /^Propostas$/ },
  { nav: /^Faturas$/, heading: /^Faturas$/ },
  { nav: /^Propostas Aceites$/, heading: /^Propostas Aceites$/ },
  { nav: /^Calendário$/, heading: /^Calendário$/ },
  { nav: /^Organização de propostas$/, heading: /^Organização de propostas$/ },
  { nav: /^Temas$/, heading: /^Temas$/ },
  { nav: /^Tarefas$/, heading: /^Tarefas$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
];

test.describe("Back office — mobile", () => {
  test("phone: every view mounts, no horizontal overflow, no runtime errors", async ({ page }) => {
    const errors = collectErrors(page);
    const loggedIn = await login(page);
    test.skip(!loggedIn, "Admin login unavailable here (prod build without ADMIN_PASSWORD_HASH).");

    // On a phone the initial content must not already scroll sideways.
    await expectNoHorizontalOverflow(page, "Visão Geral (initial)");

    const errorBoundary = page.getByRole("heading", { name: /Ocorreu um erro inesperado/i });

    for (const view of VIEWS) {
      // Sidebar is off-canvas on mobile — open it via the top-bar menu button.
      await page.getByRole("button", { name: /Abrir menu/i }).click();
      const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
      await expect(sidebar).toBeVisible();
      // Reveal the "Mais" group if the destination isn't a core item.
      const item = sidebar.getByRole("button", { name: view.nav });
      if ((await item.count()) === 0) {
        await sidebar.getByRole("button", { name: /^Mais$/ }).click();
      }
      // Say which label is missing instead of waiting out the 30s click timeout:
      // when a destination leaves the sidebar, that diagnosis should be free.
      await expect(
        item,
        `Sidebar has no "${view.nav.source}" button — is it still in nav.tsx?`,
      ).toHaveCount(1);
      await item.first().click();
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      await expect(errorBoundary).toHaveCount(0);
      await expectNoHorizontalOverflow(page, view.nav.source);
    }

    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
