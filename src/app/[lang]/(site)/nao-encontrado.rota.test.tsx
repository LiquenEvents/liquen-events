// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync } from "node:fs";
import { join } from "node:path";

import ApanhaTudo from "./[...caminho]/page";
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

  it("responde 404 em vez de desenhar uma página", async () => {
    let erro: unknown;
    try {
      await ApanhaTudo();
    } catch (e) {
      erro = e;
    }
    expect(erro, "a rota apanha-tudo tem de chamar notFound()").toBeInstanceOf(Error);
    expect((erro as { digest?: string }).digest).toBe("NEXT_HTTP_ERROR_FALLBACK;404");
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
