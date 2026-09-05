import { test, expect, type Locator } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DO ESTÚDIO — a marca da secção actual ANDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra, quando se carrega numa coisa e vai-se para outra coisa».
 *
 * A barra lateral do back office já tinha isto (ver `admin-views.spec.ts`): um
 * filete de 3 px que DESLIZA de um destino para o outro, em vez de o fundo
 * acender num sítio e apagar-se noutro ao mesmo tempo. O índice do estúdio
 * fazia exactamente o mesmo trabalho — «onde estou nesta proposta de cinco
 * ecrãs» — e trocava de sítio a corte seco. Passou a ter o mesmo gesto, com a
 * mesma constante (`MARCA`, 250 ms).
 *
 * ── PORQUE É QUE ISTO É UM PASSEIO E NÃO UM TESTE DE UNIDADE ──────────────
 *
 * Porque o filete MEDE-SE: pergunta ao chip marcado onde ele está
 * (`offsetLeft`/`offsetTop`/`offsetHeight`) e desliza para lá. Em jsdom não há
 * disposição — `offsetParent` é sempre nulo e as medidas são zero —, portanto
 * um teste de unidade não distingue «não há filete» de «há filete e está no
 * sítio». Já aconteceu uma vez, com o filete da barra lateral: escreveu-se o
 * teste de unidade, viu-se falhar por essa razão, e mudou-se para um browser.
 *
 * O que se prova em jsdom (que existe, que é um só, que vive dentro da lista
 * que rola, que usa a constante da casa) está em
 * `src/app/[lang]/(admin)/orcamento/admin/NavEstudio.test.tsx`, com as medidas
 * fingidas e dito por extenso que o são.
 *
 * ── E PORQUE É QUE SE MEDE COM `expect.poll` ──────────────────────────────
 *
 * Porque o filete leva 250 ms a percorrer o caminho. A primeira versão do
 * passeio da barra lateral mediu-o A MEIO: deu 4,17 px de diferença e leu-se
 * como desalinhamento quando era, afinal, a animação a funcionar. O que
 * interessa é onde ele PÁRA — e é por isso que a comparação vive dentro do
 * `poll`, a repetir até assentar, e não numa leitura só.
 *
 * ── E PORQUE É QUE ESTE FICHEIRO CORRE NA SUITE DOS DADOS ─────────────────
 *
 * Porque o estúdio só abre a partir de um PEDIDO, e o servidor de produção que
 * o `playwright.config.ts` arranca recusa escritas sem Supabase. A razão está
 * escrita por extenso em `playwright.dados.config.ts`; este ficheiro segue a
 * mesma porta que o `fazer-proposta-cliente.spec.ts`.
 */

/** O canto de cima e o da esquerda de um elemento, numa leitura só. */
async function canto(alvo: Locator): Promise<{ x: number; y: number }> {
  return alvo.evaluate((el) => {
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top };
  });
}

test.describe("Back office — a marca da secção actual, no índice do estúdio", () => {
  test("o filete desliza para a secção onde se está, e PÁRA em cima dela", async ({ page }) => {
    test.setTimeout(120_000);
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);

    // O caminho curto para o estúdio em página inteira: a lista de pedidos e a
    // primeira linha. É o mesmo do `fazer-proposta-cliente.spec.ts`.
    await page.goto("/orcamento/admin?v=pedidos", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 30_000,
    });
    const linha = page.getByRole("row").filter({ hasText: /@/ }).first();
    await expect(linha).toBeVisible({ timeout: 20_000 });
    await linha.click();
    await expect(page.getByText(/Proposta para/)).toBeVisible({ timeout: 60_000 });

    const indice = page.getByRole("navigation", { name: /Secções da proposta/i });
    await expect(indice).toBeVisible({ timeout: 30_000 });
    const filete = indice.locator('ul > [aria-hidden="true"]');
    const chips = indice.locator("ul li[data-seccao] button");
    const quantos = await chips.count();
    expect(quantos, "o índice tem de ter secções para se poder saltar").toBeGreaterThan(1);

    /**
     * ── PRIMEIRO SALTA-SE, E ISSO NÃO É UM ATALHO DO TESTE ──────────────────
     *
     * Ao abrir o estúdio ainda não há «onde estou»: a primeira secção começa a
     * ~430 px do topo e a faixa que o observador vigia é a de cima (o
     * `rootMargin` tira 80 px ao cabeçalho e 55% ao rodapé). Sem secção na
     * faixa, o índice NÃO inventa uma marca — e é o que se quer, senão ele
     * dizia «estás no Evento» a quem ainda não desceu até lá.
     *
     * Portanto o passeio faz o que ela faz: carrega num nome para lá ir.
     */
    await chips.first().click();
    await expect(filete, "o índice do estúdio não marca a secção actual").toHaveCount(1, {
      timeout: 30_000,
    });

    /** De que secção é o chip marcado neste instante. */
    const seccaoMarcada = () =>
      indice
        .locator('li[data-seccao]:has([aria-current="true"])')
        .first()
        .getAttribute("data-seccao");

    const primeira = await seccaoMarcada();
    const antes = await canto(filete);

    // Saltar para o fim do índice. É o gesto que ela faz: carregar no nome e ir
    // lá ter.
    await chips.nth(quantos - 1).click();

    // A secção marcada mudou mesmo — senão o resto media a marca a não andar
    // por não haver para onde andar.
    await expect
      .poll(seccaoMarcada, { message: "a secção actual não mudou com o salto", timeout: 30_000 })
      .not.toBe(primeira);

    // …a marca mudou de sítio…
    await expect
      .poll(async () => JSON.stringify(await canto(filete)), {
        message: "o filete ficou parado quando a secção actual mudou",
        timeout: 30_000,
      })
      .not.toBe(JSON.stringify(antes));

    // …e é ainda UM só. Uma marca dentro de cada chip dava o mesmo desenho
    // parado e nenhum percurso — é a maneira mais fácil de partir isto sem se
    // notar, e foi a que o passeio da barra lateral aprendeu a apanhar.
    await expect(filete).toHaveCount(1);

    // …e ASSENTA em cima do chip marcado, nos DOIS eixos.
    //
    // Os dois eixos e não só o `top`: abaixo de 40rem de ZONA este índice é uma
    // TIRA horizontal e é o `x` que anda. Medir só um eixo passava por verde
    // numa das duas formas com a marca a apontar para o vizinho.
    const activo = indice.locator('[aria-current="true"]').first();
    await expect
      .poll(
        async () => {
          const [f, a] = await Promise.all([canto(filete), canto(activo)]);
          return Math.max(Math.abs(f.x - a.x), Math.abs(f.y - a.y));
        },
        { message: "o filete parou fora do chip da secção actual", timeout: 30_000 },
      )
      .toBeLessThanOrEqual(2);
  });
});
