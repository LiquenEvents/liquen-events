import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MODO ESCURO É ESCURO — MEDIDO, NÃO DECLARADO @movimento
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A fase 03 do `docs/DESIGN-SYSTEM.md` troca a paleta inteira por
 * `light-dark()` mais `color-scheme`. É uma construção bonita e tem a mesma
 * fragilidade de tudo o resto nesta casa: se `light-dark()` não se aplicar —
 * porque o `@supports` não pegou, porque o `color-scheme` não desceu até ao
 * elemento, porque o atributo ficou no sítio errado — o CSS não dá erro
 * nenhum. Fica claro, e ninguém repara enquanto não abrir o modo escuro.
 *
 * Estes passeios abrem-no. Os três estados, e o que cada um tem de fazer:
 *
 *   · automático  → segue o sistema, nos dois sentidos;
 *   · claro       → fica claro MESMO com o sistema em escuro;
 *   · escuro      → fica escuro MESMO com o sistema em claro.
 *
 * E medem a coisa que interessa: a luminosidade do chão. Um teste que só
 * verificasse que o atributo está no sítio passaria com a paleta toda por
 * aplicar.
 */

/** Luminosidade relativa (WCAG 2.1) de um `rgb(...)` como o browser o devolve. */
function luminosidade(css: string): number {
  const [r, g, b] = (css.match(/\d+(\.\d+)?/g) ?? ["255", "255", "255"])
    .slice(0, 3)
    .map(Number);
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

/**
 * ── PORQUE É QUE ISTO PINTA UM ELEMENTO EM VEZ DE LER O TOKEN ─────────────
 *
 * A primeira versão fazia `getPropertyValue("--bo-chao")` e comparava. Devolveu
 * `light-dark(#f7f8f7,#101310)` — o texto, por resolver — e os três passeios
 * chumbaram com a paleta a funcionar perfeitamente.
 *
 * Não é um defeito do browser: uma propriedade personalizada guarda o que lá
 * puseram, e o `light-dark()` só escolhe um dos dois quando é SUBSTITUÍDO numa
 * propriedade que aceita uma cor. Ler o token é ler a pergunta; o que interessa
 * é a resposta.
 *
 * Por isso pinta-se. Um elemento por token, com o `var()` na propriedade a
 * sério, e mede-se o que o browser calculou — que é exactamente o que a
 * senhora vê no ecrã.
 */
async function chao(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const dentro = document.querySelector("[data-admin-mode]") ?? document.body;
    const medir = (token: string) => {
      const sonda = document.createElement("div");
      sonda.style.backgroundColor = `var(${token})`;
      dentro.appendChild(sonda);
      const pintado = getComputedStyle(sonda).backgroundColor;
      sonda.remove();
      return pintado;
    };
    return {
      chao: medir("--bo-chao"),
      superficie: medir("--bo-surface"),
      perigo: medir("--bo-perigo"),
      esquema: getComputedStyle(dentro).colorScheme,
    };
  });
}

test.describe("os três estados de aparência @movimento", () => {
  test("automático segue o sistema, nos dois sentidos", async ({ browser }) => {
    for (const esquema of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ colorScheme: esquema });
      const page = await ctx.newPage();
      await page.goto("/pt/orcamento/admin");
      const m = await chao(page);

      expect(m.chao, `--bo-chao não resolveu em ${esquema}`).not.toBe("");
      const l = luminosidade(m.chao);
      if (esquema === "light") {
        expect(l, `com o sistema em claro o chão devia ser claro (era ${m.chao})`).toBeGreaterThan(0.7);
      } else {
        expect(l, `com o sistema em escuro o chão devia ser escuro (era ${m.chao})`).toBeLessThan(0.1);
      }
      await ctx.close();
    }
  });

  test("a escolha explícita ganha ao sistema, nos dois sentidos", async ({ browser }) => {
    // Escuro escolhido, sistema em claro → tem de ficar escuro.
    const claro = await browser.newContext({ colorScheme: "light" });
    const p1 = await claro.newPage();
    await p1.goto("/pt/orcamento/admin");
    await p1.evaluate(() => {
      (document.querySelector("[data-admin-mode]") as HTMLElement).dataset.aparencia = "escuro";
    });
    const escuroForcado = await chao(p1);
    expect(
      luminosidade(escuroForcado.chao),
      `escolhi Escuro com o sistema em claro e o chão ficou ${escuroForcado.chao}`,
    ).toBeLessThan(0.1);
    await claro.close();

    // Claro escolhido, sistema em escuro → tem de ficar claro.
    const escuro = await browser.newContext({ colorScheme: "dark" });
    const p2 = await escuro.newPage();
    await p2.goto("/pt/orcamento/admin");
    await p2.evaluate(() => {
      (document.querySelector("[data-admin-mode]") as HTMLElement).dataset.aparencia = "claro";
    });
    const claroForcado = await chao(p2);
    expect(
      luminosidade(claroForcado.chao),
      `escolhi Claro com o sistema em escuro e o chão ficou ${claroForcado.chao}`,
    ).toBeGreaterThan(0.7);
    await escuro.close();
  });

  test("em escuro os quatro estados trocam de valor, e não ficam os do claro", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/pt/orcamento/admin");
    const m = await chao(page);

    // O vermelho de erro claro (`#b23b2e`) dá 2,95:1 sobre o fundo escuro —
    // ilegível. Se ele aparecer aqui, o `light-dark()` não pegou nas cores de
    // estado, e é a avaria mais provável desta fase.
    expect(m.perigo, "o perigo ficou com o valor do modo claro").not.toBe("");
    expect(
      luminosidade(m.perigo),
      `em escuro o perigo tem de ser claro para se ler (era ${m.perigo})`,
    ).toBeGreaterThan(0.3);

    // E a superfície do cartão tem de ser mais CLARA do que o chão: em escuro
    // a elevação faz-se por luminosidade, que é a regra da Parte 5.3.
    expect(
      luminosidade(m.superficie),
      "em escuro o cartão devia estar acima do chão, por luminosidade",
    ).toBeGreaterThan(luminosidade(m.chao));

    await ctx.close();
  });
});
