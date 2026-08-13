import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { generateMetadata } from "./[slug]/page";
import { todosOsCaminhos } from "@/lib/meta/variantes";
import { LOCALES } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS METADADOS DAS VARIANTES SOCIAIS — O QUE SAI MESMO NO <head>
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas que este ficheiro prende, e ambas só se vêem DEPOIS de o Next
 * juntar o que a página devolve ao que os layouts acima dela declararam. Ler o
 * `generateMetadata` da página não chegava para descobrir nenhuma das duas:
 * o defeito não estava no que a página dizia, estava no que ela deixava por
 * dizer.
 *
 * ── 1. A MARCA ESCRITA DUAS VEZES NO <title> ───────────────────────────────
 * MEDIDO no HTML construído, antes da correcção:
 *
 *   <title>Casamentos na Comporta | Líquen Events | Líquen Events</title>
 *
 * O `metaTitle` do catálogo (src/lib/meta/variantes.ts) já foi escrito COM a
 * marca lá dentro. Entregue como `title` de texto simples, leva por cima o
 * modelo do layout de raiz — `template: "%s | Líquen Events"` — e a marca sai
 * duas vezes. São 5 variantes × 2 ganchos × 2 idiomas = 20 endereços.
 *
 * É o MESMO defeito que `casamentos/titulos.test.ts` já prendia no ramo do
 * Google, e leva a MESMA cura: `title: { absolute: … }`. Duas curas diferentes
 * para o mesmo mal é como se acaba com dois comportamentos.
 *
 * Aqui o separador do browser não decide cliques (a página é `noindex` e o
 * tráfego é todo pago), mas o título viaja: é o que a pré-visualização do
 * WhatsApp e o browser interno do Instagram mostram por cima da página.
 *
 * ── 2. O CANÓNICO QUE APONTAVA PARA A PÁGINA INICIAL ───────────────────────
 * O comentário do `generateMetadata` dizia que estas páginas não emitem
 * canónico. Emitiam: o layout de raiz declara
 * `alternates: { canonical, languages }` e o Next só o substitui se o
 * descendente declarar a chave `alternates`. Como a página não a declarava,
 * as 20 herdavam-no e diziam todas `<link rel="canonical" href="…/">` — ou
 * seja, "isto é uma cópia da página inicial", vindo de páginas `noindex`.
 *
 * O custo em pesquisa é baixo, porque `noindex` chega primeiro. O custo a
 * sério era o comentário: prometia o contrário do que o HTML fazia, e um
 * comentário assim é pior do que comentário nenhum.
 *
 * ── 3. UM CARTÃO SOCIAL PARA UMA PÁGINA QUE NÃO EXISTE ─────────────────────
 * A variante internacional é `soEm: "en"`, e a página faz `notFound()` quando
 * lhe pedem o português. O `generateMetadata` não fazia a mesma pergunta:
 * `/pt/s/portugal` devolvia título e `og:image` completos por cima de um 404.
 * Colado no WhatsApp, o endereço mostrava um cartão com a fotografia da capa e
 * levava quem carregasse a uma página de erro.
 */

/** O modelo declarado em src/app/[lang]/layout.tsx (guardado abaixo). */
const MODELO = " | Líquen Events";
/** Conta-se "Líquen" e não o nome completo — ver a nota em casamentos/titulos.test.ts. */
const MARCA = "Líquen";

/** O que o browser acabaria por mostrar, depois de o Next aplicar o modelo. */
function tituloFinal(meta: Metadata): string {
  const t = meta.title;
  if (typeof t === "string") return t + MODELO;
  if (t && typeof t === "object" && "absolute" in t && typeof t.absolute === "string") {
    return t.absolute;
  }
  throw new Error(`título em formato inesperado: ${JSON.stringify(t)}`);
}

function vezes(texto: string, agulha: string): number {
  return texto.split(agulha).length - 1;
}

interface Caso {
  nome: string;
  meta: () => Promise<Metadata>;
}

/** Os vinte endereços do ramo: 5 variantes × 2 ganchos × 2 idiomas. */
const todos: Caso[] = [];
/** Os que a página desenha mesmo. */
const servidos: Caso[] = [];
/** Os que a página 404 por a variante estar restrita a um idioma (`soEm`). */
const naoServidos: Caso[] = [];

for (const lang of LOCALES) {
  for (const c of todosOsCaminhos()) {
    const caso: Caso = {
      nome: `/${lang}/s/${c.slug}`,
      meta: () => generateMetadata({ params: Promise.resolve({ lang, slug: c.slug }) }),
    };
    todos.push(caso);
    (c.variante.soEm && c.variante.soEm !== lang ? naoServidos : servidos).push(caso);
  }
}

describe("metadados das variantes sociais", () => {
  it("os casos não passam por vacuidade", () => {
    expect(todos.length).toBe(20);
    expect(servidos.length).toBe(18);
    // `portugal` e `portugal-b` em português — a variante internacional.
    expect(naoServidos.map((c) => c.nome)).toEqual(["/pt/s/portugal", "/pt/s/portugal-b"]);
  });

  it("o layout de raiz continua a acrescentar a marca a todos os títulos simples", () => {
    // Se este modelo desaparecer, metade deste ficheiro deixa de medir o que
    // pensa que mede — daí lê-lo do ficheiro em vez de o assumir.
    const layout = readFileSync(join(process.cwd(), "src/app/[lang]/layout.tsx"), "utf8");
    expect(layout).toContain('template: "%s | Líquen Events"');
  });

  it("o layout de raiz continua a declarar um canónico que desce por herança", () => {
    // A mesma razão: sem `alternates` na raiz, a chave explícita na página
    // deixava de estar a impedir alguma coisa e ninguém dava por isso.
    const layout = readFileSync(join(process.cwd(), "src/app/[lang]/layout.tsx"), "utf8");
    expect(layout).toMatch(/alternates:\s*\{\s*\n?\s*canonical/);
  });

  // A marca conta-se em TODOS os vinte, incluindo os que 404: o título da
  // página de erro passa pelo mesmo modelo do layout de raiz.
  it.each(todos)("$nome escreve a marca uma só vez no <title>", async ({ meta }) => {
    const m = await meta();
    const titulo = tituloFinal(m);
    expect(vezes(titulo, MARCA), `<title> saiu "${titulo}"`).toBe(1);
  });

  it.each(servidos)("$nome escreve a marca uma só vez no og:title", async ({ meta }) => {
    const m = await meta();
    const og = (m.openGraph as { title?: string } | undefined)?.title ?? "";
    expect(vezes(og, MARCA), `og:title saiu "${og}"`).toBe(1);
  });

  it.each(naoServidos)("$nome não anuncia uma página que a seguir 404", async ({ meta }) => {
    const m = await meta();
    // Sem cartão social nenhum: é o `og:image` que faz o endereço parecer uma
    // página a sério quando se cola numa conversa.
    expect(m.openGraph, `og de um 404: ${JSON.stringify(m.openGraph)}`).toBeUndefined();
    // E o título é o do erro, não o da variante.
    expect(tituloFinal(m)).toBe("Página não encontrada | Líquen Events");
  });

  it.each(todos)("$nome não emite canónico nenhum", async ({ meta }) => {
    const m = await meta();
    // A CHAVE tem de estar presente: é a presença dela, e não o valor, que faz
    // o Next descartar o `alternates` do layout de raiz em vez de o herdar.
    expect(
      Object.prototype.hasOwnProperty.call(m, "alternates"),
      "sem a chave `alternates`, a página herda o canónico da raiz (aponta para /)",
    ).toBe(true);
    // E o valor tem de ser `null`, que é o que o resolvedor do Next lê como
    // "nem canónico nem hreflang". Um `{}` deixava a chave lá sem dizer nada.
    expect(m.alternates).toBeNull();
  });

  it("a página de erro também não arrasta o canónico da raiz", async () => {
    const m = await generateMetadata({
      params: Promise.resolve({ lang: "pt", slug: "slug-que-nao-existe" }),
    });
    expect(Object.prototype.hasOwnProperty.call(m, "alternates")).toBe(true);
    expect(m.alternates).toBeNull();
  });
});
