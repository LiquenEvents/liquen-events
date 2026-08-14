// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import ApanhaTudo, { generateMetadata as gerarMetadados } from "./[...caminho]/page";
import NotFoundView from "./NotFoundView";
import { LocaleProvider } from "@/components/LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ENDEREÇO ERRADO ERA UM BECO SEM SAÍDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO no HTML construído — `.next/server/app/_not-found.html`, que é o que
 * o sítio servia a QUALQUER endereço que não existisse:
 *
 *   <h1 class="next-error-h1">404</h1>
 *   <h2>This page could not be found.</h2>
 *
 *   • 0 ligações na página inteira (`grep -c '<a '` → 0);
 *   • 0 referências a folha de estilo do sítio;
 *   • em inglês, num sítio cuja língua canónica é o português;
 *   • sem barra de navegação e sem rodapé.
 *
 * Ou seja: quem chegasse por uma ligação partida, por um marcador antigo do
 * sítio anterior que não está na lista de redireccionamentos, ou por um erro
 * de escrita, batia numa página do próprio Next e não tinha por onde
 * continuar. Fecha-se o separador.
 *
 * E não era por falta de página: o `NotFoundView` — 404 desenhado, na língua
 * certa, com seis caminhos de volta — está escrito aqui ao lado desde sempre.
 * Só que um `not-found.tsx` ANINHADO só responde ao `notFound()` chamado
 * dentro do seu ramo (é o que acontece em `/servicos/inexistente`); os
 * endereços que não casam com rota nenhuma são servidos pelo `not-found` da
 * RAIZ do `app/` — ver node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/not-found.md, "the root app/not-found.js … handle any
 * unmatched URLs".
 *
 * E a raiz do `app/` deste projecto NÃO PODE TER UM: o layout de raiz vive num
 * segmento dinâmico (`app/[lang]/layout.tsx`), portanto um `app/not-found.tsx`
 * ficaria sem layout nenhum e o build morre — `next-app-loader` só injecta o
 * layout de recurso enquanto o not-found for o do próprio Next
 * (`isDefaultNotFound`), e a seguir faz `process.exit(1)` com "doesn't have a
 * root layout". A documentação nomeia este caso e manda usar
 * `global-not-found.js`, que é uma bandeira experimental em next.config.ts.
 *
 * A SAÍDA, sem tocar na configuração: uma rota apanha-tudo dentro de `(site)`
 * que chama `notFound()`. Passa a HAVER rota, portanto o 404 volta a ser
 * tratado dentro do ramo — com o layout do sítio (menu e rodapé), com a língua
 * do segmento e com o `NotFoundView` desenhado. Segmento estático e dinâmico
 * ganham sempre ao apanha-tudo, logo nenhuma página real muda de destino.
 */

afterEach(cleanup);

describe("endereço que não existe", () => {
  it("há uma rota apanha-tudo no ramo do sítio", () => {
    // Se alguém a apagar, o 404 volta em silêncio à página nua do Next — não
    // há erro de compilação nenhum a denunciá-lo.
    const segmentos = readdirSync(join(process.cwd(), "src/app/[lang]/(site)"), {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    expect(segmentos.filter((s) => s.startsWith("[..."))).toHaveLength(1);
  });

  /**
   * ── ISTO EXIGIA `notFound()`, E O `notFound()` ERA O DEFEITO ──────────────
   *
   * O que aqui estava exigia que a rota apanha-tudo ATIRASSE
   * `NEXT_HTTP_ERROR_FALLBACK;404`, na convicção — escrita no comentário do
   * `page.tsx` — de que era assim que o sítio devolvia um 404. MEDIDO com o
   * sítio a correr, não devolvia: a resposta vai em streaming (o `loading.tsx`
   * do grupo (site) é uma fronteira `<Suspense>`) e o estado era 200 na
   * mesma — a documentação do Next di-lo por extenso em loading.md, «Status
   * Codes». O `notFound()` não estava a comprar o 404 que este teste julgava
   * estar a guardar; estava só a pagar três preços, todos medidos e todos
   * agora em `e2e/endereco-que-nao-existe.spec.ts`:
   *
   *   • sem JavaScript a página ficava BRANCA (o `notFound()` atirado dentro
   *     da fronteira não deixa HTML atrás de si — a gaveta do React vinha
   *     vazia, sem sequer o `id="S:0"` que a regra do globals.css revela);
   *   • o `<title>` era o da PÁGINA INICIAL, porque o cabeçalho já tinha
   *     seguido quando o `notFound()` rebentou;
   *   • saíam DOIS `<meta name="robots">` a dizer o contrário um do outro,
   *     `index, follow` à frente e `noindex` atrás.
   *
   * O contrato passa a ser o que se pode mesmo cumprir: a rota DESENHA o 404,
   * com o cabeçalho a sair dos seus próprios metadados. E o que este teste
   * guarda agora é isso — que ela devolve conteúdo e não uma excepção.
   */
  it("desenha o 404 em vez de o atirar (e por isso ele existe sem JavaScript)", async () => {
    let erro: unknown;
    let saida: unknown;
    try {
      saida = await ApanhaTudo();
    } catch (e) {
      erro = e;
    }
    expect(
      erro,
      "a rota apanha-tudo voltou a atirar em vez de desenhar — sem JavaScript isso é um ecrã em branco",
    ).toBeUndefined();
    expect(saida, "a rota apanha-tudo não devolveu nó nenhum").toBeTruthy();
    // E o que ela devolve é o 404 desenhado, não outra coisa qualquer.
    expect((saida as { type?: unknown }).type).toBe(NotFoundView);
  });

  it("o apanha-tudo pede para não ser indexado, e só uma vez", async () => {
    // O `robots` tem de vir DESTA rota: era a ausência dele aqui que deixava o
    // `index, follow` do sítio à frente do `noindex` que o Next injecta.
    const meta = await gerarMetadados({ params: Promise.resolve({ lang: "pt" }) });
    expect(meta.robots, "o apanha-tudo deixou de declarar robots").toEqual({
      index: false,
      follow: false,
    });
    // E o título é o do 404, SEM a marca à mão: quem a acrescenta é o molde
    // `template: "%s | Líquen Events"` do layout de raiz, e escrevê-la aqui
    // punha-a duas vezes no separador.
    expect(String(meta.title)).toBe(getDictionary("pt").errors.notFoundEyebrow);
    expect(String(meta.title)).not.toContain("Líquen Events");
  });

  it("o 404 desenhado dá caminhos de volta, e na língua do visitante", () => {
    for (const locale of ["pt", "en"] as const) {
      const t = getDictionary(locale);
      const { unmount } = render(
        <LocaleProvider locale={locale} dict={pickChromeDict(t)}>
          <NotFoundView />
        </LocaleProvider>,
      );
      const ligacoes = screen.getAllByRole("link");
      expect(ligacoes.length, "um 404 sem saídas é um beco").toBeGreaterThanOrEqual(5);
      // Em inglês as ligações levam o prefixo /en; em português são nuas.
      for (const a of ligacoes) {
        const href = a.getAttribute("href") ?? "";
        expect(href.startsWith("/en"), `${locale}: ${href}`).toBe(locale === "en");
      }
      unmount();
    }
  });
});
