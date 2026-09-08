import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VIGILANTE DO «ALGO CORREU MAL» DEIXA DE OLHAR SÓ PARA UM FICHEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra da casa está escrita no `porque-falhou.ts`: «se falhar, dizer o que
 * aconteceu, porquê e o que fazer — nunca "algo correu mal"». E havia um teste
 * a prendê-la: o `porque-falhou.test.ts`, no «nenhuma diz «algo correu mal»».
 *
 * Só que esse teste chama a FUNÇÃO e lê o que ela devolve. Ou seja: vigia as
 * oito frases que nascem dentro do `porque-falhou.ts` e mais nenhuma. Enquanto
 * ele passava a verde, duas superfícies diziam exactamente a frase proibida:
 *
 *   · `src/app/global-error.tsx`   → «Algo correu mal.» / «Something went wrong.»
 *   · `src/lib/i18n/pt.ts`         → «Algo correu mal» + «Ocorreu um erro inesperado.»
 *   · `src/lib/i18n/en.ts`         → «Something went wrong» + «An unexpected error occurred.»
 *
 * E não são superfícies quaisquer: são as duas que aparecem quando o back
 * office rebenta POR INTEIRO — o sítio onde uma frase vaga custa mais, porque
 * é o único ecrã que sobra e não há mais nada para ler.
 *
 * Este ficheiro varre o TEXTO, não a função: os dois dicionários, os ecrãs de
 * erro e de «não encontrado», e a árvore do back office. Um vigilante que só
 * olha para a sua própria casa não é um vigilante.
 *
 * ── PORQUE É QUE OS COMENTÁRIOS SAEM ANTES ────────────────────────────────
 *
 * Meia dúzia de cabeçalhos desta casa CITAM a frase proibida para explicar
 * porque é que ela foi embora — o `(admin)/error.tsx` abre com ela em bloco de
 * citação. Um comentário nunca chega ao ecrã; acusá-lo era ensinar a próxima
 * pessoa a apagar a explicação em vez do defeito.
 */

const ROOT = process.cwd();

/**
 * As frases que não dizem nada, nas duas línguas em que o produto sai.
 *
 * Cada uma tem o mesmo defeito: nomeia a existência de um problema e mais
 * nada — nem o que parou, nem o que fazer a seguir. Depois delas, quem lê faz
 * sempre a mesma coisa (carregar outra vez), e metade das vezes isso não
 * resolve.
 */
const PROIBIDAS: { padrao: RegExp; porque: string }[] = [
  { padrao: /algo correu mal/i, porque: "não diz o que parou nem o que fazer" },
  { padrao: /ocorreu um erro/i, porque: "anuncia o erro sem o nomear" },
  { padrao: /erro inesperado/i, porque: "«inesperado» não é informação" },
  { padrao: /something went wrong/i, porque: "o par inglês de «algo correu mal»" },
  { padrao: /unexpected error/i, porque: "o par inglês de «erro inesperado»" },
  { padrao: /an error occurred/i, porque: "o par inglês de «ocorreu um erro»" },
];

/** Ficheiros soltos de texto visível — dicionários e ecrãs de fim de linha. */
const FICHEIROS = [
  "src/lib/i18n/pt.ts",
  "src/lib/i18n/en.ts",
  "src/lib/porque-falhou.ts",
  "src/app/global-error.tsx",
  "src/app/[lang]/(admin)/error.tsx",
  "src/app/[lang]/(site)/error.tsx",
  "src/app/[lang]/(site)/not-found.tsx",
  "src/app/[lang]/s/not-found.tsx",
];

/** E a árvore inteira do back office, que é onde vivem as frases de falha. */
const ARVORES = ["src/app/[lang]/(admin)/orcamento/admin"];

function ficheirosDaArvore(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entrada of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entrada.name);
    if (entrada.isDirectory()) ficheirosDaArvore(rel, out);
    else if (/\.tsx?$/.test(entrada.name) && !/\.test\.tsx?$/.test(entrada.name)) out.push(rel);
  }
  return out;
}

/**
 * Tira comentários de bloco e de linha. Grosseiro de propósito, e enviesado
 * para o lado seguro: se apagar de mais, o pior que acontece é deixar passar
 * uma frase proibida — nunca acusar uma que não existe.
 *
 * Os blocos vão-se embora MAS as mudanças de linha ficam: sem isso, o número
 * que a acusação mostra não é o número que se abre no editor, e um ficheiro
 * desta casa tem cabeçalhos de setenta linhas.
 */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\/\/[^\n"'`]*$/gm, "");
}

describe("nenhuma superfície visível diz «algo correu mal»", () => {
  const alvos = [...FICHEIROS, ...ARVORES.flatMap((a) => ficheirosDaArvore(a))];

  it("encontra as fontes de texto visível para analisar", () => {
    // Se o varrimento se partir (uma pasta que muda de nome), o teste abaixo
    // passava por não ter nada para ler — e era pior do que não existir.
    for (const f of FICHEIROS) {
      expect(fs.existsSync(path.join(ROOT, f)), f).toBe(true);
    }
    // 174 ficheiros na árvore do back office + os oito soltos, no dia em que
    // isto foi escrito. O piso é folgado: guarda contra o varrimento partido,
    // não contra a árvore encolher um ficheiro.
    expect(alvos.length).toBeGreaterThan(150);
  });

  it("nenhuma frase vaga fora de comentários", () => {
    const culpados: string[] = [];
    for (const ficheiro of alvos) {
      const codigo = semComentarios(fs.readFileSync(path.join(ROOT, ficheiro), "utf8"));
      codigo.split("\n").forEach((linha, i) => {
        for (const { padrao, porque } of PROIBIDAS) {
          if (padrao.test(linha)) {
            culpados.push(`${ficheiro}:${i + 1} (${porque}) :: ${linha.trim().slice(0, 90)}`);
          }
        }
      });
    }
    expect(culpados).toEqual([]);
  });

  it("o removedor de comentários não engole texto a sério", () => {
    expect(semComentarios('const a = "x"; // nota: algo correu mal')).not.toMatch(
      /algo correu mal/i,
    );
    expect(semComentarios('/* citação: algo correu mal */ const a = "algo correu mal";')).toMatch(
      /algo correu mal/i,
    );
  });
});
