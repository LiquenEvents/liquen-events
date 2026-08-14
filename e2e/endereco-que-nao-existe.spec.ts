import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ENDEREÇO QUE NÃO EXISTE TEM DE SE APRESENTAR COMO TAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `[...caminho]/page.tsx` foi escrito para apanhar tudo o que não tem rota e
 * mandar isso ao `NotFoundView` — o 404 desenhado, na língua do visitante, com
 * seis caminhos de volta. O comentário que lá está diz, por extenso, «o estado
 * HTTP continua a ser 404» e «passa a HAVER rota para o que não existe».
 *
 * MEDIDO em `/nao-existe-esta-pagina`, com o sítio a correr, três coisas
 * diferentes do que está escrito:
 *
 *  1. SEM JAVASCRIPT A PÁGINA ERA BRANCA. A 390×844, `javaScriptEnabled:false`:
 *     `<main>` media 844 px, `innerText` era a string vazia, zero `<h1>`, e a
 *     palavra «404» não aparecia em lado nenhum do que se via. A barra e o
 *     rodapé ficavam — pelo meio, um ecrã inteiro de nada.
 *
 *     A CAUSA é a mesma que `sem-javascript.spec.ts` já documenta para a
 *     `/orcamento`: o `loading.tsx` do grupo (site) é uma fronteira
 *     `<Suspense>`, e a resposta vai em streaming. Só que aqui é PIOR do que o
 *     caso da gaveta: o `notFound()` atirado DENTRO da fronteira não deixa
 *     HTML nenhum para trás. Medido no HTML servido, a gaveta do React estava
 *     vazia — `<div hidden=""><!--$--><!--/$--></div>`, sem sequer o `id="S:0"`
 *     de que a regra do `globals.css` precisa para a revelar. O texto do
 *     `NotFoundView` só aparecia dentro do payload RSC, num `<script>`.
 *     Não havia nada para revelar: sem JS não havia 404 nenhum.
 *
 *  2. O `<title>` ERA O DA PÁGINA INICIAL. `/nao-existe-esta-pagina` devolvia
 *     «Decoração de Casamentos e Eventos | Líquen Events» — o cabeçalho já
 *     tinha sido despachado com os metadados do sítio quando o `notFound()`
 *     rebentou lá dentro. O `not-found.tsx` declara `title: "404 | Líquen
 *     Events"` e esse nunca chegava ao documento. Uma ligação partida
 *     partilhada no WhatsApp pré-visualizava como se fosse a página inicial.
 *
 *  3. DOIS `<meta name="robots">` CONTRADITÓRIOS, nesta ordem: primeiro
 *     `index, follow` (o do sítio), depois `noindex` (a rede de segurança que o
 *     Next injecta quando faz streaming de um 404 — está documentada em
 *     node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/
 *     loading.md, "Status Codes"). O `not-found.tsx` pede
 *     `robots: { index: false, follow: false }` e esse pedido nunca ganhava o
 *     primeiro lugar.
 *
 * O estado HTTP 200 NÃO é tratado aqui, e é de propósito: a documentação do
 * Next diz que em streaming o 200 é o comportamento próprio («a 200 status code
 * will be returned to signal that the request was successful … the status code
 * of the response cannot be updated»), e o remédio que ela aponta é uma
 * verificação de rota no `proxy` — coisa de outra dimensão. O que este teste
 * exige é o que se vê e o que os motores de busca lêem.
 */

const ENDERECOS = [
  { rota: "/nao-existe-esta-pagina", lingua: "pt" },
  { rota: "/en/no-such-page-here", lingua: "en" },
];

/**
 * Os endereços que caem no `notFound()` de um RAMO, e não no apanha-tudo: um
 * serviço, um pólo e um estilo que não existem. Chegam cá pela mesma via — uma
 * ligação partida, um erro de escrita —, e cada um deles tem um
 * `generateMetadata` próprio que já devolve um título de «não encontrado».
 *
 * MEDIDO, e era o mesmo defeito nos três: nenhum declarava `robots`, portanto o
 * `index, follow` do sítio ficava à frente do `noindex` que o Next injecta, e a
 * resposta saía com DUAS etiquetas a dizerem o contrário uma da outra. Estas
 * páginas não existem: nenhuma delas se indexa.
 */
const RAMOS = [
  "/servicos/servico-que-nao-existe",
  "/casamentos/polo-que-nao-existe",
  "/casamentos/estilo/estilo-que-nao-existe",
  "/en/servicos/no-such-service",
];

test.describe("um endereço que não existe", () => {
  for (const { rota, lingua } of ENDERECOS) {
    test(`${rota} — diz que não existe mesmo sem JavaScript`, async ({ browser }) => {
      // Um telemóvel, sem JavaScript: é o caso em que a página ficava branca.
      const ctx = await browser.newContext({
        viewport: { width: 390, height: 844 },
        javaScriptEnabled: false,
      });
      const page = await ctx.newPage();
      await page.goto(rota);

      const medida = await page.evaluate(() => {
        const texto = (document.body.innerText || "").replace(/\s+/g, " ").trim();
        return {
          texto,
          tem404: /\b404\b/.test(texto),
          h1: [...document.querySelectorAll("h1")].map((h) => h.textContent?.trim() ?? ""),
          // Quantas ligações há no corpo da página (fora da barra e do rodapé)?
          // O 404 desenhado leva sete caminhos de volta; um ecrã em branco leva
          // zero, e é essa a diferença entre um beco sem saída e uma saída.
          ligacoesNoConteudo: document.querySelectorAll(
            "main a[href], div[hidden][id^='S:'] a[href]",
          ).length,
        };
      });

      expect(
        medida.tem404,
        `sem JavaScript, "${rota}" não diz "404" em lado nenhum — o que se lê é: "${medida.texto.slice(0, 160)}"`,
      ).toBe(true);
      expect(
        medida.h1.length,
        `sem JavaScript, "${rota}" não tem <h1> nenhum — a página não se apresenta`,
      ).toBeGreaterThan(0);
      expect(
        medida.ligacoesNoConteudo,
        `sem JavaScript, "${rota}" não oferece um único caminho de volta no conteúdo`,
      ).toBeGreaterThan(0);

      await ctx.close();
    });

    test(`${rota} — o <title> e o robots são os do 404, não os da página inicial`, async ({
      page,
    }) => {
      await page.goto(rota);

      const titulo = await page.title();
      expect(titulo, `"${rota}" está a servir o <title> de outra página: "${titulo}"`).toMatch(
        /404|não encontrada|not found/i,
      );

      // TODOS os `robots`, não só o primeiro: o defeito era haver dois, e o que
      // vinha à frente era o `index, follow` do sítio.
      const robots = await page.evaluate(() =>
        [...document.querySelectorAll('meta[name="robots"]')].map((m) =>
          (m as HTMLMetaElement).content.toLowerCase(),
        ),
      );
      expect(
        robots.length,
        `"${rota}" tem ${robots.length} etiquetas robots: ${JSON.stringify(robots)}`,
      ).toBeGreaterThan(0);
      expect(
        robots.every((r) => r.includes("noindex")),
        `"${rota}" traz uma etiqueta robots que manda indexar: ${JSON.stringify(robots)}`,
      ).toBe(true);

      // E a língua tem de ser a de quem lá chegou. Comparação por prefixo: o
      // sítio escreve a etiqueta completa («pt-PT», «en-GB»), e é a SUBTAG de
      // idioma que aqui interessa.
      const lang = await page.evaluate(() => document.documentElement.lang);
      expect(lang, `"${rota}" respondeu na língua errada`).toMatch(
        new RegExp(`^${lingua}(-|$)`, "i"),
      );
    });
  }

  for (const rota of RAMOS) {
    test(`${rota} — não se manda indexar uma página que não existe`, async ({ page }) => {
      await page.goto(rota);

      const robots = await page.evaluate(() =>
        [...document.querySelectorAll('meta[name="robots"]')].map((m) =>
          (m as HTMLMetaElement).content.toLowerCase(),
        ),
      );
      expect(robots.length, `"${rota}" não traz etiqueta robots nenhuma`).toBeGreaterThan(0);
      expect(
        robots.every((r) => r.includes("noindex")),
        `"${rota}" traz uma etiqueta robots que manda indexar: ${JSON.stringify(robots)}`,
      ).toBe(true);
    });
  }
});
