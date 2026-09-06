import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM CAMPO DE ESCOLHER SEM NOME É UM CAMPO QUE NINGUÉM OUVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta varredura existe porque a migração dos `<select>` encontrou o mesmo
 * defeito TRÊS vezes, e das três ninguém tinha dado por ele:
 *
 *  1. `Tarefas.tsx` — a prioridade de uma tarefa não tinha rótulo nenhum. Nem
 *     `<label>`, nem `aria-label`. Ouvia-se «combobox» e mais nada.
 *  2. `Temas.tsx` — o `<select>` da ordem estava embrulhado num `<label>` com o
 *     nome num `sr-only` lá dentro.
 *  3. `BibliotecaRevisao.tsx` — DOIS controlos dentro do mesmo `<label>`. Um
 *     `<label>` nomeia um só: o segundo ficava sem nome.
 *
 * Os casos 2 e 3 são a armadilha desta migração inteira, e é preciso dizê-la
 * por extenso: **um `<label>` nomeia um `<select>` porque ele é NATIVO.** O
 * `role="combobox"` recebe o nome do AUTOR — `aria-label` ou `aria-labelledby`
 * — e mais nada. Ou seja: um campo que estava correctamente rotulado enquanto
 * foi `<select>` fica MUDO no instante em que passa a `Escolha`, sem um aviso,
 * sem um erro, e sem diferença nenhuma no ecrã.
 *
 * É o tipo de regressão que só se descobre com um leitor de ecrã ligado, meses
 * depois. Daí a varredura.
 *
 * ── E O `Field` ESTÁ DE FORA, PORQUE ELE TRATA DISSO ────────────────────────
 *
 * Um `<Field as="select">` desenha o seu `<label>` com `id` e passa-o em
 * `aria-labelledby` (ver `Field.tsx`). Quem o usa não tem de saber nada disto —
 * que é precisamente o que um primitivo serve para fazer.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)");

function ficheiros(dir: string, achados: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheiros(caminho, achados);
    else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) achados.push(caminho);
  }
  return achados;
}

/** Tira comentários: o que lá se cita é história, não código. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (t) => t.replace(/[^\n]/g, " "))
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("nenhum `<Escolha>` fica sem nome acessível", () => {
  it("todos declaram `aria-label` ou `aria-labelledby`", () => {
    const mudos: string[] = [];

    for (const caminho of ficheiros(RAIZ)) {
      // O próprio primitivo não se conta: é ele que RECEBE o nome.
      if (caminho.endsWith("ui/Escolha.tsx") || caminho.endsWith("ui/Field.tsx")) continue;
      const fonte = semComentarios(readFileSync(caminho, "utf8"));

      for (const m of fonte.matchAll(/<Escolha(\s)/g)) {
        // As propriedades vão do `<Escolha` até ao `>` que fecha a etiqueta de
        // abertura. Um `>` dentro de `{…}` (uma seta, uma comparação) não conta,
        // por isso conta-se a profundidade das chavetas pelo caminho.
        let i = m.index! + "<Escolha".length;
        let chavetas = 0;
        let props = "";
        for (; i < fonte.length; i++) {
          const c = fonte[i];
          if (c === "{") chavetas++;
          else if (c === "}") chavetas--;
          else if (c === ">" && chavetas === 0) break;
          props += c;
        }
        if (!/aria-label(ledby)?[=\s]/.test(props)) {
          const linha = fonte.slice(0, m.index!).split("\n").length;
          mudos.push(`${caminho.replace(process.cwd() + "/", "")}:${linha}`);
        }
      }
    }

    expect(
      mudos,
      "um `<label>` nomeia um `<select>` por ele ser nativo, mas NÃO nomeia um " +
        '`role="combobox"` — estes campos ficaram mudos para quem ouve o ecrã',
    ).toEqual([]);
  });

  it("a varredura encontra mesmo alguma coisa (senão estaria a medir o vazio)", () => {
    // Um teste que percorre zero ficheiros passa sempre. Este prende o chão.
    const quantos = ficheiros(RAIZ)
      .filter((c) => !c.endsWith("ui/Escolha.tsx"))
      .reduce(
        (n, c) => n + (semComentarios(readFileSync(c, "utf8")).match(/<Escolha\s/g)?.length ?? 0),
        0,
      );
    expect(quantos).toBeGreaterThan(10);
  });
});
