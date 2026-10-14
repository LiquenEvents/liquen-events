import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * O `.alvo-invisivel` alarga o toque com um `::after` posicionado contra o
 * próprio elemento — e por isso exige `relative` (ou `absolute`) nele. Sem
 * isso, o `::after` agarra-se a uma caixa lá de cima e tapa os vizinhos.
 *
 * Aconteceu na lista «Não dá para enviar» (14/10, medido a 390 px): tocar em
 * «Falta o valor» levava à última falta da lista. Este teste procura qualquer
 * `className` com `alvo-invisivel` sem `relative`/`absolute`/`fixed` ao lado.
 */
const RAIZ = join(process.cwd(), "src");

function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const c = join(dir, n);
    if (statSync(c).isDirectory()) return ficheiros(c);
    return /\.tsx$/.test(n) && !/\.test\.tsx$/.test(n) ? [c] : [];
  });
}

describe("o alvo invisível tem sempre onde se ancorar", () => {
  it("nenhum `alvo-invisivel` sem `relative`, `absolute` ou `fixed` na mesma classe", () => {
    const soltos: string[] = [];
    for (const f of ficheiros(RAIZ)) {
      const texto = readFileSync(f, "utf8");
      for (const m of texto.matchAll(/className=\{?[`"]([^`"]*\balvo-invisivel\b[^`"]*)[`"]/g)) {
        if (!/\b(relative|absolute|fixed)\b/.test(m[1])) soltos.push(`${f}: ${m[1].slice(0, 80)}`);
      }
    }
    expect(soltos).toEqual([]);
  });
});
