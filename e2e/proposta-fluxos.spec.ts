import { test, expect, type Page } from "@playwright/test";

/**
 * OS DOIS FLUXOS DE FAZER UMA PROPOSTA.
 *
 * A missão pediu que se medisse e se provasse a diferença entre eles:
 *
 *   1. DO ZERO — o percurso antigo, que continua a existir para o primeiro
 *      casamento de um estilo novo. Aqui o que se protege é a orientação: a
 *      coluna lateral tem de dizer o que falta, e o que falta tem de deixar
 *      de faltar quando ela o escreve.
 *
 *   2. A PARTIR DE OUTRA — o percurso comum, e a razão de existir desta
 *      missão. O que se protege é a regra que impede esta funcionalidade de
 *      fazer mal em vez de bem: o trabalho vem todo, e a identidade do casal
 *      anterior NÃO vem nenhuma.
 *
 * `test.skip` quando o login não está disponível (build de produção sem
 * ADMIN_PASSWORD_HASH), como os outros passeios do back office. O CI define um
 * hash de teste, portanto lá corre sempre.
 */

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  // Pelo `name` e não pelo rótulo: «Palavra-passe» passou a ser partilhado com
  // o botão de mostrar/ocultar, e o botão de entrar diz por que caminho se
  // entra (a passkey passou a ser o primeiro).
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Um pedido novo, para o passeio não depender do que já lá está. */
async function criarPedido(page: Page, nome: string): Promise<string> {
  const res = await page.request.post("/api/orcamento", {
    data: {
      form: {
        name: nome,
        email: `${nome.replace(/\W/g, "").toLowerCase()}@example.pt`,
        phone: "912345678",
        category: "particulares",
        eventType: "casamentos",
        eventName: "Casamento",
        date: "2027-06-10",
        guests: 120,
        location: "Herdade da Maridona, Glória",
      },
      website: "",
      submissionId: `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
  expect(res.ok(), "o pedido de teste foi criado").toBe(true);
  return (await res.json()).id as string;
}

/**
 * Abre o estúdio pela vista "Fazer proposta".
 *
 * NÃO por `/orcamento/admin/evento/<id>`: essa rota não existe (dá 404) — foi
 * o que esta suite descobriu à primeira tentativa. O back office não muda de
 * endereço, muda de vista.
 *
 * A vista é escolhida ANTES de a página abrir: o back office restaura a última
 * vista num efeito, e um clique na navegação feito logo a seguir ao
 * carregamento é desfeito por ele.
 */
async function abrirEstudio(page: Page, nomeCliente: string): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("liquen-admin-view", "fazer-proposta");
    } catch {
      /* sem localStorage — segue pela navegação */
    }
  });
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /^Fazer proposta$/ })).toBeVisible({
    timeout: 20000,
  });
  // `:visible` não é cosmético: a vista "Pedidos" fica montada por baixo com um
  // cartão para o MESMO pedido, e o seletor apanhava esse — que existe no DOM e
  // nunca fica clicável.
  await page
    .locator("main button:visible")
    .filter({ hasText: nomeCliente })
    .first()
    .click({ timeout: 20000 });
  await expect(page.getByText(/Estúdio de propostas/i).first()).toBeVisible({ timeout: 20000 });
  // Esperar que o React assuma o formulário: escrever antes disso mexe no DOM
  // e não no estado.
  await page.waitForTimeout(1500);
}

// `@propostas` é a etiqueta que tira estes passeios do passo informativo do
// CI: correm num passo bloqueante próprio, contra o servidor de
// desenvolvimento (ver playwright.propostas.config.ts).
test.describe("Fazer uma proposta @propostas", () => {
  test("do zero: a coluna diz o que falta, e deixa de dizer quando se preenche", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const entrou = await login(page);
    test.skip(!entrou, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");

    const nome = `Zero ${Date.now().toString(36)}`;
    await criarPedido(page, nome);
    await abrirEstudio(page, nome);

    // A proposta nasce sem valor, e o aviso diz exactamente isso. É a mesma
    // lista que decide se o botão de enviar deixa — ver proposal-progress.ts.
    const falta = page.getByRole("button", { name: /Falta o valor/ });
    await expect(falta).toBeVisible();

    // Escrever o valor faz o aviso desaparecer. Se isto falhar, ou o aviso
    // mente ou a conta está errada — as duas hipóteses são graves.
    await page.getByLabel(/^Valor \(sem IVA\)$/).fill("4200");
    await expect(falta).toBeHidden({ timeout: 10_000 });
  });

  test("a partir de outra: vem o trabalho todo, não vem o casal anterior", async ({ page }) => {
    test.setTimeout(120_000);
    const entrou = await login(page);
    test.skip(!entrou, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");

    // ── A origem ────────────────────────────────────────────────────────
    // Um modelo guardado, que é o mesmo caminho de cópia de uma proposta
    // anterior (`/api/propostas/copiar`) sem depender de haver uma na
    // instalação. O conteúdo é o da proposta real da Catarina Martins.
    const nomeModelo = `E2E Catarina ${Date.now().toString(36)}`;
    const modelo = await page.request.post("/api/propostas/modelos", {
      data: {
        nome: nomeModelo,
        tipo: "completo",
        origem: "Catarina Martins",
        doc: {
          template: "decoracao",
          ref: "Decoração Casamento Catarina Martins · 18 de setembro de 2027",
          clientNames: "Catarina Martins",
          eventType: "Casamento",
          eventDate: "18 de setembro de 2027",
          location: "Évora",
          guests: "250 pax",
          ceremony: "Civil, simbólica",
          serviceGroups: [
            {
              letter: "a)",
              title: "Decoração Floral e Decoração",
              items: [{ label: "Igreja" }, { label: "Cocktail" }],
            },
          ],
          moodBoards: [],
          budgetItems: ["Decoração Cerimónia", "Decoração Cocktail"],
          coverImages: ["", ""],
          totalLabel: "Valor Total Decoração",
          totalText: "6875,00 € + IVA",
          totalAmount: 6875,
          totalVatMode: "acrescer",
          validUntilDays: 45,
          notasImportantes: ["A proposta depois de aceite deve ser confirmada por email"],
          incluido: [],
          naoIncluido: [],
          condicoesGerais: [],
          observacoesGerais: [],
          faseamento: ["30% na adjudicação"],
          cancelamento: [],
        },
      },
    });
    expect(modelo.ok(), "o modelo de origem foi guardado").toBe(true);

    // ── O destino ───────────────────────────────────────────────────────
    const nome = `Irina e Hugo ${Date.now().toString(36)}`;
    await criarPedido(page, nome);
    await abrirEstudio(page, nome);

    await page.getByRole("button", { name: /Criar a partir de/ }).click();
    await page.getByRole("dialog", { name: /Criar a partir de/ }).waitFor();
    await page.getByRole("button", { name: new RegExp(nomeModelo) }).click();

    // ── O trabalho veio ─────────────────────────────────────────────────
    await expect(page.getByRole("dialog")).toBeHidden({ timeout: 30_000 });
    // `getByLabel` e não `getByDisplayValue` — este último é do Testing
    // Library e não existe no Playwright. Os rótulos de acessibilidade são o
    // contrato: se mudarem, é uma alteração deliberada.
    await expect(page.getByLabel("Título do grupo").first()).toHaveValue(
      "Decoração Floral e Decoração",
      { timeout: 15_000 },
    );
    // O editor de serviços foi extraído para `ServicesEditor`, e ali cada
    // linha diz QUAL é: "Linha 1 do grupo 1" em vez de um "Item" repetido
    // trinta vezes — quem ouve o ecrã fica a saber onde está. O que este
    // teste prende é a CÓPIA, não a palavra do rótulo.
    await expect(page.getByLabel(/Linha 1 do grupo 1/).first()).toHaveValue("Igreja");
    await expect(page.getByLabel("Item de orçamento").first()).toHaveValue("Decoração Cerimónia");
    // As condições e a validade também — é metade do que se poupa.
    await expect(page.getByLabel(/Dias de validade/)).toHaveValue("45");

    // ── O CASAL ANTERIOR NÃO VEIO ───────────────────────────────────────
    // Esta é a única forma de esta funcionalidade fazer mal em vez de bem:
    // uma proposta enviada com o nome ou a data de outro casamento.
    await expect(page.getByLabel(/^Clientes$/)).toHaveValue(nome);
    await expect(page.getByLabel(/^Data$/)).toHaveValue("10 de junho de 2027");
    await expect(page.getByLabel(/^Local$/)).toHaveValue("Herdade da Maridona, Glória");
    await expect(page.getByLabel(/^Convidados$/)).toHaveValue("120 pax");
    // A cerimónia era do dia de outra pessoa e o pedido não a traz.
    await expect(page.getByLabel(/^Cerimónia$/)).toHaveValue("");
    // E o valor da proposta antiga não passa para a nova.
    await expect(page.getByLabel(/^Valor \(sem IVA\)$/)).not.toHaveValue("6875");

    // Em lado nenhum do ecrã pode sobrar o nome antigo.
    await expect(page.getByText("Catarina Martins", { exact: true })).toBeHidden();

    // ── E ficou marcado o que ela tem de confirmar ───────────────────────
    const marcados = page.locator(".ring-\\[\\#c98a2e\\]\\/45");
    expect(await marcados.count(), "os campos copiados ficam assinalados").toBeGreaterThan(0);
  });
});
