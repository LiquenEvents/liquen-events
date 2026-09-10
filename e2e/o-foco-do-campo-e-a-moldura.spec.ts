import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NUM CAMPO DE ESCREVER, O FOCO É A MOLDURA — MEDIDO, NÃO DEDUZIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Ela pediu QUATRO vezes para tirar «a linha à volta quando se
 * carrega para escrever»: «retira esta linha», «retira isto», «retira o anel»,
 * «retira os anéis de pesquisas do back office todos». Da última vez mandou
 * outra fotografia do mesmo campo de email, já depois de eu ter corrigido o
 * anel para seguir a forma do controlo.
 *
 * Da quarta vez fui perceber porque é que ela vê isto tantas vezes, e a
 * resposta está na especificação: **num campo de texto, clicar com o rato
 * também activa o `:focus-visible`**. Não é um caso de teclado — é o que lhe
 * acontece a ela, com o rato, todas as vezes que carrega num campo para
 * escrever. É o estado mais visto do produto inteiro.
 *
 * A correcção não foi tirar o indicador (o `docs/DESIGN-SYSTEM.md` proíbe
 * `outline: none` sem substituto, e sem indicador ninguém navega por teclado):
 * foi passá-lo para a PRÓPRIA MOLDURA do campo, como a Apple faz. Uma linha em
 * vez de duas.
 *
 * O que isto mede é que a troca aconteceu MESMO no browser — que é a única
 * maneira de o saber, porque a regra vive no CSS e a suite de unidade corre em
 * jsdom, que não calcula cascata nem `:focus-visible`.
 *
 * E mede as duas metades, porque falhar uma sozinha é um defeito diferente:
 *   · o anel por fora SAIU (senão ela vê as duas linhas outra vez);
 *   · a moldura MUDA (senão não há indicador nenhum, que é pior).
 */

/**
 * Uma cor CSS qualquer → três canais, pintando-a.
 *
 * E é pintada de propósito. A primeira versão disto lia o `borderTopColor` com
 * uma expressão regular à espera de `rgb(…)` — e apanhou `null`, porque os
 * tokens desta casa passam por `color-mix()` e por `light-dark()`, e o
 * Chromium devolve o resultado em `oklab(…)`. Uma cor válida, legível por um
 * humano, e invisível para a expressão.
 *
 * Pintar num canvas de 1×1 e ler o píxel é a única leitura que não depende do
 * FORMATO em que o browser resolveu escrever a cor.
 */
function distancia(a: number[], b: number[]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

test.describe("o foco de um campo é a moldura, não um anel @movimento", () => {
  /**
   * SEM A SESSÃO GUARDADA. O projecto `chromium` carrega um `storageState` com
   * a sessão já aberta, e com ela `/orcamento/admin` responde com o painel —
   * não com a porta. A primeira versão deste ficheiro morreu à espera de um
   * campo de email que estava a um painel de distância.
   *
   * Este é o único passeio da casa que precisa do contrário de uma sessão, e
   * é por isso que a excepção está aqui e não na configuração.
   */
  test.use({ storageState: { cookies: [], origins: [] } });

  test("ao focar, o anel por fora sai e a moldura muda de cor", async ({ page }) => {
    await page.goto("/pt/orcamento/admin");

    /**
     * O formulário nasce RECOLHIDO quando o browser sabe o que é uma chave de
     * acesso — que é o caso do Chromium do CI. Sem este clique, o campo existe
     * no documento e não está visível, e o passeio morre a esperar por ele.
     * (Apanhado a correr: a primeira versão deste ficheiro fez exactamente
     * isso.) O `catch` é para o caso contrário — um browser sem chaves de
     * acesso já abre no formulário e não tem link nenhum para carregar.
     */
    await page
      .getByRole("button", { name: /^Entrar com palavra-passe$/ })
      .click({ timeout: 5_000 })
      .catch(() => {});

    // O campo do email da entrada. Chega-se-lhe sem sessão nenhuma, o que faz
    // este passeio correr no servidor de produção do CI sem depender de nada.
    const campo = page.getByLabel(/^Email$/i).first();
    await campo.waitFor({ state: "visible" });

    const emRepouso = await campo.evaluate((el) => {
      const s = getComputedStyle(el);
      return { borda: s.borderTopColor, contorno: s.outlineStyle };
    });

    // `focus()` e não `click()`: o que se quer medir é o `:focus-visible`, e o
    // clique num campo de texto também o activa — mas o `focus()` deixa o
    // teste honesto sobre O QUE está a ser medido.
    await campo.focus();

    const focado = await campo.evaluate((el) => {
      const s = getComputedStyle(el);
      return {
        borda: s.borderTopColor,
        contorno: s.outlineStyle,
        largura: s.outlineWidth,
        sombra: s.boxShadow,
      };
    });

    // 1. O anel por fora saiu. É o que ela pediu quatro vezes.
    expect(
      focado.contorno === "none" || focado.largura === "0px",
      `o campo focado ainda desenha um \`outline\` (${focado.contorno} ${focado.largura}) — ` +
        "é a segunda linha à volta do campo, a que ela mandou tirar",
    ).toBe(true);

    // 2. E alguma coisa ficou no lugar dele. Um campo focado indistinguível de
    //    um campo em repouso é uma falha de acessibilidade (WCAG 2.4.7), e
    //    seria pior do que o defeito que se veio corrigir.
    const [a, b] = await page.evaluate(
      ([repouso, comFoco]) => {
        const tela = document.createElement("canvas");
        tela.width = tela.height = 1;
        const ctx = tela.getContext("2d")!;
        return [repouso, comFoco].map((cor) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = cor;
          ctx.fillRect(0, 0, 1, 1);
          return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3);
        });
      },
      [emRepouso.borda, focado.borda] as const,
    );

    expect(
      distancia(a, b),
      `a moldura não muda ao focar (repouso \`${emRepouso.borda}\`, focado \`${focado.borda}\`) — ` +
        "tirou-se o anel e não se pôs nada no lugar",
    ).toBeGreaterThan(24);

    // 3. E engrossa por dentro, que é o segundo píxel sem abrir folga por fora.
    expect(
      focado.sombra,
      `sem a sombra interior que faz o segundo píxel da moldura (era \`${focado.sombra}\`)`,
    ).toMatch(/inset/);
  });
});
