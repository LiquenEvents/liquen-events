import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEM JAVASCRIPT, O CONTEÚDO TEM DE ESTAR LÁ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. `/orcamento` com o JS desligado era um ecrã em branco: o
 * cabeçalho, um ponto a pulsar a meio, e mais nada. O formulário ESTAVA no HTML
 * — `<form>`, dez campos, o botão de enviar — com altura 0 e largura 0.
 *
 * A causa não era animação nenhuma: era a renderização em streaming do React. O
 * `loading.tsx` do grupo (site) é uma fronteira `<Suspense>`; o React manda
 * primeiro a casca com o ecrã de espera e o conteúdo a sério vai a seguir,
 * dentro de um `<div hidden id="S:0">` no fim do `<body>`, com um `<script>`
 * atrás que o mete no sítio. Sem JS esse script nunca corre — e o conteúdo fica
 * na gaveta. Valia para o sítio todo; a `/orcamento` era a única que ficava
 * LITERALMENTE branca, porque é a única que esconde o rodapé (que está fora da
 * fronteira e por isso ainda se via nas outras).
 *
 * A correcção é uma folha `<noscript>` no layout de raiz (o comentário longo
 * está lá) e a saída da `opacity` do estado de repouso da entrada dos campos
 * (`orc-field-in`, globals.css) — eram duas fechaduras da mesma porta.
 *
 * ⚠ NÃO cobre o caso do pedaço de JavaScript que falha a carregar: nesse caso o
 * script da troca — que vem EM LINHA no HTML — corre na mesma, e o que se perde
 * é a hidratação, não o conteúdo.
 */
test.describe("com o JavaScript indisponível", () => {
  test.use({ javaScriptEnabled: false });

  test("o formulário de orçamento vê-se, com os campos e o botão de enviar", async ({ page }) => {
    await page.goto("/orcamento");

    const medida = await page.evaluate(() => {
      const form = document.querySelector("form");
      // O `input[name="website"]` fica de fora: é o alçapão para robôs
      // (`absolute -left-[9999px] h-0 w-0 opacity-0`), e ter altura 0 é o
      // trabalho dele. Contá-lo faria este teste exigir que ele se visse.
      const campos = form
        ? [...form.querySelectorAll("input,select,textarea")].filter(
            (c) => c.getAttribute("name") !== "website",
          )
        : [];
      const submeter = form?.querySelector('button[type="submit"]');
      const alto = (el: Element | null | undefined) =>
        el ? Math.round(el.getBoundingClientRect().height) : 0;
      return {
        alturaDoFormulario: alto(form),
        campos: campos.length,
        camposComAltura: campos.filter((c) => alto(c) > 0).length,
        alturaDoBotaoDeEnviar: alto(submeter),
        // O ecrã de espera do `loading.tsx` não pode ficar a ocupar o lugar.
        ecraDeEsperaVisivel: alto(document.querySelector(".ecra-de-espera")) > 0,
      };
    });

    expect(medida.campos, "o formulário nem sequer veio no HTML").toBeGreaterThanOrEqual(9);
    expect(
      medida.alturaDoFormulario,
      "o formulário está no HTML mas mede 0 px de altura — está escondido em vez de ausente",
    ).toBeGreaterThan(400);
    expect(
      medida.camposComAltura,
      "há campos no HTML com altura 0 — a entrada dos campos voltou a depender da opacidade",
    ).toBe(medida.campos);
    expect(medida.alturaDoBotaoDeEnviar, "o botão de enviar mede 0 px").toBeGreaterThan(20);
    expect(medida.ecraDeEsperaVisivel, "o ecrã de espera ficou por cima do conteúdo").toBe(false);

    // E vê-se mesmo: o <h1> da página tem de estar dentro do primeiro ecrã.
    const h1 = page.locator("h1");
    await expect(h1).toBeVisible();
  });

  test("as outras páginas públicas também mostram o que têm", async ({ page }) => {
    // O defeito era do sítio inteiro — a `/orcamento` era só onde doía mais.
    for (const rota of ["/", "/servicos", "/contacto"]) {
      await page.goto(rota);
      const h1 = page.locator("h1").first();
      await expect(h1, `o <h1> de ${rota} não se vê sem JavaScript`).toBeVisible();
      const altura = await h1.evaluate((el) => Math.round(el.getBoundingClientRect().height));
      expect(altura, `o <h1> de ${rota} mede 0 px`).toBeGreaterThan(10);
    }
  });
});
