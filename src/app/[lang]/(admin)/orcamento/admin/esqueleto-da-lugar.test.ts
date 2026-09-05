import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESQUELETO DÁ LUGAR AO CONTEÚDO — NÃO SALTA PARA ELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações em tudo o que seja para ir de uma coisa à
 * outra».
 *
 * É a transição mais repetida do dia inteiro: espera-se, e o que se estava à
 * espera chega. Era, em quase toda a parte, um salto de um fotograma para o
 * outro — as barras cinzentas desapareciam e a lista aparecia no lugar delas,
 * sem nada a ligar as duas coisas.
 *
 * ── AS DUAS METADES, E A SEGUNDA É A QUE SE ESQUECE ───────────────────────
 *
 * 1. O que CHEGA apresenta-se, com a `.bo-cena` — 600 ms, a banda de
 *    apresentação, uma vez só e no contentor.
 * 2. O ESQUELETO não se apresenta. Um esqueleto é a espera, e uma entrada nele
 *    soma-se ao tempo que o React já segura um fallback pintado: meio segundo
 *    antes de aparecer o que quer que seja. Além disso, um esqueleto que entra
 *    devagar anuncia-se como conteúdo — e não é.
 *
 * A segunda metade é a que se perde quando alguém, com boa intenção, «acaba o
 * trabalho» e põe entrada em tudo o que aparece. É por isso que ela é a regra
 * varrida aqui, e não uma nota num comentário.
 *
 * ── O QUE ESTE FICHEIRO NÃO PRENDE ────────────────────────────────────────
 *
 * Que a animação se veja: isso é o browser. E não prende que TODA a espera do
 * back office tenha entrada do lado do conteúdo — só as quatro que foram
 * medidas e tratadas. Uma lista a fingir-se completa era pior do que uma lista
 * curta e honesta.
 */

const PASTA = new URL(".", import.meta.url).pathname;

function ficheiros(): string[] {
  const achados: string[] = [];
  const percorrer = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const caminho = join(dir, e.name);
      if (e.isDirectory()) percorrer(caminho);
      else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) achados.push(caminho);
    }
  };
  percorrer(PASTA);
  return achados;
}

/** As quatro esperas que foram medidas e tratadas, e o contentor que chega. */
const ENTREGAS: { ficheiro: string; contentor: RegExp }[] = [
  { ficheiro: "Acompanhamento.tsx", contentor: /className="bo-cena @container flex flex-col gap-4"/ },
  { ficheiro: "EventTasks.tsx", contentor: /className="bo-cena flex flex-col gap-2"/ },
  { ficheiro: "Propostas.tsx", contentor: /className="bo-cena/ },
  { ficheiro: "Tarefas.tsx", contentor: /className="bo-cena/ },
];

describe("o esqueleto dá lugar ao conteúdo", () => {
  it.each(ENTREGAS)("$ficheiro: o que chega apresenta-se", ({ ficheiro, contentor }) => {
    const fonte = readFileSync(join(PASTA, ficheiro), "utf8");
    // Controlo positivo: há mesmo uma espera desenhada neste ficheiro. Sem
    // isto, apagar o esqueleto fazia o caso passar por outra razão.
    expect(fonte, `${ficheiro} deixou de ter espera desenhada`).toMatch(
      /bo-skeleton|SkeletonList/,
    );
    expect(fonte, `${ficheiro}: o conteúdo que chega não se apresenta`).toMatch(contentor);
  });

  /**
   * A regra varrida: nenhum esqueleto do back office se apresenta a si próprio.
   */
  it("nenhum esqueleto leva entrada", () => {
    const culpados: string[] = [];
    for (const caminho of ficheiros()) {
      const fonte = readFileSync(caminho, "utf8");
      for (const m of fonte.matchAll(/className=\{?["`]([^"`]*\bbo-skeleton\b[^"`]*)["`]/g)) {
        const classe = m[1];
        if (/\b(bo-cena|bo-entrada|view-in)\b/.test(classe)) {
          culpados.push(`${caminho.slice(PASTA.length)} → ${classe.slice(0, 60)}`);
        }
      }
    }
    expect(
      culpados,
      "Um esqueleto é a espera, não uma apresentação: uma entrada aqui soma-se " +
        "ao tempo que o React já segura o fallback, e anuncia como conteúdo o " +
        "que ainda não é.",
    ).toEqual([]);
  });

  /** E o instrumento tem de encontrar mesmo esqueletos. */
  it("o instrumento encontra os esqueletos que existem", () => {
    const comEsqueleto = ficheiros().filter((c) =>
      /bo-skeleton/.test(readFileSync(c, "utf8")),
    );
    expect(comEsqueleto.length, "ficheiros do back office com esqueleto").toBeGreaterThan(3);
  });
});
