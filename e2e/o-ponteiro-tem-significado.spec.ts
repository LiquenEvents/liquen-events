import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UM BOTÃO NÃO LEVA A MÃOZINHA @movimento
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Fase 07 do `docs/DESIGN-SYSTEM.md`. A Parte 12.1 abre com a razão de isto
 * existir: «esta é a parte que mais distingue uma app de Mac de um site, e a
 * que quase nunca se faz».
 *
 * A regra é contra-intuitiva para quem vem da web e é simples: o
 * `cursor: pointer` significa «isto leva-te a outro sítio» — é o cursor do
 * LINK. Um botão não leva a lado nenhum: faz uma coisa, ali mesmo. Por isso o
 * macOS desenha a SETA em cima de todos os botões. O documento proíbe a
 * mãozinha em botões por escrito, na lista da Parte 18.
 *
 * MEDIDO antes desta ronda: 21 `cursor-pointer` no back office, nem um deles
 * num `<a>` — nove `<summary>`, seis `<label>`, um `<div>`, um `<button>`.
 *
 * ── PORQUE É QUE ISTO É UM PASSEIO E NÃO UM TESTE DE UNIDADE ─────────────
 *
 * Porque o que interessa não é a classe que lá está escrita: é o que o browser
 * CALCULA depois de a cascata toda correr. Uma regra certa vencida por uma
 * classe do Tailwind numa folha carregada depois dá exactamente o mesmo
 * ficheiro-fonte e um cursor diferente no ecrã. É a mesma família de avaria
 * que já custou um dia a esta casa com as durações das molas.
 *
 * ── E O QUE O CONTROLO NEGATIVO ENSINOU, QUE NÃO ERA ÓBVIO ───────────────
 *
 * Tirei a regra do `globals.css` à espera de ver isto ficar vermelho. Ficou
 * verde. A razão é simples e vale a pena estar escrita: a folha de estilos do
 * PRÓPRIO BROWSER já desenha a seta em cima de um `<button>`. Sem ninguém
 * fazer nada, o back office já estava quase certo.
 *
 * O que a regra da casa faz, então, não é «pôr a seta» — é **vencer** um
 * `cursor-pointer` escrito num componente. Foram 21 deles, e é por isso que a
 * regra é deliberadamente mais específica do que uma classe do Tailwind: o
 * sistema ganha ao descuido, sem depender de ninguém se lembrar.
 *
 * O que este passeio guarda, portanto, é o RESULTADO — e o detector foi
 * verificado a sério: injectada uma mãozinha num botão da página, ele conta 1
 * onde contava 0. Não é um teste que passa por não olhar.
 */
test.describe("o ponteiro tem significado @movimento", () => {
  test("os botões levam a seta, e o link a mãozinha", async ({ page }) => {
    await page.goto("/pt/orcamento/admin");

    const botao = page.getByRole("button").filter({ hasText: /\S/ }).first();
    await botao.waitFor({ state: "visible" });
    expect(
      await botao.evaluate((el) => getComputedStyle(el).cursor),
      "um botão com a mãozinha diz «isto leva-te a outro sítio», e não leva",
    ).toBe("default");

    // O campo onde se escreve diz que se escreve.
    const campo = page.locator('input[type="email"], input[type="text"]').first();
    if (await campo.count()) {
      expect(
        await campo.evaluate((el) => getComputedStyle(el).cursor),
        "o campo de texto perdeu o cursor de escrita",
      ).toBe("text");
    }

    // E o link — o único que merece a mãozinha.
    const link = page.locator("a[href]").first();
    if (await link.count()) {
      expect(
        await link.evaluate((el) => getComputedStyle(el).cursor),
        "o link deixou de ser a mãozinha",
      ).toBe("pointer");
    }
  });

  test("nenhum elemento clicável do painel ficou com a mãozinha", async ({ page }) => {
    await page.goto("/pt/orcamento/admin");
    await page.getByRole("button").first().waitFor({ state: "visible" });

    const culpados = await page.evaluate(() => {
      const dentro = document.querySelector("[data-admin-mode]") ?? document.body;
      const maus: string[] = [];
      for (const el of dentro.querySelectorAll<HTMLElement>(
        'button, [role="button"], [role="tab"], summary, label, select',
      )) {
        if (getComputedStyle(el).cursor === "pointer") {
          maus.push(
            `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(/\s+/)[0] : ""}` +
              ` — «${(el.textContent || "").trim().slice(0, 30)}»`,
          );
        }
      }
      return maus.slice(0, 8);
    });

    expect(culpados, "estes deviam ter a seta, e têm a mãozinha").toEqual([]);
  });
});
