import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * FAZER PROPOSTA — da lista de clientes ao estúdio, e a volta atrás.
 *
 * O ecrã existe para um trabalho só, e esse trabalho tem dois passos. O que
 * aqui se prova é o percurso inteiro: da lista de clientes ao estúdio já
 * preenchido com os dados daquele pedido, e a volta atrás.
 *
 * ── Porque é que isto é um ficheiro à parte ───────────────────────────────
 * Vivia dentro do `admin-views.spec.ts`, e ali SALTAVA sempre — «Sem pedidos
 * neste ambiente — não há cliente para escolher» —, porque o CI corre aquele
 * ficheiro contra o build de produção, que recusa escritas sem Supabase
 * (`assertWritableInProd`, src/lib/repository.ts). Um passeio que salta sempre
 * é cobertura imaginária.
 *
 * Mudar o `admin-views.spec.ts` inteiro para o servidor de desenvolvimento
 * resolvia isto e estragava outra coisa: o passeio das vistas secundárias que
 * lá ficou é READ-ONLY e passa contra produção, que é precisamente onde os
 * chunks preguiçosos e a divisão de pacotes se provam. Perder essa medição
 * para arranjar esta seria trocar um buraco por outro. Por isso saiu só o
 * passeio que precisa de gravar — e traz o seu pedido consigo.
 */

// Ruído de consola que não é defeito: dicas do React em desenvolvimento,
// pedidos que legitimamente dão 404 num ambiente sem dados, e recursos de
// terceiros inalcançáveis na rede onde o teste corre. Espelha a lista do
// admin-smoke / admin-views.
const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
];

function isIgnored(text: string): boolean {
  return IGNORED_CONSOLE.some((re) => re.test(text));
}

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

test.describe("Back office — fazer proposta", () => {
  test("escolher o cliente abre o estúdio nesse mesmo ecrã", async ({ page }) => {
    test.setTimeout(90_000);
    const errors = collectErrors(page);
    exigirLogin(await entrarNoBackOffice(page));

    // O pedido que dá o cartão de cliente do passo 1. Sem ele não há nada para
    // escolher, e era aqui que este passeio se saltava a si próprio.
    await garantirPedido(page);

    const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
    await sidebar
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .click();
    await expect(page.getByRole("heading", { level: 1, name: /^Fazer proposta$/ })).toBeVisible();

    // Passo 1 — a lista de para-quem.
    await expect(page.getByText(/Passo 1 de 2/)).toBeVisible();
    const clientes = page.locator("li button");
    await expect(clientes.first()).toBeVisible({ timeout: 15000 });

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
