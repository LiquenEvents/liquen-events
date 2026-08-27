import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ESCALA DA LETRA DO BACK OFFICE — contada, e fechada onde está
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma análise de craft mediu a apple.com e a pixelmatters.com nó a nó e conta
 * oito degraus de tamanho para 208 blocos de texto. Sobre esta casa diz: «10
 * tamanhos reais em uso simultâneo, com 8, 9, 10 e 11 px a fazer o mesmo
 * papel». Mediu num ecrã; contando o código é pior.
 *
 * O CENSO, no dia em que este ficheiro nasceu:
 *
 *      8 px    14 usos          14 px   256 usos  (sm + literal)
 *      9 px    80              15 px     4
 *     10 px   223              16 px    23
 *     11 px   226              17 px     2
 *     12 px   438  (xs + lit)  18 px    16
 *     13 px    13              20 · 24 · 30 · 36 px
 *
 *   1322 chamadas, 105 ficheiros, QUINZE tamanhos distintos.
 *
 * ── O QUE ESTE TESTE FAZ, E O QUE NÃO FAZ ──────────────────────────────────
 *
 * NÃO fecha a escala nos seis degraus que a análise propõe (12 · 14 · 17 · 21 ·
 * 28 · 40). Aplicá-los mexia em centenas de sítios para trocar 16 por 17, 24
 * por 28 e 36 por 40 — deriva sem um grama de legibilidade ganha — e obrigava a
 * levantar os 10 e os 11 px, que são uma decisão tomada com uma medição na mão
 * e guardada por outro teste (ver `escala-movel.test.ts` e o chão dos 1024 px).
 *
 * O que ele faz é impedir a escala de ABRIR MAIS. Um degrau novo — o
 * décimo-sexto — chumba aqui, e quem o quiser tem de o justificar e escrevê-lo
 * na lista. É a diferença entre uma escala e uma colecção de números que alguém
 * foi escrevendo.
 *
 * ── PORQUE É QUE ISTO NÃO É UM `.eslintrc` ─────────────────────────────────
 *
 * Porque um lint diria «não uses tamanhos arbitrários» e a resposta seria
 * silenciar a regra. Isto diz outra coisa: a lista está aqui, tem quinze
 * entradas, e cada uma é uma decisão. Acrescentar a décima-sexta é uma linha —
 * só não é uma linha invisível.
 */

const FICHEIROS = execSync(
  "grep -rl 'text-' --include=*.tsx src/app | grep '/orcamento/admin' | grep -v test",
  { encoding: "utf8" },
)
  .trim()
  .split("\n");

/** Os degraus nomeados do Tailwind, com o que valem em píxeis. */
const NOMEADOS: Record<string, number> = {
  xs: 12,
  sm: 14,
  base: 16,
  lg: 18,
  xl: 20,
  "2xl": 24,
  "3xl": 30,
  "4xl": 36,
};

/**
 * A escala, tal como está. Quinze degraus.
 *
 * Os quatro primeiros vivem só no computador: o chão do telemóvel levanta-os,
 * e o `globals.css` levanta 7, 8 e 9 px em QUALQUER largura. Estão aqui porque
 * estão escritos no código, não porque cheguem ao ecrã em todo o lado.
 */
const ESCALA = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 20, 24, 30, 36];

function censo(): Map<number, number> {
  const conta = new Map<number, number>();
  const somar = (px: number) => conta.set(px, (conta.get(px) ?? 0) + 1);
  for (const f of FICHEIROS) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?<![\w-])(?:sm:|lg:|wide:)?text-\[(\d+(?:\.\d+)?)px\]/g)) {
      somar(parseFloat(m[1]));
    }
    for (const m of src.matchAll(
      /(?<![\w-])(?:sm:|lg:|wide:)?text-(xs|sm|base|lg|xl|2xl|3xl|4xl)(?![\w-])/g,
    )) {
      somar(NOMEADOS[m[1]]);
    }
  }
  return conta;
}

describe("a escala da letra do back office", () => {
  it("não abre mais degraus do que os que estão declarados", () => {
    const emUso = [...censo().keys()].sort((a, b) => a - b);
    const novos = emUso.filter((px) => !ESCALA.includes(px));
    expect(
      novos,
      `Degrau(s) de letra fora da escala: ${novos.join(", ")}px.\n` +
        "Ou se usa um dos que já existem, ou se acrescenta à ESCALA aqui em cima " +
        "— com uma razão. A escala não abre por distração.",
    ).toEqual([]);
  });

  /**
   * O contrário do de cima, e tão importante quanto: um degrau que deixou de
   * ser usado não pode ficar na lista a dar licença a quem venha a seguir.
   */
  it("nem guarda degraus que já ninguém usa", () => {
    const emUso = new Set(censo().keys());
    const mortos = ESCALA.filter((px) => !emUso.has(px));
    expect(
      mortos,
      `Degrau(s) declarados e sem uso nenhum: ${mortos.join(", ")}px. Tirar da ESCALA.`,
    ).toEqual([]);
  });

  /**
   * A rede que apanha o próprio teste a mentir. Se o `censo()` deixasse de
   * encontrar o que quer que fosse — um `grep` que muda de resposta, uma pasta
   * que se move —, os dois testes de cima passavam a verde sem medir nada.
   */
  it("o censo está mesmo a contar alguma coisa", () => {
    const conta = censo();
    expect(FICHEIROS.length).toBeGreaterThan(50);
    expect([...conta.values()].reduce((a, b) => a + b, 0)).toBeGreaterThan(800);
    // Os dois degraus mais usados da casa, que não podem desaparecer sem que
    // isto seja outra aplicação: 12 px (o corpo miúdo) e 14 px.
    expect(conta.get(12) ?? 0).toBeGreaterThan(100);
    expect(conta.get(14) ?? 0).toBeGreaterThan(100);
  });
});
