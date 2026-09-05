import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { entrarNoBackOffice } from "./semear-pedido";

/**
 * Back-office secondary-views walk.
 *
 * A companion to admin-smoke: that spec covers the always-visible CORE sidebar
 * items, this one opens the collapsed "Mais" disclosure and walks the SECONDARY
 * destinations tucked behind it (Propostas Aceites, Temas, Estatísticas —
 * labels from nav.tsx's MORE_NAV).
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

// The SECONDARY destinations, tucked behind the collapsed "Mais" group in the
// sidebar (nav.tsx's MORE_NAV). `nav` is the sidebar button label; `heading` is
// the H1 the sticky header shows for that view (AdminClient's VIEW_TITLES).
// admin-smoke already covers every CORE item, so this walk complements it.
const SECONDARY_VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Propostas Aceites$/, heading: /^Propostas Aceites$/ },
  { nav: /^Temas$/, heading: /^Temas$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
];

test.describe("Back office — a marca do destino activo", () => {
  /**
   * ── O FILETE ANDA, E É PRECISO UM BROWSER PARA O VER ──────────────────────
   *
   * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
   * outra, quando se carrega numa coisa e vai-se para outra coisa».
   *
   * Trocar de destino na barra lateral era o gesto mais repetido do dia e o
   * menos visível: o fundo acendia num item e apagava-se noutro, ao mesmo
   * tempo. Passou a haver um filete que DESLIZA de um destino para o outro —
   * o mesmo gesto que o `Segmented` já fazia, numa barra vertical.
   *
   * ── PORQUE É QUE ISTO É UM PASSEIO E NÃO UM TESTE DE UNIDADE ──────────────
   *
   * O filete mede-se: pergunta ao destino activo onde ele está
   * (`offsetTop`/`offsetHeight`) e desliza para lá. Em jsdom não há disposição
   * nenhuma — `offsetParent` é sempre nulo e as medidas são zero —, portanto um
   * teste de unidade não conseguia distinguir «não há filete» de «há filete e
   * está no sítio». Escrevi um, vi-o a falhar por essa razão, e mudei-o para
   * aqui. Um browser tem disposição; é o instrumento certo.
   */
  test("o filete muda de sítio ao trocar de destino, e é sempre o mesmo", async ({ page }) => {
    const loggedIn = await login(page);
    test.skip(
      !loggedIn,
      "Admin login unavailable here (production build without ADMIN_PASSWORD_HASH); CI sets a test hash.",
    );

    const coluna = page.getByRole("navigation", { name: /Navegação do back office/i });
    const filete = coluna.locator('> span[aria-hidden="true"]');

    await expect(filete, "a barra lateral perdeu a marca do destino activo").toHaveCount(1);
    const antes = await filete.evaluate((el) => el.getBoundingClientRect().top);

    await coluna.getByRole("button", { name: /^Pedidos/ }).first().click();
    await expect(page.getByRole("heading", { level: 1, name: /^Pedidos$/ })).toBeVisible();

    // Mudou de sítio…
    await expect
      .poll(() => filete.evaluate((el) => el.getBoundingClientRect().top))
      .not.toBe(antes);

    // …e é UM só. Um filete dentro de cada destino dava o mesmo desenho parado
    // e nenhum percurso — é a maneira mais fácil de partir isto sem se notar.
    await expect(filete).toHaveCount(1);

    // E ASSENTA à altura do destino marcado como página actual.
    //
    // `poll` e não uma leitura só: o filete leva 250 ms a percorrer o caminho,
    // e a primeira versão deste passo media-o A MEIO — dava 4,17 px de
    // diferença e lia-se como desalinhamento quando era, afinal, a animação a
    // funcionar. O que interessa é onde ele PÁRA.
    const activo = coluna.locator('[aria-current="page"]');
    await expect
      .poll(
        async () => {
          const [topoFilete, topoActivo] = await Promise.all([
            filete.evaluate((el) => el.getBoundingClientRect().top),
            activo.first().evaluate((el) => el.getBoundingClientRect().top),
          ]);
          return Math.abs(topoFilete - topoActivo);
        },
        { message: "o filete parou fora do destino activo" },
      )
      .toBeLessThanOrEqual(2);
  });
});

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
      // O <h1> diz que se CHEGOU ao destino — e mais nada. Estava aqui escrito
      // que ele confirma que o chunk montou; não confirma. O título vem do
      // cabeçalho do AdminClient (`VIEW_TITLES`) e aparece no instante do
      // clique, com o esqueleto ainda no lugar da vista. Quem confirma a
      // montagem é o esqueleto ter saído e o <main> ter conteúdo próprio.
      // (Medido no passeio do telemóvel: <h1> visível, sete elementos
      // interactivos na página, todos da navegação.)
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

  // O passeio «Fazer proposta: escolher o cliente abre o estúdio» vivia aqui e
  // mudou-se para `fazer-proposta-cliente.spec.ts`. Não por arrumação: ali
  // saltava SEMPRE («Sem pedidos neste ambiente»), porque este ficheiro corre
  // contra o build de produção do CI, que recusa escritas sem Supabase, e sem
  // escrita não há cartão de cliente para escolher. Passou a semear o seu
  // próprio pedido, o que obriga a um servidor que grave — e este passeio das
  // vistas secundárias, que é read-only, fica onde está a fazer o que só aqui
  // se pode fazer: medir os chunks preguiçosos do build de produção.
});
