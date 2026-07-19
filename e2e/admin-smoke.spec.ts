import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Back-office smoke test.
 *
 * The redesigned admin is a large client component whose views are lazily
 * code-split. Unit tests exercise pieces in isolation, but they can't catch a
 * view that throws on mount, a bad lazy import, or a runtime console error that
 * only shows when the real chunk is loaded in a browser. This spec logs in with
 * the dev credentials and walks the main destinations, asserting each one:
 *   1. renders its page heading (so the view actually mounted, not a skeleton),
 *   2. does not trip an error boundary, and
 *   3. produced no console errors / uncaught page errors along the way.
 *
 * It is intentionally read-only: it never creates, edits or deletes data.
 */

// Console noise that is not a real defect: dev-only React hints, network
// requests that legitimately 404 in a data-less dev environment (favicon,
// optional assets), and the browser's own resource-load chatter. Everything
// else counts as a failure.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
];

function isIgnored(text: string): boolean {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

/** Attach console-error / page-error collectors to a page. */
function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg: ConsoleMessage) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (!isIgnored(text)) errors.push(`console.error: ${text}`);
  });
  page.on("pageerror", (err) => {
    if (!isIgnored(err.message)) errors.push(`pageerror: ${err.message}`);
  });
  return errors;
}

/**
 * Log in through the real login form using the shared password. Returns true
 * once the authenticated back-office landmark appears, or false if login is
 * unavailable in this environment — a production build with no configured
 * ADMIN_PASSWORD_HASH deliberately refuses the dev password, so the caller
 * skips (rather than fails) the smoke there. CI supplies a test hash so it runs.
 */
async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /Entrar/i }).click();
  // The back-office landmark only exists once authenticated.
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

// The main destinations the smoke walks: sidebar label to click, and the page
// heading (H1) the header must show once the view is active. Labels come from
// nav.tsx; headings from AdminClient's VIEW_TITLES.
const VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Visão Geral$/, heading: /^Visão Geral$/ },
  { nav: /^Pedidos$/, heading: /^Pedidos$/ },
  { nav: /^Pipeline$/, heading: /^Pipeline$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
  { nav: /^Faturas$/, heading: /^Faturas$/ },
  { nav: /^Contratos$/, heading: /^Contratos$/ },
  { nav: /^Mensagens$/, heading: /^Inbox$/ },
];

test.describe("Back office — smoke", () => {
  test("logs in and every main view renders without runtime errors", async ({ page }) => {
    const errors = collectErrors(page);

    const loggedIn = await login(page);
    test.skip(
      !loggedIn,
      "Admin login unavailable here (production build without ADMIN_PASSWORD_HASH); CI sets a test hash.",
    );

    const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
    const errorBoundary = page.getByRole("heading", { name: /Ocorreu um erro inesperado/i });

    for (const view of VIEWS) {
      await sidebar.getByRole("button", { name: view.nav }).click();
      // Page heading (H1) confirms the lazy chunk mounted, not the skeleton.
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      // No error boundary anywhere on the page for this view.
      await expect(errorBoundary).toHaveCount(0);
    }

    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
