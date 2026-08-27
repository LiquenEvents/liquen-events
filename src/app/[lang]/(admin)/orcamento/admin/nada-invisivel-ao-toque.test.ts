import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NADA QUE SE TOQUE PODE ESTAR INVISÍVEL NO TELEMÓVEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esconder uma acção até ao `hover` é uma decisão de densidade legítima — com
 * RATO. Num ecrã táctil não há hover nenhum, e `opacity: 0` **não desliga o
 * toque**: o elemento continua a apanhar o dedo, invisível.
 *
 * O caso que deu origem a este teste: o «×» que apaga uma fotografia no
 * Estúdio de Propostas. Desenhado `opacity-0 group-hover:opacity-100`, nunca
 * se via no telemóvel, e um toque no canto da miniatura apagava a fotografia
 * sem nada ter aparecido antes. Era o único botão destrutivo do back office
 * assim — e no telemóvel o engano nem se desfaz, porque o Cmd+Z do estúdio
 * não existe lá.
 *
 * A casa já tinha a resposta escrita em `globals.css:98`:
 *
 *     opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100
 *
 * — à vista no dedo, escondido até ao hover só onde HÁ rato. O
 * `ServicesEditor` e os `Fornecedores` já a seguiam; dois sítios ficaram para
 * trás. Este teste é o que impede que voltem a ficar.
 */

const ADMIN = path.join(process.cwd(), "src", "app", "[lang]", "(admin)", "orcamento", "admin");

function ficheiros(dir: string, acc: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) ficheiros(p, acc);
    else if (nome.endsWith(".tsx") && !nome.includes(".test.")) acc.push(p);
  }
  return acc;
}

/**
 * As linhas que escondem alguma coisa até ao hover. Procura-se o par —
 * `opacity-0` **e** um `group-hover:opacity-100`/`group-hover/x:opacity-100` —
 * porque `opacity-0` sozinho é quase sempre outra coisa (uma fotografia a
 * aparecer quando carrega, um aviso a entrar).
 */
const ESCONDE_ATE_AO_HOVER = /opacity-0/;
const REVELA_NO_HOVER = /group-hover(?:\/[\w-]+)?:opacity-100/;

/** As três saídas aceites, todas equivalentes: à vista onde não há rato. */
const TEM_SAIDA_TACTIL = [
  /com-rato:opacity-0/, // o par da casa: só se esconde onde HÁ rato
  /\[@media\(hover:none\)\]:opacity-100/, // a mesma ideia, escrita à mão
  /com-rato:flex|com-rato:hidden/, // duas formas: uma para o dedo, outra para o rato
];

describe("nada que se toque fica invisível no telemóvel", () => {
  const suspeitos: { ficheiro: string; linha: number; texto: string }[] = [];
  const ficheirosDoAdmin = ficheiros(ADMIN);

  for (const f of ficheirosDoAdmin) {
    const linhas = readFileSync(f, "utf8").split("\n");
    linhas.forEach((linha, i) => {
      // Comentários não desenham nada — e este código tem muitos a falar de
      // `opacity-0` precisamente por causa de correcções anteriores.
      const semComentario = linha.replace(/\/\*.*?\*\//g, "").replace(/^\s*[*/].*/, "");
      if (!ESCONDE_ATE_AO_HOVER.test(semComentario)) return;
      if (!REVELA_NO_HOVER.test(semComentario)) return;
      if (TEM_SAIDA_TACTIL.some((r) => r.test(semComentario))) return;
      suspeitos.push({
        ficheiro: path.relative(process.cwd(), f),
        linha: i + 1,
        texto: linha.trim(),
      });
    });
  }

  it("há ficheiros e classes para percorrer (controlo positivo)", () => {
    // Sem isto, uma expressão regular partida deixava o teste verde por não
    // encontrar nada — que é exactamente a forma de ele deixar de servir.
    expect(ficheirosDoAdmin.length).toBeGreaterThan(50);
    const comOPar = ficheirosDoAdmin.filter((f) => {
      const src = readFileSync(f, "utf8");
      return ESCONDE_ATE_AO_HOVER.test(src) && REVELA_NO_HOVER.test(src);
    });
    expect(comOPar.length).toBeGreaterThan(3);
  });

  it("nenhuma acção se esconde sem uma saída para o dedo", () => {
    expect(
      suspeitos.map((s) => `${s.ficheiro}:${s.linha}\n    ${s.texto.slice(0, 160)}`),
      "Isto esconde-se até ao hover e não tem saída táctil. Num ecrã de toque " +
        "não se vê — e continua a apanhar o dedo. Usa o par da casa: " +
        "`opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100` (globals.css:98).",
    ).toEqual([]);
  });
});
