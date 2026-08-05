import { test, expect, type BrowserContext, type Page } from "@playwright/test";

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
 * tablet da equipa. `test.skip` quando o login não está disponível (build de
 * produção sem ADMIN_PASSWORD_HASH), como os outros passeios do back office.
 */

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
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

    const loggedIn = await login(page);
    test.skip(
      !loggedIn,
      "Admin login unavailable here (production build without ADMIN_PASSWORD_HASH); CI sets a test hash.",
    );

    const quotesRes = await page.request.get("/api/orcamento");
    const quotes: { id: string }[] = quotesRes.ok() ? await quotesRes.json() : [];
    test.skip(quotes.length === 0, "Sem pedidos nesta instalação — não há estúdio para abrir.");
    const quoteId = quotes[0].id;
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
        const loggedIn2 = await login(page2);
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
