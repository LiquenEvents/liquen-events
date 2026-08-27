import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM ELEMENTO COLADO NÃO DECORA A ALTURA DE OUTRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO. A lista de material a carregar tinha os títulos de secção em
 * `sticky top-[132px]`. O 132 era o fundo do cabeçalho na geometria em que foi
 * escrito — o `<main>` do sítio punha 96 px de `pt-24` e cada raiz do back
 * office cancelava-os com um `-mt-24`.
 *
 * Ao tirar esse par (o back office saiu do grupo do sítio e levou o `<main>`
 * com ele), a página passou a começar no zero. MEDIDO a 390×844:
 *
 *     cabeçalho      0 → 91 px
 *     título         132 → 165 px      ← 41 px ABAIXO do cabeçalho
 *     primeira linha 124 → 180 px      ← e o título por cima dela
 *
 * `document.elementFromPoint` no meio da linha devolvia o `<h2>`. Ou seja: a
 * primeira linha de cada secção deixou de se poder TOCAR, no telemóvel, no
 * ecrã que se usa de pé ao lado de uma carrinha. Apanharam-no os dois passeios
 * de telemóvel do carregamento, cada um a gastar 120 s a tentar clicar num
 * botão tapado.
 *
 * ── O QUE ESTE TESTE GUARDA, E PORQUE É QUE NÃO É O NÚMERO ────────────────
 *
 * Não guarda «o valor certo é 91». Guardar um número era repetir o erro com
 * outro número: no dia em que o cabeçalho ganhar uma linha, 91 fica tão errado
 * como 132 ficou.
 *
 * O que guarda é a FORMA: um deslocamento `sticky`/`fixed` no back office não
 * pode ser um comprimento escrito à mão. Ou é `0`, ou é uma variável — medida
 * (`--carregamento-cabecalho`, `--bo-barra-accao`) ou declarada num sítio só
 * (`--bo-barra-inferior`). É a mesma regra que a casa já aplica às barras.
 */

const FICHEIROS = execSync(
  "grep -rl --include=*.tsx -e 'sticky' -e 'fixed' src/app/'[lang]'/'(admin)' || true",
  { encoding: "utf8" },
)
  .trim()
  .split("\n")
  .filter(Boolean)
  .filter((f) => !f.includes(".test."));

/**
 * A lição já custou três testes que passavam a olhar para a minha prosa — e o
 * comentário lá em cima cita o `top-[132px]` que este caso proíbe.
 *
 * As linhas SOBREVIVEM: o `\s` das barras de linha inclui a mudança de linha,
 * e um padrão guloso engolia as linhas em branco ANTES do comentário — o erro
 * apontava 34 linhas acima do sítio real, medido.
 */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/**
 * Um deslocamento com um comprimento literal lá dentro: `top-[132px]`,
 * `bottom-[56px]`, `top-[7rem]`.
 *
 * `top-0`, `top-full`, `inset-0` e afins não entram — não descrevem a altura de
 * outra coisa. E `top-[calc(var(--x)+8px)]` também não: aí o número é uma
 * folga somada a uma medida, que é precisamente o que se quer.
 */
const LITERAL = /\b(?:top|bottom|left|right|inset-y|inset-x)-\[(-?[\d.]+(?:px|rem|em))\]/g;

describe("os deslocamentos do que fica colado", () => {
  it("nenhum elemento colado do back office decora a altura de outro", () => {
    const culpados: string[] = [];
    for (const ficheiro of FICHEIROS) {
      semComentarios(readFileSync(ficheiro, "utf8"))
        .split("\n")
        .forEach((linha, i) => {
          if (!/\b(?:sticky|fixed)\b/.test(linha)) return;
          for (const m of linha.matchAll(LITERAL)) {
            // Zero é zero: não é a altura de nada.
            if (parseFloat(m[1]) === 0) continue;
            culpados.push(`${ficheiro.replace(/^.*admin\//, "")}:${i + 1}  ${m[0]}`);
          }
        });
    }
    expect(culpados).toEqual([]);
  });

  it("os títulos do carregamento colam à altura MEDIDA do cabeçalho", () => {
    const fonte = semComentarios(
      readFileSync(
        "src/app/[lang]/(admin)/orcamento/admin/carregamento/[eventId]/Carregamento.tsx",
        "utf8",
      ),
    );
    // A variável é publicada por quem mede…
    expect(fonte).toMatch(/"--carregamento-cabecalho":/);
    expect(fonte).toContain("new ResizeObserver(medir)");
    // …e lida por quem cola.
    expect(fonte).toContain("sticky top-[var(--carregamento-cabecalho,");
  });
});
