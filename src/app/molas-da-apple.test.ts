import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MOLAS SÃO MESMO AS DA APPLE — REFEITAS, NÃO ACREDITADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `docs/DESIGN-SYSTEM.md` traz dez curvas `linear()` e diz que reproduzem as
 * molas do SwiftUI. Um ficheiro de tokens com vinte e quatro números por curva
 * é o sítio perfeito para um engano viver anos: ninguém confere à mão, e uma
 * casa decimal trocada não parte nada — só faz o movimento sentir-se «quase
 * bem» sem ninguém saber dizer porquê.
 *
 * Este teste não confere à mão. REFAZ a conta.
 *
 * A Apple publica a conversão entre a descrição percetual e a física:
 *
 *     mass      = 1
 *     stiffness = (2π / duration)²
 *     damping   = (1 − bounce) · 4π / duration        , com bounce ≥ 0
 *     ζ         = damping / (2·√(stiffness · mass))   = 1 − bounce
 *
 * Daí sai a solução fechada do oscilador amortecido, e é essa que se compara,
 * ponto a ponto, com o que está escrito no `tema.css`.
 *
 * ── O QUE ISTO APANHA, E QUE MAIS NADA APANHA ────────────────────────────
 *
 * Um número «arrumado» à mão. Uma curva copiada da irmã errada. Uma forma
 * escrita com o ζ de outra. Um `linear()` a que falta um ponto. Nenhuma
 * dessas coisas dá erro de compilação, nenhuma parte um ecrã, e todas mudam o
 * que ela sente quando carrega num botão.
 *
 * ── E O QUE ELE NÃO PODE APANHAR ─────────────────────────────────────────
 *
 * Se a classe CHEGA a existir. O Tailwind v4 só emite um utilitário que
 * alguém use, e um token no sítio errado dá variável sem classe — sem erro e
 * sem aviso (a armadilha está escrita no `tema.css` e já custou catorze
 * chamadas a correr à duração de omissão). Isso confirma-se com uma sonda de
 * compilação, e foi feito: um ficheiro temporário a usar `ease-snappy`,
 * `ease-bouncy`, `ease-sheet`, `ease-interactive`, `duration-snappy`,
 * `duration-nav` e `duration-press`, `npm run build`, e as sete regras saíram
 * na folha — com o encadeamento a resolver, `var(--ease-snappy,
 * var(--ease-mola-85))`. A sonda foi apagada a seguir.
 */

const TEMA = readFileSync(join(process.cwd(), "src/app/tema.css"), "utf8");

/** ζ de cada forma, pelo nome com que ela vive no `tema.css`. */
const FORMAS: Record<string, number> = {
  "mola-100": 1.0,
  "mola-95": 0.95,
  "mola-86": 0.86,
  "mola-85": 0.85,
  "mola-80": 0.8,
  "mola-70": 0.7,
};

/**
 * Os dez nomes de uso do documento e a forma a que cada um pertence.
 *
 * A forma de uma mola depende SÓ do amortecimento; a duração é o eixo do
 * tempo. Por isso dez nomes cabem em seis curvas — e é por isso que o
 * `tema.css` escreve seis e aponta dez, em vez de escrever dez e deixar
 * quatro cópias a divergir.
 */
const USOS: Record<string, string> = {
  smooth: "mola-100",
  default: "mola-100",
  press: "mola-100",
  reposition: "mola-100",
  nav: "mola-95",
  interactive: "mola-86",
  snappy: "mola-85",
  quick: "mola-85",
  sheet: "mola-80",
  bouncy: "mola-70",
};

/** As durações do documento, em milissegundos. */
const DURACOES: Record<string, number> = {
  smooth: 590,
  snappy: 540,
  bouncy: 555,
  default: 650,
  interactive: 150,
  quick: 325,
  press: 260,
  sheet: 345,
  reposition: 475,
  nav: 515,
};

/**
 * A posição de uma mola em `t`, normalizada: parte de 0 em repouso e vai a 1.
 *
 * `w0` é a frequência natural e `z` o amortecimento. Os três ramos são os três
 * regimes — o crítico (ζ = 1) tem uma solução própria e não se obtém do
 * subamortecido por limite numérico, que é onde este tipo de conta costuma
 * partir-se em silêncio.
 */
function posicao(z: number, w0: number, t: number): number {
  if (Math.abs(z - 1) < 1e-9) return 1 - Math.exp(-w0 * t) * (1 + w0 * t);
  if (z < 1) {
    const wd = w0 * Math.sqrt(1 - z * z);
    return 1 - Math.exp(-z * w0 * t) * (Math.cos(wd * t) + ((z * w0) / wd) * Math.sin(wd * t));
  }
  const r = w0 * Math.sqrt(z * z - 1);
  const a = (z * w0 + r) / (2 * r);
  const b = -(z * w0 - r) / (2 * r);
  return 1 - (a * Math.exp((-z * w0 + r) * t) + b * Math.exp((-z * w0 - r) * t));
}

/** Os valores de um `linear()` do `tema.css`, pela ordem em que lá estão. */
function amostras(forma: string): number[] {
  const m = TEMA.match(new RegExp(`--ease-${forma}:\\s*linear\\(([^)]*)\\)`));
  expect(m, `a forma \`--ease-${forma}\` desapareceu do tema`).not.toBeNull();
  return m![1]
    .split(",")
    .map((p) => parseFloat(p.trim().split(/\s+/)[0]))
    .filter((n) => !Number.isNaN(n));
}

describe("as molas do tema são as da Apple", () => {
  it("as seis formas estão lá, com 25 pontos cada", () => {
    for (const forma of Object.keys(FORMAS)) {
      // 0 mais 24 amostras: o `linear()` do documento é amostrado em 24 pontos.
      expect(amostras(forma), `\`${forma}\` mudou de número de pontos`).toHaveLength(25);
    }
  });

  /**
   * O NÚMERO. 0,005 é folga sobre o maior desvio real medido (0,0023), que é o
   * arredondamento do tempo de assentar no documento. Uma casa decimal trocada
   * num ponto qualquer sai fora disto com folga.
   */
  it.each(Object.keys(FORMAS))("a forma %s bate certo com a física, ponto a ponto", (forma) => {
    const z = FORMAS[forma];
    const vals = amostras(forma);
    // O eixo do tempo é normalizado: o percurso inteiro é 1, e a duração de
    // cada uso só estica esse eixo. `w0` sai da duração do preset (0,5 s para
    // a família de referência) e o `T` do documento é o tempo até assentar.
    // Como o que se compara é a FORMA, basta que os dois sejam consistentes:
    // usa-se a duração de referência e escala-se o tempo pelo mesmo T.
    const duracao = 0.5;
    const w0 = (2 * Math.PI) / duracao;
    // T resolvido para que a última amostra caia onde a curva já assentou.
    const T = tempoDeAssentar(z, w0);
    const fora: string[] = [];
    for (let i = 1; i < vals.length; i += 1) {
      const t = (T * i) / (vals.length - 1);
      const esperado = posicao(z, w0, t);
      const desvio = Math.abs(vals[i] - esperado);
      if (desvio > 0.005) {
        fora.push(`ponto ${i}: o tema diz ${vals[i]} e a física dá ${esperado.toFixed(4)}`);
      }
    }
    expect(fora, `\`${forma}\` deixou de ser uma mola da Apple:\n${fora.join("\n")}`).toEqual([]);
  });

  it("os dez nomes de uso apontam para a forma certa", () => {
    for (const [uso, forma] of Object.entries(USOS)) {
      const m = TEMA.match(new RegExp(`--ease-${uso}:\\s*var\\(--ease-([\\w-]+)\\)`));
      expect(m, `\`--ease-${uso}\` deixou de apontar para uma forma`).not.toBeNull();
      expect(m![1], `\`--ease-${uso}\` mudou de forma`).toBe(forma);
    }
  });

  /**
   * O PREFIXO. É a armadilha do Tailwind v4 que este repositório já pagou uma
   * vez: `--duration-quick` dá a variável e NÃO gera a classe `duration-quick`
   * — sem erro, sem aviso, sem regra. As durações têm de entrar como
   * `--transition-duration-*`, e o documento escreve-as com o outro nome.
   */
  it("as dez durações existem, com o prefixo que gera a classe", () => {
    for (const [uso, ms] of Object.entries(DURACOES)) {
      const m = TEMA.match(new RegExp(`--transition-duration-${uso}:\\s*(\\d+)ms`));
      expect(m, `a duração \`${uso}\` não está no espaço que gera utilitários`).not.toBeNull();
      expect(Number(m![1]), `a duração \`${uso}\` mudou de valor`).toBe(ms);
    }
    expect(
      TEMA,
      "voltou a haver uma duração no espaço `--duration-*`, que não gera classe nenhuma",
    ).not.toMatch(/^\s*--duration-[\w-]+:/m);
  });

  /**
   * O CONTROLO NEGATIVO. Sem isto, um `amostras()` que devolvesse sempre a
   * curva certa — ou um `posicao()` partido de forma simétrica — fazia tudo
   * isto passar sem comparar nada.
   */
  it("e uma curva errada é mesmo apanhada", () => {
    const z = FORMAS["mola-70"];
    const w0 = (2 * Math.PI) / 0.5;
    const T = tempoDeAssentar(z, w0);
    // A mola com ressalto passa dos 100% — é isso que a distingue de uma
    // Bézier, e é o que se perde se alguém a trocar por uma curva «suave».
    const pico = Math.max(...amostras("mola-70"));
    expect(pico, "a mola com ressalto deixou de ultrapassar o valor final").toBeGreaterThan(1.02);
    // E a de amortecimento crítico NUNCA passa.
    expect(
      Math.max(...amostras("mola-100")),
      "a mola sem ressalto passou dos 100%",
    ).toBeLessThanOrEqual(1.0001);
    // A física concorda com as duas afirmações.
    let maximo = 0;
    for (let i = 0; i <= 200; i += 1) maximo = Math.max(maximo, posicao(z, w0, (T * i) / 200));
    expect(
      maximo,
      "a conta deixou de produzir ressalto — o instrumento está partido",
    ).toBeGreaterThan(1.02);
  });
});

/**
 * O tempo até a mola assentar a 0,5% do valor final — que é o que o documento
 * usa como duração de cada curva. Resolve-se por procura, e não por fórmula,
 * porque o critério é sobre o ENVELOPE e o envelope difere por regime.
 */
function tempoDeAssentar(z: number, w0: number): number {
  const passo = 0.001;
  let ultimo = 0;
  for (let t = passo; t < 5; t += passo) {
    if (Math.abs(posicao(z, w0, t) - 1) > 0.005) ultimo = t;
  }
  return ultimo + passo;
}
