import { test, expect, type Page } from "@playwright/test";

/**
 * O SELETOR DA BIBLIOTECA DE TEMAS NÃO PODE VOLTAR A ESPERAR PELA LISTA.
 *
 * ── O defeito que isto tranca ─────────────────────────────────────────────
 * O `themeId` era decidido só DEPOIS de `/api/temas` responder, e o efeito que
 * pede as fotos depende dele. Resultado: enquanto a lista de temas não
 * chegasse, não se pedia uma única imagem — os separadores com as contagens
 * apareciam logo e a grelha ficava em cinzento durante segundos.
 *
 * O id do último tema já está no `localStorage`, portanto não é preciso
 * perguntar a ninguém: as duas coisas podem ser pedidas ao mesmo tempo.
 *
 * ── Como é que este teste o prova ─────────────────────────────────────────
 * Atrasa `/api/temas` em 1,5 s de propósito e vê quando é que o pedido das
 * IMAGENS parte. Se partir antes de a lista ter respondido, não há
 * encadeamento. É a única forma de o medir sem depender da velocidade da
 * máquina: o atraso é imposto por nós, e o limiar é relativo a ele.
 *
 * Não precisa de Supabase — as duas rotas são servidas por nós aqui.
 */

/** Quanto tempo a lista de temas demora a responder, neste teste. */
const ATRASO_LISTA_MS = 1500;

const TEMAS = [
  { id: "tema-a", name: "Tema A", count: 17 },
  { id: "tema-b", name: "Tema B", count: 20 },
];

/**
 * Fora do CI, uma máquina sem `ADMIN_PASSWORD_HASH` não entra e o teste
 * salta-se — é o que permite corrê-lo à mão sem montar nada. No CI o segredo
 * ESTÁ definido (ver ci.yml), portanto não entrar é uma avaria e não uma
 * condição do ambiente. Saltar em silêncio ali transformava isto num passo
 * verde que nunca mede nada — foi o que aconteceu numa corrida local, e sem
 * esta distinção teria passado despercebido.
 */
function exigirLogin(entrou: boolean): void {
  if (process.env.CI) {
    expect(entrou, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(true);
  } else {
    test.skip(!entrou, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
  }
}

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin", { waitUntil: "domcontentloaded" });
  const nome = page.getByLabel(/O teu email/i);
  if ((await nome.count()) > 0) {
    await nome.fill("catarina@liquen-events.com");
    await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
    await page.getByRole("button", { name: /^Entrar$/ }).click();
  }
  return page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
}

test.describe("Biblioteca de temas — abrir", () => {
  test("as fotos são pedidas SEM esperar pela lista de temas", async ({ page, context }) => {
    // A lista responde tarde. As imagens não podem ficar à espera dela.
    await context.route("**/api/temas", async (route) => {
      await new Promise((r) => setTimeout(r, ATRASO_LISTA_MS));
      await route.fulfill({ json: TEMAS });
    });
    await context.route("**/api/temas/*/imagens**", (route) =>
      route.fulfill({ json: { ok: true, images: [], total: 0, truncated: false } }),
    );
    // O último tema usado — é daqui que sai o palpite que dispensa a espera.
    await context.addInitScript(() => {
      try {
        localStorage.setItem("liquen-tema-recente", "tema-a");
      } catch {
        /* sem localStorage o teste não tem sentido; a asserção abaixo dirá */
      }
    });

    const entrou = await login(page);
    exigirLogin(entrou);

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
    await nav
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    const clientes = page.locator("li button");
    await expect(clientes.first()).toBeVisible({ timeout: 15000 });
    await clientes.first().click();

    const abrir = page.getByRole("button", { name: /biblioteca de temas/i }).first();
    await expect(abrir).toBeVisible({ timeout: 20000 });

    // A partir daqui conta-se o tempo.
    const pedidos: { tipo: "lista" | "imagens"; t: number }[] = [];
    const t0 = Date.now();
    page.on("request", (r) => {
      const u = r.url();
      if (!u.includes("/api/temas")) return;
      pedidos.push({ tipo: u.includes("imagens") ? "imagens" : "lista", t: Date.now() - t0 });
    });

    await abrir.click();
    // Espera o suficiente para a lista já ter respondido — e para um pedido de
    // imagens encadeado já ter aparecido, se ainda existisse.
    await page.waitForTimeout(ATRASO_LISTA_MS + 1200);

    const imagens = pedidos.filter((p) => p.tipo === "imagens");
    expect(imagens.length, "as fotos nunca chegaram a ser pedidas").toBeGreaterThan(0);

    const primeira = Math.min(...imagens.map((p) => p.t));
    expect(
      primeira,
      `O pedido das fotos partiu a +${primeira}ms, e a lista de temas só responde a ` +
        `+${ATRASO_LISTA_MS}ms — ou seja, está outra vez à espera dela. ` +
        `O id do último tema está no localStorage e dispensa essa espera.`,
    ).toBeLessThan(ATRASO_LISTA_MS);
  });

  test("a lista a chegar NÃO faz repedir as fotos que já vinham a caminho", async ({
    page,
    context,
  }) => {
    // Regressão medida: com `themes` nas dependências do efeito das imagens, a
    // chegada da lista disparava um terceiro pedido às MESMAS fotos. O ganho de
    // pedir cedo perdia-se num pedido a mais.
    await context.route("**/api/temas", async (route) => {
      await new Promise((r) => setTimeout(r, ATRASO_LISTA_MS));
      await route.fulfill({ json: TEMAS });
    });
    await context.route("**/api/temas/*/imagens**", (route) =>
      route.fulfill({ json: { ok: true, images: [], total: 0, truncated: false } }),
    );
    await context.addInitScript(() => {
      try {
        localStorage.setItem("liquen-tema-recente", "tema-a");
      } catch {
        /* ver acima */
      }
    });

    const entrou = await login(page);
    exigirLogin(entrou);

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
    await nav
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    const clientes = page.locator("li button");
    await expect(clientes.first()).toBeVisible({ timeout: 15000 });
    await clientes.first().click();

    const abrir = page.getByRole("button", { name: /biblioteca de temas/i }).first();
    await expect(abrir).toBeVisible({ timeout: 20000 });

    const urls: string[] = [];
    page.on("request", (r) => {
      if (r.url().includes("/imagens")) urls.push(r.url());
    });

    await abrir.click();
    await page.waitForTimeout(ATRASO_LISTA_MS + 1500);

    // Em `next dev` o React desdobra os efeitos (StrictMode), por isso o mesmo
    // pedido aparece duas vezes de forma legítima. O que NÃO pode acontecer é
    // uma ronda extra depois de a lista chegar — o teto é o dobro do que uma
    // abertura precisa.
    const doTemaA = urls.filter((u) => u.includes("tema-a"));
    expect(
      doTemaA.length,
      `As fotos do tema activo foram pedidas ${doTemaA.length} vezes numa só ` +
        `abertura. A lista a chegar não pode fazer repedir o que já vinha a caminho.`,
    ).toBeLessThanOrEqual(2);
  });
});
