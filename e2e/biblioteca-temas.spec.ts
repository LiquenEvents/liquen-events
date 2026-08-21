import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

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
 * Não precisa de Supabase — as duas rotas são servidas por nós aqui. Precisa,
 * isso sim, de UM PEDIDO na lista, porque o seletor vive dentro do estúdio e o
 * estúdio abre-se a partir de um cartão de cliente. Esse pedido é criado pelo
 * próprio passeio (`garantirPedido`), o que obriga a um servidor que grave —
 * ver `playwright.dados.config.ts`. Enquanto não o criava, este ficheiro estava
 * VERMELHO e o vermelho ficava escondido no passo `continue-on-error` do CI.
 */

/** Quanto tempo a lista de temas demora a responder, neste teste. */
const ATRASO_LISTA_MS = 1500;

const TEMAS = [
  { id: "tema-a", name: "Tema A", count: 17 },
  { id: "tema-b", name: "Tema B", count: 20 },
];

/**
 * O `exigirLogin` nasceu aqui e mudou-se para `semear-pedido.ts`, para os
 * outros passeios que passaram a semear os seus dados poderem fazer a mesma
 * distinção: fora do CI, uma máquina sem `ADMIN_PASSWORD_HASH` não entra e o
 * teste salta-se; no CI, não entrar é uma avaria e não uma condição do
 * ambiente. Saltar em silêncio ali transformava isto num passo verde que nunca
 * mede nada.
 */

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

    const entrou = await entrarNoBackOffice(page);
    exigirLogin(entrou);

    // O estúdio abre-se a partir de um cartão de cliente — sem pedido nenhum na
    // lista não há cartão, e este passeio falhava em `li button` com a cara de
    // um seletor errado. O pedido é criado aqui, pela porta pública.
    await garantirPedido(page);

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
    await nav
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    const clientes = page.locator("li button");
    // 30 s e não 15: contra o servidor de desenvolvimento, a primeira visita a
    // «Fazer proposta» paga a compilação da rota.
    await expect(clientes.first()).toBeVisible({ timeout: 30000 });
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

    const entrou = await entrarNoBackOffice(page);
    exigirLogin(entrou);

    // O estúdio abre-se a partir de um cartão de cliente — sem pedido nenhum na
    // lista não há cartão, e este passeio falhava em `li button` com a cara de
    // um seletor errado. O pedido é criado aqui, pela porta pública.
    await garantirPedido(page);

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
    await nav
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    const clientes = page.locator("li button");
    // 30 s e não 15: contra o servidor de desenvolvimento, a primeira visita a
    // «Fazer proposta» paga a compilação da rota.
    await expect(clientes.first()).toBeVisible({ timeout: 30000 });
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A 390 PX, COM QUARENTA TEMAS, AS FOTOS TÊM DE ESTAR NO ECRÃ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Isto é o que ela viu, medido no tamanho em que o viu. Palavras dela: «não
 * consigo abrir os temas e escolher, só dá se pesquisar» — a lista de temas não
 * tinha altura máxima nenhuma e empurrava a grelha de fotografias para baixo da
 * dobra; pesquisar funcionava porque encurtava a lista.
 *
 * O teste unitário prende as DECISÕES (começa fechada, tem tecto, rola por
 * dentro). Só um browser a sério mede a consequência delas, que é a única coisa
 * que interessa: a primeira foto tem de caber, inteira, num ecrã de 390×844.
 *
 * ── PORQUE É QUE O PASSEIO NÃO É TODO A 390 PX ───────────────────────────
 *
 * Foi, à primeira tentativa, e esteve 120 s à espera de um botão: a 390 px o
 * menu lateral do back office é `fixed` e vive FORA do ecrã até alguém abrir a
 * gaveta — os destinos do dia estão na barra de baixo. Dava para abrir a gaveta
 * (é o que o `geometria-dos-alvos.spec.ts` faz), mas isso põe metade do passeio
 * a exercitar navegação que não é o que aqui se mede, e cada degrau a mais é um
 * degrau que pode partir por razões que não têm nada a ver com a lista de temas.
 *
 * Em vez disso: o caminho até ao seletor faz-se no tamanho em que os outros dois
 * passeios deste ficheiro já o fazem, e o ecrã encolhe para 390×844 com o
 * diálogo JÁ ABERTO. O que se mede fica exactamente igual — o diálogo é
 * `fixed inset-0` e a lista tem o tecto em `vh`, portanto ambos se refazem no
 * tamanho novo —, e o `hasTouch` continua ligado para os alvos terem a altura
 * que têm no dedo, que é a que enche a lista.
 */
test.describe("Biblioteca de temas — a 390 px", () => {
  // Sem `viewport` aqui de propósito: ver acima. O toque fica, porque é ele que
  // dá aos separadores dos temas a altura que têm no telemóvel.
  test.use({ hasTouch: true });

  /** O ecrã dela. */
  const ECRA = { width: 390, height: 844 };

  /** Quarenta temas, como os dela. */
  const MUITOS = Array.from({ length: 40 }, (_, i) => ({
    id: `tema-${i + 1}`,
    name: `Tema ${i + 1}`,
    notes: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    imageCount: 12,
  }));

  /** Um pixel transparente: a grelha desenha-se na mesma e não se vai à rede. */
  const PIXEL = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";
  const FOTOS = Array.from({ length: 12 }, (_, i) => ({
    path: `tema-1/foto-${i + 1}.jpg`,
    url: PIXEL,
    thumbUrl: PIXEL,
  }));

  test("a primeira foto cabe no ecrã, com a lista de temas cheia", async ({ page, context }) => {
    await context.route("**/api/temas", (route) => route.fulfill({ json: MUITOS }));
    await context.route("**/api/temas/*/imagens**", (route) =>
      route.fulfill({ json: { ok: true, images: FOTOS, total: FOTOS.length, truncated: false } }),
    );
    await context.addInitScript(() => {
      try {
        localStorage.setItem("liquen-tema-recente", "tema-1");
        // De propósito SEM `liquen-temas-abertos`: o que se mede é o que ela
        // encontra da primeira vez, antes de ter escolhido o que quer que seja.
        localStorage.removeItem("liquen-temas-abertos");
      } catch {
        /* ver acima */
      }
    });

    const entrou = await entrarNoBackOffice(page);
    exigirLogin(entrou);
    await garantirPedido(page);

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
    await nav
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    const clientes = page.locator("li button");
    // 30 s e não 15: contra o servidor de desenvolvimento, a primeira visita a
    // «Fazer proposta» paga a compilação da rota.
    await expect(clientes.first()).toBeVisible({ timeout: 30000 });
    await clientes.first().click();

    const abrir = page.getByRole("button", { name: /biblioteca de temas/i }).first();
    await expect(abrir).toBeVisible({ timeout: 20000 });
    await abrir.click();

    // A partir daqui, o ecrã dela.
    const dialogo = page.getByRole("dialog", { name: /biblioteca de temas/i });
    await expect(dialogo).toBeVisible({ timeout: 20000 });
    await page.setViewportSize(ECRA);

    // A lista dos quarenta começa fechada, e diz quantos são sem se abrir.
    const listaDeTemas = page.getByRole("button", { name: "Temas (40)" });
    await expect(listaDeTemas).toBeVisible();
    await expect(listaDeTemas).toHaveAttribute("aria-expanded", "false");

    // E a razão de tudo isto: a primeira foto, INTEIRA, dentro do ecrã.
    const primeira = page.getByRole("button", { name: "Foto 1 de 12" });
    await expect(primeira).toBeVisible();
    const caixa = await primeira.boundingBox();
    expect(caixa, "a primeira foto não tem sítio nenhum no ecrã").not.toBeNull();
    expect(
      caixa!.y + caixa!.height,
      `A primeira foto acaba a ${Math.round(caixa!.y + caixa!.height)}px num ecrã de ` +
        `${ECRA.height} — a lista de temas voltou a empurrar a grelha para fora do ecrã.`,
    ).toBeLessThanOrEqual(ECRA.height);

    // Aberta, continua a caber: é o tecto de altura a fazer o seu trabalho.
    await listaDeTemas.click();
    await expect(listaDeTemas).toHaveAttribute("aria-expanded", "true");
    const comALista = await primeira.boundingBox();
    expect(
      comALista!.y,
      `Com a lista aberta a primeira foto começa a ${Math.round(comALista!.y)}px de ` +
        `${ECRA.height} — sem tecto, quarenta temas voltam a ocupar o ecrã todo.`,
    ).toBeLessThan(ECRA.height);
  });
});
