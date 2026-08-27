import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * SEM TRAVESSÕES NO TEXTO COMPOSTO NOS COMPONENTES.
 *
 * O irmão deste teste (`no-dashes.test.ts`) percorre os dicionários e os dados,
 * mas não vê texto MONTADO em código, como o `alt` da galeria:
 *
 *     return c ? `${base} — ${c}` : base;
 *
 * Foi exactamente por aí que três travessões sobreviveram à primeira limpeza:
 * vivem em `alt`/`aria-label`, que só aparecem no ecrã quando a imagem falha ou
 * quando alguém usa um leitor de ecrã. Passaram despercebidos numa inspecção
 * visual e só se viram quando a galeria não carregou.
 *
 * Aqui lê-se o CÓDIGO-FONTE das páginas públicas, tiram-se os comentários (que
 * podem usar travessões à vontade, nunca chegam ao ecrã) e exige-se que não
 * sobre nenhum. O back office está de fora: a limpeza pedida foi do site.
 */

const ROOT = process.cwd();

/** Pastas de código do site público (o back office fica de fora). */
const ROOTS = ["src/components", "src/app/[lang]"];

/** Sub-árvores que não são site público. */
const SKIP = ["src/app/[lang]/(admin)/orcamento/admin"];

function sourceFiles(dir: string, out: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (SKIP.some((s) => rel === s || rel.startsWith(s + path.sep))) continue;
    if (entry.isDirectory()) sourceFiles(rel, out);
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(rel);
  }
  return out;
}

/**
 * Remove comentários de bloco, de linha e de JSX. Grosseiro de propósito: pode
 * apagar a mais (uma "//" dentro de uma string), e o pior que isso faz é deixar
 * passar um travessão — nunca acusar um que não existe.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\/\/[^\n"'`]*$/gm, "");
}

describe("o texto montado nos componentes não usa travessões", () => {
  const files = ROOTS.flatMap((r) => sourceFiles(r));

  it("encontra ficheiros para analisar", () => {
    // Se o varrimento se partir, os testes abaixo passavam por vazios.
    expect(files.length).toBeGreaterThan(20);
  });

  it("nenhum travessão fora de comentários", () => {
    const offenders: string[] = [];
    for (const file of files) {
      const code = stripComments(fs.readFileSync(path.join(ROOT, file), "utf8"));
      code.split("\n").forEach((line, i) => {
        if (line.includes("—")) offenders.push(`${file}:${i + 1}: ${line.trim().slice(0, 100)}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it("o removedor de comentários não engole código a sério", () => {
    expect(stripComments('const a = "x"; // nota — com travessão')).not.toContain("—");
    expect(stripComments("/* bloco — nota */ const a = `y — z`;")).toContain("`y — z`");
  });
});
