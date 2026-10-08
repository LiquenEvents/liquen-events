// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { metadata as metadadosDo404 } from "../../global-not-found";
import nextConfig from "../../../../next.config";
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
 * A PRIMEIRA SAÍDA foi uma rota apanha-tudo em `(site)/[...caminho]` que
 * desenhava o `NotFoundView`. Deu o 404 desenhado — mas com estado 200: debaixo
 * do `loading.tsx` do `(site)` a resposta vai em streaming e o estado já seguiu
 * quando a rota corre. E `/.env` ou `/backup.zip` nem lá chegavam: o `[lang]`
 * aceitava qualquer valor e servia a página inicial.
 *
 * A SAÍDA DE AGORA (auditoria externa, S5/C3) é a que a documentação nomeia
 * para este caso: `app/global-not-found.tsx`, ligado em next.config.ts. O Next
 * não renderiza rota nenhuma e devolve essa página pronta, com 404 e legível
 * sem JavaScript. E o `[lang]` passa a aceitar só `pt` e `en`.
 */

afterEach(cleanup);

describe("endereço que não existe", () => {
  const APP = join(process.cwd(), "src/app");

  it("o 404 é o global-not-found, ligado na configuração", () => {
    expect(existsSync(join(APP, "global-not-found.tsx"))).toBe(true);
    expect(nextConfig.experimental?.globalNotFound).toBe(true);
  });

  it("não há rota apanha-tudo — é ela que tirava o 404 ao 404", () => {
    // Debaixo do `loading.tsx` do `(site)`, uma rota apanha-tudo responde 200
    // a tudo o que não existe, e o global-not-found deixa de ser chamado.
    const procurar = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
        d.isDirectory()
          ? d.name.startsWith("[...") || d.name.startsWith("[[...")
            ? [join(dir, d.name)]
            : procurar(join(dir, d.name))
          : [],
      );
    expect(procurar(join(APP, "[lang]"))).toEqual([]);
  });

  it("o [lang] só aceita pt e en", async () => {
    const layout = await import("../layout");
    expect((layout as { dynamicParams?: boolean }).dynamicParams).toBe(false);
  });

  it("o 404 pede para não ser indexado, e o título leva a marca uma vez só", () => {
    expect(metadadosDo404.robots).toEqual({ index: false, follow: false });
    const titulo = String(metadadosDo404.title);
    expect(titulo).toBe("404 | Líquen Events");
    expect(titulo.split("Líquen Events")).toHaveLength(2);
  });

  it("o 404 desenhado dá caminhos de volta, e na língua do visitante", async () => {
    for (const locale of ["pt", "en"] as const) {
      const t = getDictionary(locale);
      const { unmount } = render(
        <LocaleProvider locale={locale} dict={pickChromeDict(t)}>
          <NotFoundView />
        </LocaleProvider>,
      );
      // O corpo chega por `next/dynamic` (P1): espera-se por ele.
      const ligacoes = await screen.findAllByRole("link");
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
