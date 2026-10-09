import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS LINHAS QUE ESCORREGAVAM NO TELEMÓVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `.alvo-toque` (globals.css, dentro de `(pointer: coarse)`) faz duas coisas:
 * dá os 44 px de chão e põe `display: inline-flex; justify-content: center`
 * numa camada — esta segunda é para os botões de ÍCONE, que são a maioria.
 *
 * Um botão que é uma LINHA de lista (nome por cima, data por baixo, régua,
 * pastilhas) e não diz o seu `display` herda esse `inline-flex`: os filhos
 * deixam de empilhar, ficam lado a lado e centrados. MEDIDO a 390×844 com
 * toque, na passagem de 9 de outubro:
 *   · Timelines — a página ficou com 454 px, a barra de baixo foi empurrada
 *     para fora do ecrã e lia-se «Daqui a 246 diassábado, 12 de junho»;
 *   · Propostas — o nome do cliente cortado À ESQUERDA («TESTE…» sem as
 *     primeiras letras), porque o conteúdo centrado transbordava dos dois lados.
 *
 * A correcção é a do precedente em `Tarefas.tsx`: `block` na linha. Os
 * utilitários do Tailwind vivem numa camada que ganha à do `.alvo-toque`. A
 * regra global NÃO se toca — tem perto de 400 usos, quase todos ícones que
 * precisam de estar ao centro.
 *
 * O jsdom não faz layout, por isso isto guarda a CAUSA no código; quem mede
 * os píxeis é o `admin-mobile.spec.ts`, num browser com toque.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

describe("as linhas de lista com alvo de toque empilham", () => {
  it.each([
    [
      "Guioes.tsx",
      "alvo-toque block w-full rounded-[var(--bo-raio-conteudo)] border p-3 text-left",
    ],
    ["Propostas.tsx", "alvo-toque block min-w-0 flex-1 text-left"],
    ["BibliotecaServicos.tsx", "alvo-toque block w-full rounded-lg"],
  ])("%s diz `block` na linha", (ficheiro, classe) => {
    expect(ler(ficheiro)).toContain(classe);
  });
});

/** Todos os .tsx do back office, menos os testes. */
function ficheiros(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return ficheiros(caminho);
    return nome.endsWith(".tsx") && !nome.includes(".test.") ? [caminho] : [];
  });
}

describe("o corte com reticências num alvo de toque", () => {
  /**
   * Num `inline-flex` o `truncate` no PRÓPRIO elemento não corta nada: precisa
   * de um filho que possa encolher (`<span className="min-w-0 truncate">`). É
   * o padrão do `DossierAside.tsx`. Os emails do painel do pedido e dos
   * fornecedores tinham o `truncate` no link e transbordavam sem reticências.
   */
  it("não aparece no mesmo `className` que o `alvo-toque` sem um `display` dito", () => {
    const culpados: string[] = [];
    for (const f of ficheiros(RAIZ)) {
      const fonte = readFileSync(f, "utf8");
      for (const m of fonte.matchAll(/className=\{?[`"]([^`"]*)[`"]/g)) {
        const classes = m[1].split(/\s+/);
        if (
          classes.includes("alvo-toque") &&
          classes.includes("truncate") &&
          !classes.some((c) => /^(block|flex|grid|inline-block)$/.test(c))
        ) {
          culpados.push(`${f.slice(RAIZ.length + 1)}: ${m[1]}`);
        }
      }
    }
    expect(culpados).toEqual([]);
  });
});
