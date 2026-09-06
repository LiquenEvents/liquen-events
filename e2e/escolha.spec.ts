import { test, expect, type Page } from "@playwright/test";
import { entrarNoBackOffice } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMPO DE ESCOLHER, NUM BROWSER A SÉRIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `ui/Escolha` tem o teclado, o leitor de ecrã e a canalização presos em
 * jsdom (`ui/Escolha.teclado.test.tsx` e `ui/Escolha.saida.test.tsx`). O que
 * jsdom NÃO pode provar é tudo o que depende de haver disposição e folhas de
 * estilo aplicadas — e é precisamente aí que mora a regra que já custou caro
 * nesta casa. É isso, e só isso, que este passeio mede:
 *
 *  1. **A lista larga os toques no PRIMEIRO fotograma da saída.** A
 *     `.bo-saida` traz `pointer-events: none` dentro da própria classe, mas em
 *     jsdom nenhuma classe tem efeito nenhum: lá prova-se que a classe está no
 *     desenho certo, aqui prova-se que ela VALE. Uma caixa a desvanecer-se que
 *     continue a apanhar o toque impede o clique no que está por baixo — a
 *     pessoa carrega e não acontece nada, durante 200 ms e sem sinal de porquê.
 *
 *  2. **No dedo, é mesmo o `<select>` do sistema.** É a decisão do componente
 *     (a justificação está no cabeçalho dele) e tem de ser verificada nos dois
 *     apontadores, senão é só uma intenção escrita num comentário.
 *
 *  3. **Cada opção tem os 44 px do dedo.** A `.alvo-toque` só existe dentro de
 *     `@media (pointer: coarse)`, portanto uma medição com rato mede o vazio.
 *
 *  4. **A lista abre onde há chão.** Perto do fundo do ecrã sobe, em vez de
 *     ficar cortada — geometria pura, que precisa de uma janela verdadeira.
 */

/** Chega ao catálogo de Material, onde vivem dois filtros de escolher. */
async function abrirMaterial(page: Page): Promise<boolean> {
  if (!(await entrarNoBackOffice(page))) return false;
  // Pelo endereço e não pelo menu: a barra lateral volta a desenhar-se ao
  // chegar (a marca deslizante mede-se), e o clique apanhava o botão a ser
  // substituído — «element was detached from the DOM». O destino é o mesmo.
  await page.goto("/orcamento/admin?v=material");
  const filtro = page.getByRole("combobox", { name: /Filtrar por categoria/i });
  return await filtro
    .waitFor({ state: "visible", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
}

/**
 * ESPERAR PELA TROCA, ANTES DE CARREGAR.
 *
 * O `Escolha` desenha um `<select>` nativo no primeiro fotograma — é assim que
 * ele funciona sem JavaScript — e só passa à lista nossa depois de montado. Um
 * clique antes disso abre a caixa do SISTEMA, que não é um `role="listbox"` e
 * nem sequer vive no documento: o passeio ficava à espera de um elemento que
 * nunca ia aparecer.
 *
 * O `aria-expanded` só existe do lado de cá, portanto é ele o sinal de que a
 * troca já aconteceu.
 */
async function esperarPelaListaNossa(page: Page) {
  await expect(page.getByRole("combobox", { name: /Filtrar por categoria/i })).toHaveAttribute(
    "aria-expanded",
    /.*/,
    { timeout: 20_000 },
  );
}

test.describe("Escolher — o que só se mede num browser", () => {
  test("a lista larga os toques no primeiro fotograma da saída", async ({ page }) => {
    test.skip(!(await abrirMaterial(page)), "sem back office nesta instalação");

    await esperarPelaListaNossa(page);
    const campo = page.getByRole("combobox", { name: /Filtrar por categoria/i });
    await campo.click();
    const lista = page.getByRole("listbox");
    await expect(lista).toBeVisible();
    const id = await lista.getAttribute("id");

    // Fecha com Escape e mede NO MESMO fotograma em que a saída começa: um
    // `waitForTimeout` mediria o fim da animação, que é a parte que já se sabe.
    const largou = await page.evaluate(async (idDaLista) => {
      const caixa = document.getElementById(idDaLista!)!;
      document.activeElement?.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      // Um `requestAnimationFrame` = o fotograma seguinte ao commit do React,
      // ou seja o PRIMEIRO em que a saída se vê.
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      return {
        montada: document.body.contains(caixa),
        toques: getComputedStyle(caixa).pointerEvents,
        opacidade: Number(getComputedStyle(caixa).opacity),
      };
    }, id);

    // Continua no DOM (há o que animar) …
    expect(largou.montada, "a lista desapareceu de repente, sem saída").toBe(true);
    // … e já não apanha um único toque.
    expect(largou.toques, "a lista a apagar-se ainda apanha os cliques do que está por baixo").toBe(
      "none",
    );

    // E some-se de vez a seguir — o nó não fica pendurado.
    await expect(page.locator(`#${id}`)).toHaveCount(0, { timeout: 3_000 });
  });

  test("a lista abre PARA CIMA quando não há chão por baixo", async ({ page }) => {
    test.skip(!(await abrirMaterial(page)), "sem back office nesta instalação");

    await esperarPelaListaNossa(page);
    const campo = page.getByRole("combobox", { name: /Filtrar por categoria/i });
    // Encolhe a janela até o campo ficar colado ao fundo.
    await page.setViewportSize({ width: 1440, height: 420 });
    await campo.scrollIntoViewIfNeeded();
    await campo.click();

    const lista = page.getByRole("listbox");
    await expect(lista).toBeVisible();
    const caixaCampo = (await campo.boundingBox())!;
    const caixaLista = (await lista.boundingBox())!;
    // Ou cabe por baixo, ou subiu — o que não pode é ficar cortada fora do ecrã.
    const altura = page.viewportSize()!.height;
    expect(
      caixaLista.y + caixaLista.height,
      "a lista fica cortada pelo fundo do ecrã",
    ).toBeLessThanOrEqual(altura + 1);
    expect(caixaLista.y, "a lista sai por cima do topo").toBeGreaterThanOrEqual(-1);
    // E não tapa o campo que a abriu.
    expect(
      caixaLista.y >= caixaCampo.y + caixaCampo.height - 1 ||
        caixaLista.y + caixaLista.height <= caixaCampo.y + 1,
      "a lista está por cima do próprio campo",
    ).toBe(true);
  });
});

test.describe("Escolher — no dedo é o selector do sistema", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("com apontador grosso o controlo é um `<select>` nativo, e com 44 px", async ({ page }) => {
    test.skip(!(await abrirMaterial(page)), "sem back office nesta instalação");

    const campo = page.getByRole("combobox", { name: /Filtrar por categoria/i });
    await expect(campo).toBeVisible();

    // A decisão do componente, verificada e não só escrita: no dedo mantém-se o
    // nativo, porque a roda do iOS é boa, familiar e cara de imitar.
    expect(
      await campo.evaluate((el) => el.tagName),
      "no toque devia continuar a ser o selector do sistema",
    ).toBe("SELECT");

    // Os 44 px e os 16 px de letra vêm da regra do `globals.css` para
    // `(pointer: coarse)` — e é por os herdar de graça que o nativo fica.
    const caixa = (await campo.boundingBox())!;
    expect(caixa.height, "o alvo do dedo ficou abaixo dos 44 px").toBeGreaterThanOrEqual(44);
    // As duas medidas numa leitura só: em separado, cada `evaluate` volta a
    // resolver o localizador, e um desenho pelo meio devolvia um elemento já
    // desligado do documento — `getComputedStyle` de um nó desses dá cadeias
    // vazias, e o teste falhava com `NaN` a fingir que era um defeito de CSS.
    const estilo = await campo.evaluate((el) => {
      const s = getComputedStyle(el);
      return { letra: parseFloat(s.fontSize), aparencia: s.appearance };
    });
    expect(
      estilo.letra,
      "abaixo de 16 px o Safari do iOS amplia a página ao focar",
    ).toBeGreaterThanOrEqual(16);
    // E a seta é a NOSSA: o `appearance-none` tira a do sistema.
    expect(estilo.aparencia).toBe("none");
  });
});
