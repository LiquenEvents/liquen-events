import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS MOLAS CHEGAM MESMO AO ELEMENTO — MEDIDO NUM BROWSER, NÃO DEDUZIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. O sistema de movimento desta casa tem uma cadeia de quatro
 * elos, e a suite de unidade só vê o primeiro:
 *
 *   1. a constante em `ui/movimento.ts` tem o valor certo;
 *   2. o Tailwind vê a classe no TEXTO do ficheiro e gera a regra;
 *   3. a variável que a regra lê chega ao `:root` do CSS enviado;
 *   4. o browser calcula o que se queria.
 *
 * Numa única ronda partiram-se os elos 2 e 3, um a seguir ao outro, e nenhum
 * deu erro, aviso do lint ou teste vermelho.
 *
 * **O elo 2.** O `ESTADO` estava montado com interpolação —
 * `` `transition-[${PROPRIEDADES}]` ``. O valor em memória estava certo, e por
 * isso todos os testes que o comparam passavam; só que o Tailwind v4 não corre
 * o código, VARRE O TEXTO, e `transition-[${PROPRIEDADES}]` não é candidato
 * nenhum. Zero regras. (Guardado agora no `ui/movimento.test.ts`, que exige
 * que cada classe exportada apareça no ficheiro letra por letra.)
 *
 * **O elo 3.** Corrigido o elo 2, o browser dava as propriedades certas, as
 * curvas certas — e `transition-duration: 0s`. A `--transition-duration-interactive`
 * não existia no `:root`. O `@theme` do Tailwind é PODADO pelo que o `@source`
 * deixa ver, o `globals.css` (a única folha que emite `:root`) diz
 * `@source not "./[lang]/(admin)"`, e o `admin.css` traz o tema com
 * `@reference`, que não emite variáveis. Uma variável que só o back office usa
 * não era vista por ninguém que emitisse. (Corrigido com um `@theme static` no
 * `tema.css`, onde a história está por extenso.)
 *
 * Os dois defeitos têm a mesma assinatura: o CSS fica com a REGRA e sem o
 * VALOR, e a única maneira de os ver é perguntar ao browser. É o que isto faz.
 *
 * ── E PORQUE É QUE NÃO PRECISA DE SESSÃO ───────────────────────────────────
 *
 * O botão medido é o da porta de entrada do back office. É o mesmo `ui/Button`
 * de todos os outros — as classes que se lêem aqui são as que ele dá aos 151
 * botões da casa —, e chega-se-lhe sem gravar nada, o que faz este passeio
 * correr no servidor de produção do CI sem depender de Supabase.
 */

const TEMA = readFileSync(join(process.cwd(), "src/app/tema.css"), "utf8");

/** Os nomes que o `tema.css` declara, lidos de lá e não copiados para aqui. */
function tokensDeclarados(prefixo: string): string[] {
  const achados = TEMA.match(new RegExp(`--${prefixo}-[a-z0-9-]+(?=\\s*:)`, "g")) ?? [];
  return [...new Set(achados)].sort();
}

test.describe("o sistema de movimento chega ao browser @movimento", () => {
  test("todos os tokens de duração e de curva resolvem no `:root`", async ({ page }) => {
    await page.goto("/pt/orcamento/admin");

    const nomes = [...tokensDeclarados("transition-duration"), ...tokensDeclarados("ease")];
    // Se isto for zero, o teste está a passar por não medir nada.
    expect(nomes.length, "nenhum token lido do tema.css — a leitura partiu-se").toBeGreaterThan(20);

    const vazios = await page.evaluate((lista) => {
      const raiz = getComputedStyle(document.documentElement);
      return lista.filter((nome) => raiz.getPropertyValue(nome).trim() === "");
    }, nomes);

    expect(
      vazios,
      "declarados no `tema.css` e ausentes do `:root` enviado — o `@theme` foi " +
        "podado e as regras que os lêem ficam sem valor",
    ).toEqual([]);
  });

  test("um botão real transiciona com dois tempos: o estado e o regresso do toque", async ({
    page,
  }) => {
    await page.goto("/pt/orcamento/admin");
    const botao = page.getByRole("button").filter({ hasText: /\S/ }).first();
    await botao.waitFor({ state: "visible" });

    const medido = await botao.evaluate((el) => {
      const s = getComputedStyle(el);
      const raiz = getComputedStyle(document.documentElement);
      return {
        propriedades: s.transitionProperty.split(",").map((p) => p.trim()),
        duracoes: s.transitionDuration.split(",").map((d) => d.trim()),
        curvas: s.transitionTimingFunction.split(/,(?![^(]*\))/).map((c) => c.trim()),
        estado: raiz.getPropertyValue("--transition-duration-interactive").trim(),
        regresso: raiz.getPropertyValue("--transition-duration-press").trim(),
      };
    });

    // A avaria de origem: `transition-property: all` com `0s` é o que se vê
    // quando NENHUMA regra pegou. Vale a pena dizê-lo com estas palavras.
    expect(medido.propriedades, "nenhuma regra do `ESTADO` pegou neste botão").not.toEqual(["all"]);
    expect(medido.propriedades).toEqual([
      "background-color",
      "border-color",
      "color",
      "box-shadow",
      "opacity",
      "scale",
    ]);

    // As três listas casam posição a posição — é disso que depende o `scale`
    // ter um tempo diferente do resto.
    expect(medido.duracoes).toHaveLength(medido.propriedades.length);
    expect(medido.curvas).toHaveLength(medido.propriedades.length);

    // Os valores vêm dos tokens lidos ao vivo, não de números copiados: quem
    // afinar o degrau no `tema.css` não tem de vir afinar um segundo sítio.
    const segundos = (css: string) => (css.endsWith("ms") ? parseFloat(css) / 1000 : parseFloat(css));
    const emSegundos = (d: string) => parseFloat(d);
    expect(medido.estado, "o token do estado não resolveu").not.toBe("");
    expect(medido.regresso, "o token do regresso não resolveu").not.toBe("");

    for (const d of medido.duracoes.slice(0, 5)) {
      expect(emSegundos(d)).toBeCloseTo(segundos(medido.estado), 4);
    }
    expect(
      emSegundos(medido.duracoes[5]),
      "o `scale` — o regresso do toque — devia assentar com a mola `press`",
    ).toBeCloseTo(segundos(medido.regresso), 4);

    // E nenhuma delas a zero: zero é o valor a que uma `var()` sem valor cai.
    for (const d of medido.duracoes) expect(emSegundos(d)).toBeGreaterThan(0);

    // As curvas são molas (`linear(…)`), e a do regresso é OUTRA — é a
    // assimetria inteira deste sistema num único `expect`.
    for (const c of medido.curvas) expect(c).toMatch(/^linear\(/);
    expect(medido.curvas[5], "o regresso do toque devia ter a sua própria mola").not.toBe(
      medido.curvas[0],
    );
  });
});
