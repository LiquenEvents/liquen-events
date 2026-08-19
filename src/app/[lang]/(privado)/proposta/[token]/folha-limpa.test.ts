import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA DE UM CASAL NÃO LEVA O SÍTIO À VOLTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A decisão está escrita no cabeçalho de `(privado)/layout.tsx`; isto é o que
 * a prende. O que se afirma é uma AUSÊNCIA — não há menu, não há rodapé, não
 * há CTA fixo —, e uma ausência afirma-se mal: um teste que procure a barra de
 * navegação no HTML desta página passaria também se a página deixasse de
 * desenhar seja o que for.
 *
 * Por isso a pergunta é feita à ESTRUTURA, que é onde a decisão vive: dos
 * `layout.tsx` que o Next aplica a esta rota — os que estão no caminho entre a
 * página e a raiz de `src/app` —, nenhum monta o `CromadoDoSitio`.
 *
 * ── O CONTROLO POSITIVO ───────────────────────────────────────────────────
 * A mesma travessia, feita a partir de uma página do sítio institucional,
 * TEM de encontrar o cromado. Sem isto, a travessia podia estar simplesmente
 * a olhar para o sítio errado (um caminho mal escrito, um `existsSync` sempre
 * falso) e o teste de cima passava por não ver nada em lado nenhum.
 */

/**
 * O layout IMPORTA mesmo o cromado?
 *
 * A pergunta é feita ao `import`, e não a uma procura da palavra no ficheiro:
 * tanto este ramo como o layout de raiz NOMEIAM o `CromadoDoSitio` nos
 * comentários para explicar porque é que não o montam, e uma procura por
 * substring lia essas explicações como se fossem o próprio cromado. Foi
 * exactamente o que aconteceu à primeira versão deste teste.
 */
function montaOCromado(ficheiro: string): boolean {
  const fonte = readFileSync(ficheiro, "utf8");
  return /from\s+["']@\/components\/CromadoDoSitio["']/.test(fonte);
}

/** Os `layout.tsx` que o Next aplica a uma página, da página até `src/app`. */
function layoutsDaRota(paginaAbsoluta: string): string[] {
  const raiz = join(process.cwd(), "src", "app");
  const encontrados: string[] = [];
  let dir = dirname(paginaAbsoluta);
  for (;;) {
    const l = join(dir, "layout.tsx");
    if (existsSync(l)) encontrados.push(l);
    if (dir === raiz) break;
    const pai = dirname(dir);
    if (pai === dir) break;
    dir = pai;
  }
  return encontrados;
}

const A_PAGINA = join(
  process.cwd(),
  "src/app/[lang]/(privado)/proposta/[token]/page.tsx",
);
const UMA_PAGINA_DO_SITIO = join(process.cwd(), "src/app/[lang]/(site)/page.tsx");

describe("a página da proposta é folha limpa", () => {
  it("nenhum layout desta rota monta o cromado do sítio", () => {
    const layouts = layoutsDaRota(A_PAGINA);
    // A travessia tem de ter encontrado alguma coisa — o layout de raiz existe
    // sempre. Sem esta linha, um caminho errado dava uma lista vazia e o
    // `every` de baixo passava sem ter olhado para ficheiro nenhum.
    expect(layouts.length).toBeGreaterThan(0);
    const comCromado = layouts.filter(montaOCromado);
    expect(comCromado, `layouts com cromado: ${comCromado.join(", ")}`).toEqual([]);
  });

  it("CONTROLO POSITIVO: a mesma travessia encontra o cromado numa página do sítio", () => {
    const layouts = layoutsDaRota(UMA_PAGINA_DO_SITIO);
    const comCromado = layouts.filter(montaOCromado);
    expect(comCromado.length).toBeGreaterThan(0);
  });
});
