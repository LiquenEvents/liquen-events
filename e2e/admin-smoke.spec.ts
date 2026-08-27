import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { entrarNoBackOffice } from "./semear-pedido";

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
 * skips (rather than fails) the smoke there. CI supplies a test hash so it runs.
 */
async function login(page: Page): Promise<boolean> {
  // Pelo ajudante partilhado: com a sessão guardada pelo
  // `sessao-admin.setup.ts` ele encontra o painel aberto e não gasta entrada
  // nenhuma no tecto de oito por minuto. Sem sessão — uma máquina sem
  // `ADMIN_PASSWORD_HASH` — enche o formulário como sempre encheu.
  //
  // As cinco cópias à mão que aqui estavam esperavam por um «Painel de Gestão»
  // que deixa de aparecer assim que há sessão, e cada uma delas entrava outra
  // vez: era essa repetição que trancava a suite à porta a meio da passagem.
  return entrarNoBackOffice(page);
}

// The main destinations the smoke walks: sidebar label to click, and the page
// heading (H1) the header must show once the view is active. Labels come from
// nav.tsx; headings from AdminClient's VIEW_TITLES.
// The always-visible core sidebar items (the rest live under a collapsed "Mais"
// group). Walking the core covers the daily-use screens without depending on the
// disclosure state. `nav` is the sidebar label; `heading` is the H1 the sticky
// header shows for that view (AdminClient's VIEW_TITLES).
const VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Visão Geral$/, heading: /^Visão Geral$/ },
  // O «Pedidos» leva o contador de quem espera resposta no nome acessível —
  // «Pedidos, 4 por responder». Ancorado só no princípio, portanto: com o
  // `$` no fim, este smoke passava num estúdio vazio e falhava assim que
  // houvesse trabalho, que é o estado normal.
  { nav: /^Pedidos\b/, heading: /^Pedidos$/ },
  { nav: /^Propostas$/, heading: /^Propostas$/ },
  { nav: /^Calendário$/, heading: /^Calendário$/ },
  { nav: /^Tarefas$/, heading: /^Tarefas$/ },
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
      // O <h1> diz que se CHEGOU ao destino — e mais nada.
      //
      // Estava aqui escrito que ele "confirma que o chunk montou, e não o
      // esqueleto". Não confirma: o título é desenhado pelo AdminClient, no
      // cabeçalho, a partir de `VIEW_TITLES`, e aparece no instante do clique
      // com o chunk ainda a caminho. MEDIDO no passeio do telemóvel: com o
      // <h1> já visível, a página tinha SETE elementos interactivos — os da
      // navegação — e zero da vista.
      //
      // A prova de que a vista montou é o esqueleto ter SAÍDO (o `ViewSkeleton`
      // marca-se com `data-view-skeleton`) e o <main> ter conteúdo próprio.
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      await expect(
        page.locator("[data-view-skeleton]"),
        `"${view.heading.source}": o esqueleto ficou no ecrã — o chunk da vista não montou.`,
      ).toHaveCount(0);
      await expect
        .poll(() => page.locator("main :is(a[href],button,input,select,textarea)").count(), {
          message: `"${view.heading.source}": o <main> não tem nada de interactivo — a vista não montou.`,
        })
        .toBeGreaterThan(0);
      // No error boundary anywhere on the page for this view.
      await expect(errorBoundary).toHaveCount(0);
    }

    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
