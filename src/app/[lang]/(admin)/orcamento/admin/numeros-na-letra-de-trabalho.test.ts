import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS TODOS NA MESMA LETRA — E É A DE TRABALHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com duas capturas de ecrã lado a lado: «temos diferentes tipos
 * de letra, quero que esteja tudo com o mesmo tipo de letra» — e depois, a
 * apontar para a que quer: «quero que esteja tudo com este tipo de letra nos
 * números».
 *
 * Tinha razão e o defeito era MEU. Ao devolver o Playfair ao back office, os
 * sítios que pediam `font-display` ou `var(--font-playfair)` passaram a serifa
 * e os outros ficaram em Inter. No MESMO ecrã das Estatísticas, a fila de cima
 * ficou com «15 · 33% · 22 023 €» em Playfair e o painel logo abaixo com
 * «8 · 50% · 8.5d · 5326 €» em Inter. Os mesmos números, duas letras.
 *
 * ── A REGRA, E PORQUE É ESTA E NÃO A OUTRA ────────────────────────────────
 *
 * Uniformizar podia ter sido para qualquer um dos dois lados. Ela escolheu o
 * Inter, e a escolha tem razão técnica além do gosto: o Playfair não tem
 * algarismos de largura fixa desenhados para tabelas, e metade destes números
 * vivem em colunas que se comparam de relance («Ganho», «À espera»,
 * «Recebido») ou em listas que se lêem a correr. `tabular-nums` num Playfair é
 * um pedido que a letra não sabe cumprir.
 *
 * O que fica em Playfair são os TÍTULOS — «Boa tarde, Catarina.», o nome do
 * casal, «Agosto 2026», os cabeçalhos de página. É lá que a letra da casa faz o
 * trabalho para que serve: dar cara, não alinhar dígitos.
 *
 * ── O QUE ESTE FICHEIRO GUARDA ────────────────────────────────────────────
 *
 * Que nenhum sítio que desenhe um NÚMERO volta a pedir a letra de display. A
 * lista de sinais é conservadora de propósito: `tabular-nums`, as funções de
 * dinheiro (`eur`, `eur0`, `formatPrice`) e o `toLocaleString`. Um título nunca
 * traz nenhum destes.
 */

const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** Os `.tsx` do back office que pedem letra de display. */
function ficheiros(): string[] {
  return execSync(
    `grep -rl -e "font-display" -e "font-playfair" --include=*.tsx "${RAIZ}" || true`,
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((f) => f && !f.includes(".test."));
}

/** Sinais de que o que ali se desenha é um número e não um título. */
const SINAIS_DE_NUMERO = /tabular-nums|\beur0?\(|\bformatPrice\(|toLocaleString\(/;

/**
 * Um pedido de letra de display, com o texto à volta onde se procura o número.
 *
 * A janela é de 6 linhas para a frente porque entre o `style`/`className` e o
 * valor desenhado costumam ficar o `fontSize`, a cor e o fecho da chaveta.
 */
function pedidosDeDisplay(): { onde: string; volta: string }[] {
  const achados: { onde: string; volta: string }[] = [];
  for (const f of ficheiros()) {
    const linhas = semComentarios(readFileSync(f, "utf8")).split("\n");
    linhas.forEach((l, n) => {
      if (!/font-display|var\(--font-playfair\)/.test(l)) return;
      achados.push({
        onde: `${f}:${n + 1}`,
        volta: linhas.slice(Math.max(0, n - 3), n + 7).join("\n"),
      });
    });
  }
  return achados;
}

describe("os números do back office", () => {
  it("nenhum número pede a letra de display", () => {
    const faltas = pedidosDeDisplay()
      .filter((p) => SINAIS_DE_NUMERO.test(p.volta))
      .map((p) => p.onde);
    expect(faltas, `letra de display à volta de um número em:\n  ${faltas.join("\n  ")}`).toEqual(
      [],
    );
  });

  it("mas os títulos continuam a pedi-la — senão isto não guarda nada", () => {
    // O controlo positivo. Se um dia o `font-display` desaparecer do back
    // office inteiro, o caso de cima passa por não haver nada que reprovar — e
    // a identidade que ela pediu de volta ter-se-ia perdido em silêncio.
    expect(pedidosDeDisplay().length, "o back office ficou sem letra de display").toBeGreaterThan(
      8,
    );
  });

  it("os três números do dinheiro da Visão Geral estão na letra de trabalho", () => {
    // O caso concreto das capturas de ecrã dela, preso pelo nome.
    const src = semComentarios(readFileSync(`${RAIZ}Overview.tsx`, "utf8"));
    const i = src.indexOf('aria-label="Dinheiro — ganho, à espera e recebido"');
    expect(i, "não encontrei o grupo dos três números").toBeGreaterThan(-1);
    const grupo = src.slice(i, src.indexOf("Pedidos ativos", i));
    expect(grupo, "os três números voltaram à serifa").not.toMatch(
      /font-display|var\(--font-playfair\)/,
    );
  });
});
