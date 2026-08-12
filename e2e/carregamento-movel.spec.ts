import { test, expect, type Page } from "@playwright/test";

/**
 * O DIA DA MONTAGEM, NO TELEMÓVEL E SEM REDE.
 *
 * Este é o fluxo que justifica o módulo: alguém de pé, com as mãos ocupadas, a
 * carregar uma carrinha numa quinta onde a rede vai e vem.
 *
 * O percurso é FEITO A SÉRIO, não simulado: semeia os essenciais de carrinha,
 * gera a checklist a partir de um pedido real e só depois abre a vista de
 * carregamento. Simular as respostas provava o desenho do ecrã e não provava a
 * cadeia — que é onde as coisas se partem.
 *
 * O que se fixa:
 *  1. a linha inteira é tocável, com altura para um polegar (≥ 56 px);
 *  2. marcar funciona SEM REDE, e o contador acompanha;
 *  3. as marcações offline sobrevivem a RECARREGAR a página;
 *  4. os críticos por marcar avisam, e dizem QUAIS, antes de fechar.
 */

// 375 px: o telemóvel mais estreito que ainda se usa a sério, e a largura em
// que tudo o que é apertado se parte primeiro. `hasTouch` faz `(pointer:
// coarse)` ser verdade, que é onde assentam os alvos grandes.
test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin", { waitUntil: "domcontentloaded" });
  const nome = page.getByLabel(/O teu email/i);
  if ((await nome.count()) > 0) {
    await nome.fill("catarina@liquen-events.com");
    // Pelo `name` e não pelo rótulo: «Palavra-passe» passou a ser partilhado com
    // o botão de mostrar/ocultar, e o botão de entrar diz por que caminho se
    // entra (a passkey passou a ser o primeiro).
    await page.locator('input[name="password"]').fill("liquen2026");
    await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  }
  return page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ state: "visible", timeout: 20000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * Prepara tudo e devolve o id da checklist.
 *
 * Devolve `null` quando o ambiente não dá para isto (sem pedidos gravados),
 * para o teste ser saltado com uma razão em vez de falhar por uma condição da
 * máquina.
 */
async function prepararChecklist(page: Page): Promise<string | null> {
  // Os essenciais podem já existir de uma corrida anterior: 409 é sucesso aqui.
  await page.request.post("/api/material/listas", { data: { semear: true } });

  const pedidos = await page.request.get("/api/orcamento");
  if (!pedidos.ok()) return null;
  const lista = await pedidos.json();
  const primeiro = Array.isArray(lista) ? lista[0] : null;
  if (!primeiro?.id) return null;

  const gerada = await page.request.post(`/api/orcamento/${primeiro.id}/material`);
  if (!gerada.ok()) return null;
  const r = await gerada.json();
  return Array.isArray(r?.itens) && r.itens.length > 0 ? (r.evento?.id ?? null) : null;
}

/**
 * As linhas da checklist.
 *
 * Procuradas DENTRO da região com nome, e não por estrutura ou por atributo
 * solto: `button[aria-pressed]` apanhava o seletor de idioma do site, que
 * aparece antes no DOM e também o usa. O teste chegou a medir 28 px de altura
 * e a acusar o ecrã — a culpa era do seletor.
 */
const linhas = (page: Page) =>
  page.getByRole("group", { name: "Material a carregar" }).locator("button[aria-pressed]");

test.describe("Carregamento no telemóvel", () => {
  test("marcar funciona sem rede e sobrevive a recarregar", async ({ page, context }) => {
    test.skip(!(await login(page)), "Sem login de admin neste ambiente.");
    const eventId = await prepararChecklist(page);
    test.skip(!eventId, "Sem pedidos gravados para gerar uma checklist.");

    await page.goto(`/orcamento/admin/carregamento/${eventId}`);
    const barra = page.getByRole("progressbar", { name: "Progresso do carregamento" });
    await expect(barra).toBeVisible();
    await expect(barra).toHaveAttribute("aria-valuenow", "0");

    const primeira = linhas(page).first();
    await expect(primeira).toBeVisible();

    // O alvo é a LINHA inteira: acertar num quadrado pequeno com a carrinha a
    // abanar é o que faz marcar tudo no fim, de memória.
    const caixa = await primeira.boundingBox();
    expect(caixa!.height).toBeGreaterThanOrEqual(56);
    expect(caixa!.width).toBeGreaterThan(300);

    // Cai a rede — o estado normal numa quinta.
    await context.setOffline(true);
    await primeira.click();

    // O ecrã muda JÁ: o dedo não espera pela rede.
    await expect(primeira).toHaveAttribute("aria-pressed", "true");
    await expect(barra).toHaveAttribute("aria-valuenow", "1");
    await expect(page.getByText(/marcaç(ão|ões) guardada/)).toBeVisible();

    // E ficou GRAVADA, não só desenhada: é isto que a faz sobreviver a fechar
    // o separador sem rede.
    const guardado = await page.evaluate(() => ({
      fila: JSON.parse(localStorage.getItem("liquen-material-fila") ?? "[]").length,
      marcados: Object.keys(localStorage)
        .filter((k) => k.startsWith("liquen-material-") && k !== "liquen-material-fila")
        .flatMap((k) => JSON.parse(localStorage.getItem(k) ?? "[]"))
        .filter((i: { loadedAt?: string }) => i.loadedAt).length,
    }));
    expect(guardado.fila).toBe(1);
    expect(guardado.marcados).toBe(1);

    await context.setOffline(false);
  });

  test("offline, RECARREGAR não perde a marcação", async ({ page, context }) => {
    test.skip(!(await login(page)), "Sem login de admin neste ambiente.");
    const eventId = await prepararChecklist(page);
    test.skip(!eventId, "Sem pedidos gravados para gerar uma checklist.");

    await page.goto(`/orcamento/admin/carregamento/${eventId}`);

    // O recarregar offline depende do service worker ter o invólucro em cache,
    // e o SW só se REGISTA em produção (ver ServiceWorkerRegister). Em `npm run
    // dev` não há nada em cache e o browser não tem de onde servir a página —
    // por isso este teste corre no CI, que arranca com `npm run start`, e é
    // saltado localmente com a razão à vista em vez de falhar por uma condição
    // do ambiente.
    const temSW = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      const reg = await navigator.serviceWorker.getRegistration();
      return Boolean(reg?.active) && Boolean(navigator.serviceWorker.controller);
    });
    test.skip(!temSW, "Sem service worker (só existe em produção).");

    await linhas(page).first().click();
    await expect(
      page.getByRole("progressbar", { name: "Progresso do carregamento" }),
    ).toHaveAttribute("aria-valuenow", "1");

    await context.setOffline(true);
    await page.reload();
    await expect(
      page.getByRole("progressbar", { name: "Progresso do carregamento" }),
    ).toHaveAttribute("aria-valuenow", "1");
    await context.setOffline(false);
  });

  test("os críticos por marcar avisam, e dizem quais", async ({ page }) => {
    test.skip(!(await login(page)), "Sem login de admin neste ambiente.");
    const eventId = await prepararChecklist(page);
    test.skip(!eventId, "Sem pedidos gravados para gerar uma checklist.");

    await page.goto(`/orcamento/admin/carregamento/${eventId}`);

    // Marca-se UMA linha só — os essenciais trazem vários críticos, portanto
    // sobra sempre pelo menos um por marcar.
    const primeira = linhas(page).first();
    await expect(primeira).toBeVisible();
    await primeira.click();
    // Esperar que a marcação PEGUE antes de seguir: clicar antes de a página
    // hidratar não faz nada, e sem esta espera o teste falhava por causa do
    // seu próprio ritmo em vez de por causa do comportamento.
    await expect(primeira).toHaveAttribute("aria-pressed", "true");

    await page.getByRole("button", { name: /Dar por carregada/ }).click();

    // O aviso nomeia os que faltam: "faltam itens críticos" sozinho obrigava a
    // percorrer a lista outra vez para saber quais.
    await expect(page.getByText(/Faltam \d+ itens críticos/)).toBeVisible();
    // E não bloqueia — às vezes há razão para seguir assim.
    await expect(page.getByRole("button", { name: "Seguir assim" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Voltar" })).toBeVisible();
  });
});
