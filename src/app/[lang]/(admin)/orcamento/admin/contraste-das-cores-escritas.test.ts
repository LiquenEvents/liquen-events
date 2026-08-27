import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA COR DE TEXTO QUE SÓ APARECE QUANDO ALGO CORRE MAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO. O vermelho mais usado do back office era o `#b5654a`: 101 usos,
 * 56 deles como TEXTO, quase todos em mensagens de erro — `role="alert"`,
 * `{erro && …}`, `idErro`, `r.urgent`. Contraste MEDIDO pela fórmula WCAG:
 *
 *     #b5654a sobre branco   4,26 : 1
 *     #b5654a sobre #f7f7f8  3,98 : 1      ← o chão novo do back office
 *
 * O mínimo para texto pequeno é 4,5. E essas mensagens estão a `text-[10px]` e
 * `text-[11px]` — o texto MAIS PEQUENO da aplicação. Ou seja: a frase que diz
 * «isto correu mal» era a mais difícil de ler de todo o produto.
 *
 * ── PORQUE É QUE O TESTE DE CONTRASTE QUE JÁ EXISTIA NÃO O APANHOU ────────
 *
 * O `e2e/contraste-do-back-office.spec.ts` é sério: percorre `body *`, compõe
 * as opacidades contra o fundo real, aplica a dispensa do texto grande e exige
 * 4,5. Mas só mede O QUE ESTÁ NO ECRÃ quando corre — e uma mensagem de erro só
 * é desenhada quando há erro. Um passeio pelo caminho feliz nunca a desenha.
 *
 * É a mesma família de defeito que o `cores-que-existem.test.ts` descreve no
 * seu cabeçalho: «não se vê a ler o código, vê-se no ecrã, e só se o botão
 * estiver no estado certo». A cura é a mesma — verificação mecânica, a partir
 * da fonte, independente de o estado ser alcançável.
 *
 * ── O QUE ESTE TESTE FAZ ─────────────────────────────────────────────────
 *
 * Lê todos os `text-[#rrggbb]` escritos nos ecrãs do back office e calcula o
 * contraste contra as DUAS superfícies onde esse texto pode assentar: o cartão
 * branco e o chão `#f7f7f8`. Exige 4,5 nas duas.
 *
 * Não mede opacidades (`text-[#xxx]/60`): essas dependem do que está por baixo
 * e são o território do passeio, que as compõe a sério. Aqui guarda-se o caso
 * que o passeio não alcança — a cor sólida de um estado raro.
 */

const SUPERFICIES: Record<string, string> = {
  "cartão branco": "#ffffff",
  "chão do back office": "#f7f7f8",
};

/** WCAG 2.x, luminância relativa. */
function luminancia(hex: string): number {
  const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

function contraste(a: string, b: string): number {
  const [alto, baixo] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
}

/**
 * As cores sólidas escritas como cor de TEXTO, com o ficheiro e a linha.
 *
 * Só `text-[#…]` sem opacidade: com `/60` o que se vê depende do fundo, e isso
 * mede-se no browser, não aqui.
 */
function coresDeTexto(): { cor: string; onde: string }[] {
  const ficheiros = execSync(
    "grep -rl --include=*.tsx -e 'text-\\[#' src/app/'[lang]'/'(admin)' || true",
    { encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test."));

  const achados: { cor: string; onde: string }[] = [];
  for (const ficheiro of ficheiros) {
    readFileSync(ficheiro, "utf8")
      .split("\n")
      .forEach((linha, i) => {
        for (const m of linha.matchAll(/\btext-\[(#[0-9a-fA-F]{6})\](?!\/)/g)) {
          achados.push({
            cor: m[1].toLowerCase(),
            onde: `${ficheiro.replace(/^.*admin\//, "")}:${i + 1}`,
          });
        }
      });
  }
  return achados;
}

describe("o contraste das cores escritas à mão", () => {
  it("nenhuma cor de texto do back office fica abaixo dos 4,5:1", () => {
    const fracos: string[] = [];
    const vistas = new Set<string>();
    for (const { cor, onde } of coresDeTexto()) {
      for (const [nome, fundo] of Object.entries(SUPERFICIES)) {
        const r = contraste(cor, fundo);
        // Arredonda-se para cima uma casa: 4,499 não é um defeito, é o mesmo
        // número escrito de outra maneira.
        if (r + 0.01 >= 4.5) continue;
        const chave = `${cor}·${nome}`;
        if (vistas.has(chave)) continue;
        vistas.add(chave);
        fracos.push(`${cor} sobre ${nome} = ${r.toFixed(2)}:1  (ex.: ${onde})`);
      }
    }
    expect(fracos).toEqual([]);
  });

  it("e há um vermelho só para dizer que algo correu mal", () => {
    // Eram CINCO — #b5654a, #8a2a22, #a03a1a, #a03123, #c0392b — e qual deles
    // aparecia dependia do ficheiro onde se estava. A mesma coisa dita em cinco
    // cores não é uma paleta: é um descuido repetido.
    const antigos = ["#b5654a", "#a03a1a", "#a03123", "#c0392b"];
    const presentes = execSync(
      `grep -rl --include=*.tsx ${antigos.map((c) => `-e '${c}'`).join(" ")} ` +
        "src/app/'[lang]'/'(admin)' || true",
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes(".test."));
    expect(presentes).toEqual([]);
  });
});
