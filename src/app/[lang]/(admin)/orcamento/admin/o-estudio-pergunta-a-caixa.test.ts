import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTÚDIO NÃO PODE PERGUNTAR À JANELA QUANTO ESPAÇO TEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A rede que faltava. Palavras dela, com uma captura: «isto no back office está
 * tudo com bugs e todo desformatado» — e o que estava por baixo era sempre a
 * mesma pergunta feita ao sítio errado.
 *
 * O estúdio desenha-se em DOIS sítios com larguras diferentes: a página inteira
 * e o painel de detalhe que abre a partir do cartão de um cliente. Esse painel
 * tem tecto próprio (`max-w-3xl`), e por isso a janela não diz nada sobre o
 * espaço que há. MEDIDO num Chromium: com a janela a 1280, a fila das três
 * colunas do estúdio tinha 498 px; com a janela a 1440, a coluna onde ela
 * escreve ficava com 82.
 *
 * Nenhum teste apanhava isto porque não havia nenhum: o back office tem
 * dezasseis ficheiros de teste para o telemóvel e nenhum para ecrãs largos. Era
 * uma banda inteira de larguras que ninguém olhava — e é onde ela trabalha.
 *
 * Este ficheiro não mede larguras: prende a PERGUNTA. Cada `sm:` `md:` `lg:`
 * `xl:` `2xl:` que sobreviva no estúdio tem de estar na tabela aqui em baixo,
 * com o motivo escrito. Um novo falha o teste, e quem o escrever tem de
 * responder porque é que a JANELA é a medida certa para aquilo.
 */

const RAIZ = new URL(".", import.meta.url).pathname;

/** Os três ficheiros que desenham o estúdio. */
const FICHEIROS = ["ProposalStudio.tsx", "NavEstudio.tsx", "PainelDoEstudio.tsx"];

/**
 * ── A TABELA DAS EXCEPÇÕES ──────────────────────────────────────────────────
 *
 * Uma linha por classe que ainda pergunta à janela, com o motivo. Duas
 * famílias, e só uma delas é legítima.
 */
const COM_MOTIVO: Record<string, string> = {
  /**
   * LEGÍTIMA: esta pergunta é MESMO sobre a janela.
   *
   * A barra de navegação do back office é `fixed` — está presa ao ecrã, não a
   * nenhuma caixa. Abaixo de `lg` ela existe e a barra de acção do estúdio tem
   * de pousar em cima dela; a partir de `lg` passa a barra lateral e não há
   * nada por baixo. Quem decide isto é a janela porque quem está lá é a janela.
   */
  "lg:bottom-0": "a navegação por baixo é `fixed` — vive na janela, não numa caixa",

  /**
   * DÍVIDA CONHECIDA, e escrita para não se esquecer.
   *
   * `sm:` é 640 de janela. Dentro do painel de detalhe a fila tem 712 e o
   * cartão de um mood board tem 528 — ou seja, `sm:` está sempre satisfeito e
   * nunca diz nada de útil sobre a caixa onde a classe aterra. Nenhum destes
   * sítios está partido hoje (são embrulhos de texto e folgas, não divisões de
   * coluna), e por isso não se mexeu neles às cegas: mexe-se quando houver uma
   * medição de cada um. O que este teste garante é que a lista não CRESCE.
   */
  "sm:inline": "dívida conhecida — embrulho de texto, por medir",
  "sm:hidden": "dívida conhecida — embrulho de texto, por medir",
  "sm:grid-cols-2": "dívida conhecida — grelha estreita, por medir",
  "sm:flex-row": "dívida conhecida — fila curta, por medir",
  "sm:shrink-0": "dívida conhecida — fila curta, por medir",
  "sm:items-start": "dívida conhecida — alinhamento, por medir",
  "sm:justify-between": "dívida conhecida — alinhamento, por medir",
  "sm:py-3": "dívida conhecida — folga, por medir",
};

/**
 * Tira os comentários antes de procurar. Sem isto o teste apanhava o `lg:flex`
 * que os comentários CITAM para contar o que se corrigiu — e a maneira de o
 * calar seria apagar a história, que é o contrário do que se quer.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

const PREFIXO = /(?:^|[\s"`'{])((?:sm|md|lg|xl|2xl):[a-zA-Z0-9._/%[\]()-]+)/g;

function perguntasAJanela(ficheiro: string): string[] {
  const fonte = semComentarios(readFileSync(`${RAIZ}${ficheiro}`, "utf8"));
  return [...fonte.matchAll(PREFIXO)].map((m) => m[1]);
}

describe("o estúdio pergunta à caixa onde vive, e não à janela", () => {
  it.each(FICHEIROS)("%s não estreia perguntas novas à janela", (ficheiro) => {
    const semMotivo = [...new Set(perguntasAJanela(ficheiro))].filter(
      (c) => !(c.split("[")[0] in COM_MOTIVO) && !(c in COM_MOTIVO),
    );
    expect(
      semMotivo,
      `Estas classes decidem pela JANELA dentro do estúdio, que também se ` +
        `desenha dentro do painel de detalhe (fila de 712 px com a janela a ` +
        `1440). Ou se troca por uma consulta ao contentor — ` +
        `\`@min-[…]:\` para a caixa mais próxima, \`@min-[…]/estudio:\` para a ` +
        `fila — ou se acrescenta à tabela COM_MOTIVO com a razão escrita.`,
    ).toEqual([]);
  });

  /**
   * Controlo positivo: sem isto, um `semComentarios` demasiado guloso (ou um
   * regex partido) fazia o teste acima passar por nunca encontrar nada.
   */
  it("o instrumento encontra mesmo as perguntas que existem", () => {
    const todas = FICHEIROS.flatMap(perguntasAJanela);
    expect(todas).toContain("lg:bottom-0");
    expect(todas.length).toBeGreaterThan(5);
  });

  /**
   * E a tabela não pode ganhar linhas mortas: uma excepção que já ninguém usa
   * é uma autorização a pairar à espera de ser reutilizada sem se reler.
   */
  it("a tabela não tem linhas que já ninguém usa", () => {
    const todas = new Set(FICHEIROS.flatMap(perguntasAJanela).map((c) => c.split("[")[0]));
    const mortas = Object.keys(COM_MOTIVO).filter((c) => !todas.has(c));
    expect(mortas, "excepções escritas para classes que já não existem").toEqual([]);
  });

  /**
   * O índice e o painel já não perguntam nada à janela — e isso é uma
   * propriedade a manter, não um acaso.
   */
  it.each(["NavEstudio.tsx", "PainelDoEstudio.tsx"])(
    "%s decide tudo pelo contentor",
    (ficheiro) => {
      expect(perguntasAJanela(ficheiro)).toEqual([]);
    },
  );
});
