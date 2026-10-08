import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * O rascunho da proposta vive no SERVIDOR, não no navegador.
 *
 * O que este passeio protege, e que nenhum teste de unidade apanha: montar
 * meia proposta num computador e continuá-la noutro. Até aqui a montagem
 * (mood boards, fotos colocadas, textos, valores) ficava só no `localStorage`
 * — mudar de dispositivo, ou limpar o histórico, perdia o trabalho.
 *
 * Corre com um SEGUNDO contexto de browser, que é a única forma honesta de o
 * afirmar: contexto novo = cookies e `localStorage` novos, exatamente como o
 * tablet da equipa.
 *
 * ── O pedido é criado, não procurado ──────────────────────────────────────
 * Isto saltava com «Sem pedidos nesta instalação» — sempre, porque a lista de
 * pedidos começa vazia (o armazém em ficheiro não é versionado) e o servidor de
 * produção do CI recusa escritas sem Supabase. Um passeio que salta sempre é cobertura
 * imaginária. Agora semeia o seu pedido (`garantirPedido`) e corre com servidor
 * próprio, que grava — ver `playwright.dados.config.ts`.
 */

async function openStudio(page: Page, quoteId: string): Promise<void> {
  await page.goto(`/orcamento/admin/evento/${quoteId}`);
  await expect(page.getByText(/Estúdio de propostas/i).first()).toBeVisible({ timeout: 20000 });
  // Esperar que o React assuma o formulário: escrever antes disso mexe no DOM
  // e não no estado, e a gravação nunca chegaria a acontecer.
  await page.waitForTimeout(1500);
}

/**
 * Abrir a secção, se ela abriu dobrada.
 *
 * O estúdio passou a abrir DOBRADAS as secções que já estavam feitas quando a
 * proposta abriu — e uma proposta nova nasce com o «Evento» preenchido a partir
 * do pedido (nome, data e local vêm de lá), portanto nasce fechado.
 *
 * Não é um remendo ao teste: é o teste a fazer o gesto que ela faz. O que se
 * mede aqui é o rascunho a seguir para outro dispositivo, e para isso é preciso
 * escrever num campo — que é o que ela faria depois de abrir a secção.
 */
async function abrirSeccao(page: Page, id: string) {
  const cartao = page.locator(`#seccao-${id}`);
  await expect(cartao).toBeVisible({ timeout: 20000 });
  const dobra = cartao.locator("[aria-expanded]").first();
  if ((await dobra.getAttribute("aria-expanded")) === "false") await dobra.click();
  await expect(dobra).toHaveAttribute("aria-expanded", "true");
}

test.describe("Rascunho da proposta", () => {
  test("segue o trabalho para outro dispositivo", async ({ page, browser }) => {
    test.setTimeout(90_000);
    // Cada gesto com tecto próprio. Sem isto, um campo que não aparece espera
    // até ao fim dos 90 s e quem leva a culpa é a limpeza do `finally` — foi o
    // que o CI mostrou: «apiRequestContext.delete: Test timeout», e nem uma
    // palavra sobre o passo que de facto ficou parado.
    page.setDefaultTimeout(20_000);

    exigirLogin(await entrarNoBackOffice(page));

    const quoteId = await garantirPedido(page);
    const marca = `Maria & Zé ${Date.now().toString(36)}`;

    try {
      // ── Dispositivo 1: escrever ──
      await openStudio(page, quoteId);
      await abrirSeccao(page, "evento");
      await page
        .getByLabel(/^Clientes$/i)
        .first()
        .fill(marca);
      // E os Serviços — o achado n.º 1 da auditoria: o segundo dispositivo
      // abria com os Clientes certos e os Serviços VAZIOS, e gravava o vazio
      // por cima. Carimbar ids nas linhas ao abrir contava como «ela escreveu».
      await abrirSeccao(page, "servicos");
      await page.getByLabel("Título do grupo 1", { exact: true }).fill(`Título ${marca}`);
      await page.getByLabel("Linha 1 do grupo 1", { exact: true }).fill(`Linha ${marca}`);

      // A gravação é adiada de propósito (não se grava a cada tecla).
      await expect
        .poll(
          async () => {
            const r = await page.request.get(`/api/orcamento/${quoteId}/proposta-rascunho`);
            const doc = (await r.json())?.draft?.doc;
            return [doc?.clientNames ?? null, doc?.serviceGroups?.[0]?.items?.[0]?.label ?? null];
          },
          { timeout: 20_000 },
        )
        .toEqual([marca, `Linha ${marca}`]);

      // ── Dispositivo 2: contexto novo, sem localStorage nenhum ──
      const other: BrowserContext = await browser.newContext();
      try {
        const page2 = await other.newPage();
        page2.setDefaultTimeout(20_000);
        const loggedIn2 = await entrarNoBackOffice(page2);
        expect(loggedIn2, "o segundo dispositivo também entra").toBe(true);
        await openStudio(page2, quoteId);
        await abrirSeccao(page2, "evento");
        await expect(page2.getByLabel(/^Clientes$/i).first()).toHaveValue(marca, {
          timeout: 20_000,
        });
        await abrirSeccao(page2, "servicos");
        await expect(page2.getByLabel("Título do grupo 1", { exact: true })).toHaveValue(
          `Título ${marca}`,
        );
        await expect(page2.getByLabel("Linha 1 do grupo 1", { exact: true })).toHaveValue(
          `Linha ${marca}`,
        );
        // E abrir não pode ter gravado nada por cima: dá tempo à gravação
        // adiada do segundo dispositivo e volta a perguntar ao servidor.
        await page2.waitForTimeout(3000);
        const r = await page2.request.get(`/api/orcamento/${quoteId}/proposta-rascunho`);
        expect((await r.json())?.draft?.doc?.serviceGroups?.[0]?.title).toBe(`Título ${marca}`);
      } finally {
        await other.close();
      }
    } finally {
      // Não deixar o rascunho de teste em cima do trabalho de ninguém. Com
      // tecto e sem lançar: uma limpeza que falha não pode tapar o erro do
      // passo que falhou antes dela — em JavaScript, o que o `finally` lança
      // substitui o que vinha de trás.
      await page.request
        .delete(`/api/orcamento/${quoteId}/proposta-rascunho`, { timeout: 10_000 })
        .catch((e) => console.warn("limpeza do rascunho de teste falhou:", String(e)));
    }
  });
});
