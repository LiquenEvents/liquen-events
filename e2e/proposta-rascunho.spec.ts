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

test.describe("Rascunho da proposta", () => {
  test("segue o trabalho para outro dispositivo", async ({ page, browser }) => {
    test.setTimeout(90_000);

    exigirLogin(await entrarNoBackOffice(page));

    const quoteId = await garantirPedido(page);
    const marca = `Maria & Zé ${Date.now().toString(36)}`;

    try {
      // ── Dispositivo 1: escrever ──
      await openStudio(page, quoteId);
      await page
        .getByLabel(/^Clientes$/i)
        .first()
        .fill(marca);

      // A gravação é adiada de propósito (não se grava a cada tecla).
      await expect
        .poll(
          async () => {
            const r = await page.request.get(`/api/orcamento/${quoteId}/proposta-rascunho`);
            return (await r.json())?.draft?.doc?.clientNames ?? null;
          },
          { timeout: 20_000 },
        )
        .toBe(marca);

      // ── Dispositivo 2: contexto novo, sem localStorage nenhum ──
      const other: BrowserContext = await browser.newContext();
      try {
        const page2 = await other.newPage();
        const loggedIn2 = await entrarNoBackOffice(page2);
        expect(loggedIn2, "o segundo dispositivo também entra").toBe(true);
        await openStudio(page2, quoteId);
        await expect(page2.getByLabel(/^Clientes$/i).first()).toHaveValue(marca, {
          timeout: 20_000,
        });
      } finally {
        await other.close();
      }
    } finally {
      // Não deixar o rascunho de teste em cima do trabalho de ninguém.
      await page.request.delete(`/api/orcamento/${quoteId}/proposta-rascunho`);
    }
  });
});
