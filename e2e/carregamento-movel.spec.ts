import { test, expect, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

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

/**
 * Prepara tudo e devolve o id do evento cuja checklist foi gerada.
 *
 * ── Porque é que já não devolve `null` ────────────────────────────────────
 * Devolvia — e os três passeios deste ficheiro saltavam com «Sem pedidos
 * gravados para gerar uma checklist», sempre, em todas as corridas do CI.
 * A razão não era o ambiente ser pobre: era a lista de pedidos começar vazia
 * (o armazém em ficheiro não é versionado) e o servidor de produção do CI
 * recusar escrever sem Supabase. Três passeios verdes que nunca abriram a vista
 * que dizem medir.
 *
 * Agora o pedido é criado (`garantirPedido`) e cada passo que falhe falha COM
 * A RAZÃO — a asserção diz qual dos quatro passos é que não deu.
 */
async function prepararChecklist(page: Page): Promise<string> {
  // Os essenciais podem já existir de uma corrida anterior: 409 é sucesso aqui.
  const essenciais = await page.request.post("/api/material/listas", { data: { semear: true } });
  expect(
    [200, 201, 409].includes(essenciais.status()),
    `semear os essenciais de carrinha respondeu ${essenciais.status()}`,
  ).toBe(true);

  const quoteId = await garantirPedido(page);

  const gerada = await page.request.post(`/api/orcamento/${quoteId}/material`);
  expect(gerada.ok(), `gerar a checklist respondeu ${gerada.status()}`).toBe(true);

  const r = await gerada.json();
  expect(
    Array.isArray(r?.itens) && r.itens.length > 0,
    "a checklist gerada veio VAZIA — as regras não produziram nenhuma linha a partir dos essenciais",
  ).toBe(true);
  expect(typeof r?.evento?.id === "string" && r.evento.id, "a checklist tem evento").toBeTruthy();
  return r.evento.id as string;
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

/**
 * A primeira linha por marcar — devolvida por POSIÇÃO, não por estado.
 *
 * A distinção não é fina, custou uma corrida: um localizador
 * `button[aria-pressed="false"]` deixa de apanhar a linha no instante em que
 * ela fica marcada, e o `.first()` passa a apontar para a linha DE BAIXO, que
 * continua por marcar. A asserção «ficou marcada» ficava eternamente a olhar
 * para a linha errada e o relatório dizia «esperava true, veio false» — com o
 * ecrã a fazer exactamente o que devia.
 *
 * A posição é estável: as linhas são agrupadas por categoria e a ordem não
 * depende de estarem carregadas (ver `porCategoria`, em Carregamento.tsx).
 */
async function primeiraPorMarcar(page: Page) {
  const todas = linhas(page);
  await expect(todas.first()).toBeVisible();
  const quantas = await todas.count();
  for (let i = 0; i < quantas; i += 1) {
    if ((await todas.nth(i).getAttribute("aria-pressed")) === "false") return todas.nth(i);
  }
  throw new Error(
    `As ${quantas} linhas desta checklist já estão todas marcadas — não sobra nenhuma para este passeio marcar.`,
  );
}

/** Quantas linhas a barra diz que já estão carregadas. */
async function jaCarregadas(barra: ReturnType<Page["getByRole"]>): Promise<number> {
  return Number((await barra.getAttribute("aria-valuenow")) ?? "0");
}

/**
 * Abre a vista de carregamento e espera que a lista ASSENTE.
 *
 * A lista não vem no HTML. O ecrã pinta primeiro o que tem em `localStorage` e
 * só depois a vai buscar (`buscar()`, em Carregamento.tsx) — e quando essa
 * resposta chega, `setItens` substitui as linhas todas. Um clique dado nesse
 * intervalo acerta num nó que o React já deitou fora: não marca nada, não
 * deixa rasto, e o relatório acusa o botão de não responder. Perdeu-se uma
 * corrida inteira a olhar para «esperava true, veio false» com o ecrã perfeito.
 *
 * Esperar pela resposta ANTES de tocar em seja no que for é o que torna estes
 * passeios repetíveis.
 */
async function abrirCarregamento(page: Page, eventId: string): Promise<void> {
  const lista = page.waitForResponse(
    (r) => /\/api\/orcamento\/[^/]+\/material$/.test(new URL(r.url()).pathname),
    { timeout: 90_000 },
  );
  await page.goto(`/orcamento/admin/carregamento/${eventId}`);
  await lista;
  // E deixar o React pintar a lista nova antes de lhe tocar.
  await page.waitForTimeout(500);
}

test.describe("Carregamento no telemóvel", () => {
  test("marcar funciona sem rede e sobrevive a recarregar", async ({ page, context }) => {
    exigirLogin(await entrarNoBackOffice(page));
    const eventId = await prepararChecklist(page);

    await abrirCarregamento(page, eventId);
    const barra = page.getByRole("progressbar", { name: "Progresso do carregamento" });
    await expect(barra).toBeVisible();
    // Quantas já vinham marcadas. Prova-se o DELTA e não o absoluto: a checklist
    // é partilhada com os outros passeios deste ficheiro, e
    // exigir que ela comece vazia era exigir que este teste corresse sempre em
    // primeiro lugar e nunca fosse repetido.
    const antes = await jaCarregadas(barra);

    const primeira = await primeiraPorMarcar(page);

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
    await expect(barra).toHaveAttribute("aria-valuenow", String(antes + 1));
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
    // A FILA de saída é deste separador e nasceu agora: uma marcação, um item
    // por enviar. Os MARCADOS incluem os que já vinham do servidor.
    expect(guardado.fila).toBe(1);
    expect(guardado.marcados).toBe(antes + 1);

    await context.setOffline(false);
  });

  test("offline, RECARREGAR não perde a marcação", async ({ page, context }) => {
    exigirLogin(await entrarNoBackOffice(page));
    const eventId = await prepararChecklist(page);

    // ── O SERVICE WORKER É REGISTADO AQUI, E VALE A PENA DIZER PORQUÊ ──────
    // Recarregar sem rede depende de o service worker ter o invólucro da
    // página em cache. O `public/sw.js` é o de produção e faz esse trabalho em
    // qualquer servidor; o que só existe em produção é o REGISTO dele — o
    // `ServiceWorkerRegister` desiste quando `NODE_ENV !== "production"`, para
    // uma cache não atrapalhar o recarregamento a quente do desenvolvimento.
    //
    // Este passeio precisa das duas coisas ao mesmo tempo: de GRAVAR (a
    // checklist), o que exige um servidor de desenvolvimento, e de um service
    // worker, que a aplicação só liga em produção. Enquanto esperou pelas duas,
    // saltou em TODAS as corridas — «Sem service worker (só existe em
    // produção)» — e a única coisa que o módulo tem de garantir de verdade
    // ficou por medir.
    //
    // O que se regista é o ficheiro VERDADEIRO, não um substituto: o que se
    // prova continua a ser o comportamento do `sw.js` de produção. O que este
    // passeio NÃO prova — e não provava antes — é que a aplicação o regista
    // sozinha; isso é uma linha do `ServiceWorkerRegister` e vive noutro sítio.
    const controlado = await page.evaluate(async () => {
      if (!("serviceWorker" in navigator)) return false;
      try {
        await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        // `claim()` acontece no `activate`; até lá esta página ainda não é
        // controlada, e uma navegação não controlada não vai para a cache.
        for (let i = 0; i < 100 && !navigator.serviceWorker.controller; i += 1) {
          await new Promise((r) => setTimeout(r, 100));
        }
        return Boolean(navigator.serviceWorker.controller);
      } catch {
        return false;
      }
    });
    expect(controlado, "o service worker de produção (public/sw.js) tomou conta da página").toBe(
      true,
    );

    await abrirCarregamento(page, eventId);
    const barra = page.getByRole("progressbar", { name: "Progresso do carregamento" });
    await expect(barra).toBeVisible();
    const antes = await jaCarregadas(barra);

    await (await primeiraPorMarcar(page)).click();
    await expect(barra).toHaveAttribute("aria-valuenow", String(antes + 1));

    await context.setOffline(true);
    await page.reload();
    await expect(barra).toHaveAttribute("aria-valuenow", String(antes + 1));
    await context.setOffline(false);
  });

  test("os críticos por marcar avisam, e dizem quais", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    const eventId = await prepararChecklist(page);

    await abrirCarregamento(page, eventId);

    // Marca-se UMA linha por marcar — os essenciais trazem vários críticos,
    // portanto sobra sempre pelo menos um por marcar.
    const primeira = await primeiraPorMarcar(page);
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
