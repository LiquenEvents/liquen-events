import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DUPLO DAS LETRAS TEM DE CONHECER TODAS AS LETRAS DA CASA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `next/font/google` é um marcador de compilação, e nos testes é substituído
 * por um duplo (ver `test/next-font-google.ts`). O duplo tem de escrever cada
 * família uma a uma, porque um `import { Geist }` é resolvido de forma
 * estática — não há `Proxy` que sirva.
 *
 * Uma lista escrita à mão desactualiza-se, e o modo como ela falha é o pior
 * possível: o teste que rebenta NÃO é este, é o de um layout qualquer, com a
 * mensagem «X is not a function» — que não diz a ninguém que o que falta é uma
 * linha num ficheiro de duplos. Foi exactamente assim que se perdeu uma
 * passagem de CI no dia em que o back office ganhou a letra dele.
 *
 * Este ficheiro é o aviso que faltava: se alguém acrescentar uma letra à
 * aplicação, reprova AQUI, e a mensagem diz o que fazer.
 */

/** As famílias que a aplicação importa mesmo, lidas do código. */
function familiasDaAplicacao(): string[] {
  const linhas = execSync(
    `grep -rn --include=*.tsx --include=*.ts "next/font/google" src/ || true`,
    { encoding: "utf8" },
  )
    .split("\n")
    .filter((l) => l && !l.includes(".test."));

  const nomes = new Set<string>();
  for (const linha of linhas) {
    // `import { Inter, Playfair_Display, Archivo } from "next/font/google"`
    const m = linha.match(/import\s*\{([^}]*)\}\s*from\s*["']next\/font\/google["']/);
    if (!m) continue;
    for (const bruto of m[1].split(",")) {
      const nome = bruto
        .trim()
        .split(/\s+as\s+/)[0]
        .trim();
      if (nome) nomes.add(nome);
    }
  }
  return [...nomes].sort();
}

describe("o duplo do next/font/google", () => {
  it("conhece todas as letras que a aplicação importa", async () => {
    const usadas = familiasDaAplicacao();
    const duplo = (await import("./next-font-google")) as Record<string, unknown>;
    const emFalta = usadas.filter((n) => typeof duplo[n] !== "function");
    expect(
      emFalta,
      `estas letras são importadas pela aplicação e o duplo não as tem:\n  ${emFalta.join(
        "\n  ",
      )}\nAcrescente-as a \`test/next-font-google.ts\` — sem isso, qualquer teste que monte o layout que as usa rebenta com «X is not a function».`,
    ).toEqual([]);
  });

  it("e a aplicação importa mesmo letras — senão o caso de cima não guarda nada", () => {
    // O controlo positivo. Se a leitura do código deixar de encontrar
    // importações (um `grep` que muda de forma, uma pasta que muda de sítio),
    // o caso de cima passa a comparar uma lista vazia com outra lista vazia.
    expect(familiasDaAplicacao().length).toBeGreaterThan(2);
  });

  it("o duplo devolve a forma do verdadeiro", () => {
    // Um duplo que mentisse sobre a forma dava um teste verde e um layout
    // partido: quem chama isto põe o `variable` num `className`.
    const duplo = readFileSync("test/next-font-google.ts", "utf8");
    expect(duplo).toContain("className");
    expect(duplo).toContain("variable");
    expect(duplo).toContain("fontFamily");
  });
});
