import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";

/**
 * Back-office secondary-views walk.
 *
 * A companion to admin-smoke: that spec covers the always-visible CORE sidebar
 * items, this one opens the collapsed "Mais" disclosure and walks the SECONDARY
 * destinations tucked behind it (Faturas, Propostas Aceites, Temas,
 * Estatísticas — labels from nav.tsx's
 * MORE_NAV).
 * For each it asserts:
 *   1. its page heading (H1) renders, so the lazy chunk mounted (not a skeleton),
 *   2. no error boundary ("Ocorreu um erro inesperado") tripped, and
 *   3. no console errors / uncaught page errors accumulated along the way.
 * It also best-effort opens the "?" help/glossary dialog.
 *
 * It is intentionally read-only: it never creates, edits or deletes data, and it
 * is resilient — a label/view that isn't found is skipped, not failed. Like
 * admin-smoke, the whole spec `test.skip`s when login is unavailable (a
 * production build without ADMIN_PASSWORD_HASH refuses the dev password).
 */

// Console noise that is not a real defect: dev-only React hints, network
// requests that legitimately 404 in a data-less dev environment (favicon,
// optional assets), and the browser's own resource-load chatter. Everything
// else counts as a failure. Mirrors admin-smoke's allowlist.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  // Recursos de terceiros (analytics) inalcançáveis na rede onde o teste corre
  // — condição do ambiente, não defeito da aplicação. Um erro lançado pelo
  // nosso próprio código continua a falhar o passeio.
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
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
 * skips (rather than fails) the walk there. CI supplies a test hash so it runs.
 */
async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
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

// The SECONDARY destinations, tucked behind the collapsed "Mais" group in the
// sidebar (nav.tsx's MORE_NAV). `nav` is the sidebar button label; `heading` is
// the H1 the sticky header shows for that view (AdminClient's VIEW_TITLES).
// admin-smoke already covers every CORE item, so this walk complements it.
const SECONDARY_VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Faturas$/, heading: /^Faturas$/ },
  { nav: /^Propostas Aceites$/, heading: /^Propostas Aceites$/ },
  { nav: /^Temas$/, heading: /^Temas$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
];

test.describe("Back office — secondary views", () => {
  test("walks the 'Mais' destinations and help without runtime errors", async ({ page }) => {
    const errors = collectErrors(page);

    const loggedIn = await login(page);
    test.skip(
      !loggedIn,
      "Admin login unavailable here (production build without ADMIN_PASSWORD_HASH); CI sets a test hash.",
    );

    const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
    const errorBoundary = page.getByRole("heading", { name: /Ocorreu um erro inesperado/i });

    // The secondary items live behind a collapsed "Mais" disclosure. Expand it if
    // present and still collapsed; clicking a "Mais" view also auto-opens it, but
    // opening up-front makes the buttons clickable and keeps the walk resilient.
    const maisToggle = sidebar.getByRole("button", { name: /^Mais$/ });
    if ((await maisToggle.count()) > 0) {
      const expanded = await maisToggle.first().getAttribute("aria-expanded");
      if (expanded !== "true") {
        await maisToggle.first().click();
      }
    }

    for (const view of SECONDARY_VIEWS) {
      const navButton = sidebar.getByRole("button", { name: view.nav });
      // Resilient: a label that isn't present (renamed/removed view) is skipped,
      // not failed — the walk observes what's there rather than assuming a fixed set.
      if ((await navButton.count()) === 0) continue;

      await navButton.first().click();
      // Page heading (H1) confirms the lazy chunk mounted, not the skeleton.
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      // No error boundary anywhere on the page for this view.
      await expect(errorBoundary).toHaveCount(0);
    }

    // Best-effort: the "?" trigger opens the onboarding help / glossary dialog.
    // Guarded so a missing trigger simply skips rather than failing the walk.
    const helpTrigger = page.getByRole("button", { name: /Ajuda e glossário/i });
    if ((await helpTrigger.count()) > 0) {
      await helpTrigger.first().click();
      const helpDialog = page.getByRole("dialog", { name: /Ajuda e glossário/i });
      await expect(helpDialog).toBeVisible();
      // Close it again (Escape) so no lingering modal skews later assertions.
      await page.keyboard.press("Escape");
      await expect(helpDialog).toHaveCount(0);
    }

    // One consolidated assertion: nothing unexpected hit the console the whole walk.
    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
  test("Fazer proposta: escolher o cliente abre o estúdio nesse mesmo ecrã", async ({ page }) => {
    // O ecrã existe para um trabalho só, e esse trabalho tem dois passos. O que
    // aqui se prova é o percurso inteiro: da lista de clientes ao estúdio já
    // preenchido com os dados daquele pedido, e a volta atrás.
    const errors = collectErrors(page);
    const loggedIn = await login(page);
    test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");

    const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
    await sidebar
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /^Fazer proposta$/ })).toBeVisible();

    // Passo 1 — a lista de para-quem.
    await expect(page.getByText(/Passo 1 de 2/)).toBeVisible();
    const clientes = page.locator("li button");
    const quantos = await clientes.count();
    test.skip(quantos === 0, "Sem pedidos neste ambiente — não há cliente para escolher.");

    // Passo 2 — o estúdio, para aquele cliente.
    await clientes.first().click();
    await expect(page.getByText(/Proposta para/)).toBeVisible();
    // O estúdio montou mesmo (o chunk é preguiçoso) e traz o fluxo dos 3 passos.
    await expect(page.getByRole("button", { name: /Pré-visualizar/ }).first()).toBeVisible({
      timeout: 15000,
    });

    // E dá para trocar de cliente sem sair do ecrã.
    await page.getByRole("button", { name: /Trocar de cliente/ }).click();
    await expect(page.getByText(/Passo 1 de 2/)).toBeVisible();

    expect(errors, `Erros inesperados:\n${errors.join("\n")}`).toEqual([]);
  });
});
