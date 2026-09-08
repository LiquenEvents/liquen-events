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

/** Põe (ou tira) a escolha de aparência no elemento que o servidor marca. */
async function escolher(
  page: import("@playwright/test").Page,
  qual: "auto" | "claro" | "escuro",
) {
  await page.evaluate((q) => {
    const alvo = document.querySelector("[data-admin-mode]") as HTMLElement;
    if (q === "auto") delete alvo.dataset.aparencia;
    else alvo.dataset.aparencia = q;
  }, qual);
}

test.describe("os três estados de aparência @movimento", () => {
  /**
   * ── O DE OMISSÃO É O CLARO, E ISSO É UM PEDIDO DELA ──────────────────────
   *
   * Este passeio existe por causa de uma frase: **«eu quero o fundo branco
   * atenção!»**, dita a olhar para o painel já em escuro.
   *
   * A Parte 5.3 do `docs/DESIGN-SYSTEM.md` pede o contrário — «Automático por
   * omissão», com a Apple atrás — e este caso é o sítio onde fica registado
   * que ganha ela. Com Automático, ter o computador em escuro ao fim do dia
   * punha-lhe o painel escuro sem ela ter pedido nada.
   *
   * A prova tem de ser feita com o sistema em ESCURO: em claro passaria por
   * acidente, e um teste que passa por acidente não guarda nada.
   */
  test("sem escolha nenhuma o painel é CLARO — mesmo com o computador em escuro", async ({
    browser,
  }) => {
    const ctx = await browser.newContext({ colorScheme: "dark" });
    const page = await ctx.newPage();
    await page.goto("/pt/orcamento/admin");
    const m = await chao(page);
    expect(
      luminosidade(m.chao),
      `o computador está em escuro e o painel devia estar branco — o chão saiu ${m.chao}`,
    ).toBeGreaterThan(0.7);
    await ctx.close();
  });

  test("escolhido o automático, segue o sistema nos dois sentidos", async ({ browser }) => {
    for (const esquema of ["light", "dark"] as const) {
      const ctx = await browser.newContext({ colorScheme: esquema });
      const page = await ctx.newPage();
      await page.goto("/pt/orcamento/admin");
      // Sem atributo é o que o servidor manda quando o cookie diz «auto» — o
      // automático não é uma terceira cor, é a AUSÊNCIA de escolha.
      await escolher(page, "auto");
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
    await escolher(p1, "escuro");
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
    await escolher(p2, "claro");
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
    // Escolhe-se o escuro, e não se conta com o sistema: o de omissão passou a
    // ser o CLARO, por pedido dela (ver o primeiro caso deste ficheiro).
    await escolher(page, "escuro");
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
