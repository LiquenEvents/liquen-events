import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PRÉ-VISUALIZAÇÃO TEM DE TER A LETRA DO QUE O CLIENTE RECEBE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Temos diferentes tipos de letra», disse ela. Este era um deles, e o pior:
 *
 * A proposta que chega ao cliente é desenhada em PLAYFAIR — está escrito por
 * extenso no `Documento.tsx` e no `Inspiracao.tsx`, em `var(--font-playfair)`.
 * A pré-visualização que ela vê no back office antes de carregar em «Enviar»
 * pedia `font-serif`, e `--font-serif` não está definido em lado nenhum desta
 * casa: caía na omissão do Tailwind, que é Georgia.
 *
 * Ou seja: a folha que ela conferia não tinha a letra da folha que saía. E o
 * comentário do próprio `FolhaDaProposta.tsx` diz para que serve o ficheiro,
 * com as palavras dela: «uma pré-visualização parcial dá falsa confiança».
 *
 * Duas outras estavam em Georgia por engano — o título «Ainda não há lista de
 * carga» e o da folha «Criar a partir de» —, num back office em que todos os
 * outros títulos são `font-display`.
 *
 * ── O ITÁLICO É UMA FAMÍLIA À PARTE, E NÃO UMA INCLINAÇÃO ─────────────────
 *
 * `font-display italic` já não serve: a família do display passou a ter só o
 * romano, e pedir-lhe itálico dá a oblíqua sintética do browser — que foi
 * exactamente o que esta casa recusou quando escreveu a `.font-display-italico`.
 * É essa a classe que as linhas em itálico da prévia passam a usar.
 */

const RAIZ = path.join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/**
 * O único `font-serif` que fica, e porquê: é o glifo «I» do botão de itálico
 * do editor de email — um ícone, não texto de interface. Um serif genérico
 * inclinado é o desenho convencional desse botão em toda a parte.
 */
const PERDOADOS = ["RichEmailEditor.tsx"];

function ficheirosDeEcra(dir: string, saco: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheirosDeEcra(p, saco);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) saco.push(p);
  }
  return saco;
}

describe("a letra da pré-visualização", () => {
  it("é a da casa, e não o serif de omissão do Tailwind", () => {
    const soltos: string[] = [];
    for (const f of ficheirosDeEcra(RAIZ)) {
      if (PERDOADOS.includes(path.basename(f))) continue;
      const texto = fs.readFileSync(f, "utf8");
      for (const [i, linha] of texto.split("\n").entries()) {
        if (/\bfont-serif\b/.test(linha)) {
          soltos.push(`  ${path.relative(RAIZ, f)}:${i + 1}`);
        }
      }
    }
    expect(
      soltos,
      `${soltos.length} sítio(s) a pedir \`font-serif\`, que nesta casa não está definido e cai ` +
        `em Georgia.\nPara texto romano usa \`font-display\`; para itálico, ` +
        `\`font-display-italico\` — o \`font-display italic\` dá a oblíqua sintética.\n` +
        soltos.join("\n"),
    ).toEqual([]);
  });

  it("e a folha da proposta desenha-se mesmo na letra do documento", () => {
    for (const f of ["FolhaDaProposta.tsx", "PreviaDaPagina.tsx"]) {
      const texto = fs.readFileSync(path.join(RAIZ, f), "utf8");
      expect(texto, `${f} deixou de desenhar na letra da casa`).toMatch(
        /font-display(-italico)?\b/,
      );
    }
  });
});
