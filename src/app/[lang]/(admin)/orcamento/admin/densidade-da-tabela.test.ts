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
