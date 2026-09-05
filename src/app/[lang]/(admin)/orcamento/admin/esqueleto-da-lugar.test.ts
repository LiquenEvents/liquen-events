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

/**
 * As esperas que foram medidas e tratadas: o que se via enquanto se esperava
 * (`espera`) e o contentor que chega e se apresenta (`contentor`).
 *
 * O `espera` é o CONTROLO POSITIVO de cada linha, e por isso é por entrega e
 * não um só padrão para todas: nem toda a espera do back office é um esqueleto.
 * Há três formas nesta lista — as barras `bo-skeleton`/`SkeletonList`, uma
 * linha de texto («A carregar…», «A ler as propostas…») onde a forma do que vem
 * não se sabe de antemão, e o `loading` de um botão que pode demorar dezenas de
 * segundos. Sem esta coluna, apagar a espera de um ficheiro fazia o caso passar
 * pela razão errada.
 */
const ENTREGAS: { ficheiro: string; espera: RegExp; contentor: RegExp }[] = [
  {
    ficheiro: "Acompanhamento.tsx",
    espera: /bo-skeleton|SkeletonList/,
    contentor: /className="bo-cena @container flex flex-col gap-4"/,
  },
  {
    ficheiro: "EventTasks.tsx",
    espera: /bo-skeleton|SkeletonList/,
    contentor: /className="bo-cena flex flex-col gap-2"/,
  },
  {
    ficheiro: "Propostas.tsx",
    espera: /bo-skeleton|SkeletonList/,
    contentor: /className="bo-cena/,
  },
  { ficheiro: "Tarefas.tsx", espera: /bo-skeleton|SkeletonList/, contentor: /className="bo-cena/ },
  // ── E as esperas que faltavam ─────────────────────────────────────────────
  // Todas o mesmo defeito, todas a mesma cura: o esqueleto (ou a linha de
  // espera) sai, e o que chega apresenta-se com a `.bo-cena` em vez de assentar
  // num fotograma.
  {
    ficheiro: "Servicos.tsx",
    espera: /SkeletonList rows=\{4\}/,
    contentor: /className="bo-cena flex flex-col gap-4"/,
  },
  {
    ficheiro: "Fornecedores.tsx",
    espera: /SkeletonCard/,
    contentor: /className="bo-cena grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"/,
  },
  {
    ficheiro: "Inventario.tsx",
    espera: /bo-skeleton h-9 w-full/,
    contentor: /<Card padding="none" className="bo-cena">/,
  },
  {
    ficheiro: "EmailTemplates.tsx",
    espera: /SkeletonList rows=\{4\}/,
    contentor: /className="bo-cena max-w-6xl grid grid-cols-1 lg:grid-cols-\[220px_1fr\] gap-5"/,
  },
  {
    ficheiro: "EmailTemplatesBilingue.tsx",
    espera: /SkeletonList rows=\{4\}/,
    contentor: /className="bo-cena max-w-6xl grid grid-cols-1 lg:grid-cols-\[220px_1fr\] gap-5"/,
  },
  {
    ficheiro: "Agenda.tsx",
    espera: /<SkeletonRow \/>/,
    contentor: /className="bo-cena">\s*\{days\.map\(/,
  },
  {
    ficheiro: "BibliotecaRevisao.tsx",
    espera: /bo-skeleton aspect-square rounded-lg/,
    contentor: /className="bo-cena grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-8"/,
  },
  {
    // A espera aqui é texto e não barras: uma lista de material não tem forma
    // conhecida de antemão, e um esqueleto que adivinhasse mal saltava na mesma.
    ficheiro: "MaterialListas.tsx",
    espera: /A carregar…/,
    contentor: /className="bo-cena">/,
  },
  {
    ficheiro: "AnalisePropostas.tsx",
    espera: /A ler as propostas…/,
    contentor: /className="bo-cena flex flex-col gap-6"/,
  },
  {
    // E aqui a espera é o próprio botão («A contar…»), que percorre a
    // biblioteca inteira antes de responder.
    ficheiro: "Miniaturas.tsx",
    espera: /A contar…/,
    contentor: /className="bo-cena mt-4 space-y-1\.5 text-xs"/,
  },
];

/**
 * O que o `lazy.tsx` desenha enquanto o CÓDIGO de uma ferramenta não chega, e a
 * promessa que ele fazia sobre o que acontece a seguir. Ver o teste no fundo.
 */
const PROMESSA_DA_ENTRADA = /`\.bo-cena` que cada uma traz/;

describe("o esqueleto dá lugar ao conteúdo", () => {
  it.each(ENTREGAS)("$ficheiro: o que chega apresenta-se", ({ ficheiro, espera, contentor }) => {
    const fonte = readFileSync(join(PASTA, ficheiro), "utf8");
    // Controlo positivo: há mesmo uma espera desenhada neste ficheiro. Sem
    // isto, apagar o esqueleto fazia o caso passar por outra razão.
    expect(fonte, `${ficheiro} deixou de ter espera desenhada`).toMatch(espera);
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

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O `lazy.tsx` NÃO PODE PROMETER UMA ENTRADA QUE A FERRAMENTA NÃO TRAZ
   * ════════════════════════════════════════════════════════════════════════
   *
   * O comentário do `PanelLoading` dizia, sobre as ferramentas do painel de
   * detalhe: «Quem se apresenta é a ferramenta que chega — e essa entra pela
   * `.bo-cena` que cada uma traz.» CONTADO: duas das catorze traziam.
   *
   * A frase é perigosa por causa do que está ao lado dela — a regra, essa
   * verdadeira, de que o esqueleto NÃO leva entrada. Quem lesse as duas juntas
   * concluía que a metade da CHEGADA já estava feita, e a única coisa que
   * sobrava para «acabar o trabalho» era a metade do ESQUELETO, que é
   * precisamente a que não se pode tocar. As duas são coisas diferentes.
   *
   * Este caso deixa as duas saídas em aberto e fecha a do meio: ou o ficheiro
   * não faz a promessa, ou faz e ela é verdadeira. O que não pode é prometer e
   * não cumprir.
   */
  it("o lazy.tsx não promete uma entrada que a ferramenta não traz", () => {
    const lazy = readFileSync(join(PASTA, "lazy.tsx"), "utf8");
    const modulos = [...lazy.matchAll(/import\("\.\/(\w+)"\)/g)].map((m) => m[1]);
    // Controlo positivo do instrumento: se isto deixar de encontrar módulos, o
    // caso passa a não medir nada.
    expect(modulos.length, "módulos desenhados por `dynamic` no lazy.tsx").toBeGreaterThan(10);

    if (!PROMESSA_DA_ENTRADA.test(lazy)) return;

    const semEntrada = modulos.filter(
      (nome) => !/bo-cena/.test(readFileSync(join(PASTA, `${nome}.tsx`), "utf8")),
    );
    expect(
      semEntrada,
      "O `lazy.tsx` diz que a ferramenta que chega traz `.bo-cena`, e estas não " +
        "trazem. Ou se lhes dá a entrada, ou se apaga a promessa — o que não " +
        "serve é o comentário mandar a pessoa seguinte tratar do esqueleto.",
    ).toEqual([]);
  });

  /** E o instrumento tem de encontrar mesmo esqueletos. */
  it("o instrumento encontra os esqueletos que existem", () => {
    const comEsqueleto = ficheiros().filter((c) => /bo-skeleton/.test(readFileSync(c, "utf8")));
    expect(comEsqueleto.length, "ficheiros do back office com esqueleto").toBeGreaterThan(3);
  });
});
