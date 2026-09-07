import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DENSIDADE DA TABELA — 44 NA LINHA, 40 NO CABEÇALHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do sistema de design que ela aprovou: linha de tabela com 44 px por omissão,
 * cabeçalho sticky com 40, e 12 px de folga horizontal nas duas.
 *
 * ── PORQUE É QUE A ALTURA VAI EM `h-*` E NÃO EM `py-*` ───────────────────
 *
 * Não é preferência, é aritmética. As linhas escrevem-se em `text-callout`, que
 * tem 22 px de entrelinha. Para a linha medir 44 seriam precisos 11 px de folga
 * de cada lado — e 11 não pertence à grelha de 4 desta casa (4, 8, 12, 16, 20,
 * 24, 32, 40, 48, 64), que o mesmo documento fixa duas secções antes.
 *
 * Com a altura declarada e `align-middle`, a folga vertical resolve-se sozinha:
 * a linha mede exactamente 44, a grelha fica intacta, e ninguém tem de escolher
 * entre as duas regras.
 *
 * O que estava era `py-2.5` — 10 px de cada lado, ou seja 42 px de linha e ~35
 * de cabeçalho. Perto, e não é o que está escrito.
 *
 * ── O QUE ISTO NÃO MEDE ──────────────────────────────────────────────────
 *
 * A altura RENDERIZADA. O jsdom não tem disposição — `getBoundingClientRect`
 * devolve zeros —, portanto uma verificação de píxeis reais é do Playwright e
 * não daqui. Isto guarda a INTENÇÃO escrita nas classes, que é o que se perde
 * quando alguém «arruma» um `h-11` para um `py-2.5` sem saber porque é que ele
 * lá está.
 */

const TABELA = readFileSync(
  join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/ui/TabelaOuCartoes.tsx"),
  "utf8",
);

/**
 * As classes de uma célula do tipo pedido — `<th>` ou `<td>`.
 *
 * O `(?!ead)` não é um capricho: `<th` casa com `<thead>`, e a primeira
 * ocorrência no ficheiro está dentro de um comentário. Sem isso, este teste
 * media as classes de uma linha de prosa e chumbava por razões inventadas —
 * foi o que fez à primeira corrida.
 */
function classesDa(marca: "th" | "td"): string {
  const i = TABELA.search(marca === "th" ? /<th\b(?!ead)/ : /<td\b/);
  expect(i, `não há nenhum \`<${marca}\` nesta tabela — a varredura envelheceu`).toBeGreaterThan(
    -1,
  );
  const fim = TABELA.indexOf(">", TABELA.indexOf("className", i));
  return TABELA.slice(i, fim);
}

describe("a densidade da tabela do back office", () => {
  it("a linha mede 44", () => {
    expect(classesDa("td"), "a altura da linha saiu das classes da célula").toMatch(/\bh-11\b/);
  });

  it("o cabeçalho mede 40", () => {
    expect(classesDa("th"), "a altura do cabeçalho saiu das classes").toMatch(/\bh-10\b/);
  });

  it("a folga horizontal é de 12 nas duas", () => {
    expect(classesDa("td")).toMatch(/\bpx-3\b/);
    expect(classesDa("th")).toMatch(/\bpx-3\b/);
  });

  /**
   * A folga vertical tem de vir da altura e do `align-middle`. Um `py-*` de
   * volta significa que alguém desfez a conta e a linha deixou de medir 44 —
   * ou passou a medir 44 por acaso, que é pior.
   */
  it("a folga vertical vem da altura, não de um `py-*`", () => {
    expect(classesDa("td"), "voltou um `py-*` à célula — ver a aritmética no topo").not.toMatch(
      /\bpy-/,
    );
    expect(classesDa("td"), "sem `align-middle` a altura declarada não centra nada").toMatch(
      /align-middle/,
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RÓTULO DE CAMPO É `text-footnote`, NÃO UMA SOBRANCELHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do mapeamento do sistema de design: rótulo de campo em `text-footnote` com
 * peso 600 — 13 px, capitalização normal.
 *
 * Era a `bo-eyebrow`: 11 px, caixa alta, `letter-spacing` de 0,14em. A
 * sobrancelha continua a ser a sobrancelha e continua a rotular BLOCOS; o que
 * mudou é que um rótulo de CAMPO deixou de ser uma. Um formulário com trinta
 * palavras em maiúsculas lê-se como um impresso de repartição, e 11 px é o
 * tamanho a que se lê pior.
 *
 * Isto atravessa 61 ficheiros de uma vez, porque o `ui/Field` é o primitivo
 * partilhado. É por isso que fica guardado num sítio só.
 */
/**
 * O `ui/Field` SEM comentários.
 *
 * É a segunda vez no mesmo dia que uma varredura destas casa com prosa em vez
 * de código: o `<th` apanhou um `<thead>` dentro de um comentário, e aqui o
 * `<label` apanhou o «a real `<label for>`» do cabeçalho do ficheiro. Numa casa
 * que comenta tanto como esta, tirar os comentários antes de procurar não é
 * uma precaução — é a regra.
 */
const CAMPO = readFileSync(
  join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/ui/Field.tsx"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

describe("o rótulo de um campo", () => {
  /** O `<label>` do primitivo, com as classes que ele leva. */
  const rotulo = () => {
    const i = CAMPO.search(/<label\b/);
    expect(i, "não há `<label>` no `ui/Field` — a varredura envelheceu").toBeGreaterThan(-1);
    return CAMPO.slice(i, CAMPO.indexOf(">", CAMPO.indexOf("hideLabel", i)));
  };

  it("está na escala, com o degrau do rótulo", () => {
    expect(rotulo(), "o rótulo saiu da escala tipográfica").toMatch(/\btext-footnote\b/);
    expect(rotulo(), "um rótulo de campo é semibold no mapeamento").toMatch(/font-semibold/);
  });

  it("deixou de ser uma sobrancelha", () => {
    expect(
      rotulo(),
      "a `bo-eyebrow` voltou ao rótulo do campo — 11 px em caixa alta em todos os formulários",
    ).not.toMatch(/bo-eyebrow/);
  });
});
