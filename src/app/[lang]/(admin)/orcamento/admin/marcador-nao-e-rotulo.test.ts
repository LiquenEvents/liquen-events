import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM `placeholder` DÁ UM EXEMPLO — NÃO FAZ DE RÓTULO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra 7 do capítulo «Escrita». O defeito tem sempre a mesma forma: o campo
 * não tem rótulo nenhum e o marcador cinzento diz a palavra que o rótulo diria.
 * Lê-se bem — até se escrever a primeira letra. Aí o marcador desaparece e o
 * campo fica anónimo, exactamente no momento em que já não se pode confirmar
 * sobre o que era. Quem ouve o ecrã nunca chegou a saber: um `placeholder` não
 * é nome acessível de coisa nenhuma.
 *
 * Dois estavam assim, e o primeiro é o retrato do problema:
 *
 *   · `Tarefas.tsx`  — `placeholder="Responsável"`, sem rótulo. E o ramo do
 *     lado do MESMO ternário (a `Escolha`, para quando a equipa já está
 *     montada) tinha `aria-label="Responsável"`. O mesmo campo, dois desenhos,
 *     e só um deles com nome.
 *   · `PerguntaDeDesfecho.tsx` — `placeholder="Detalhe opcional…"`, sem rótulo.
 *
 * ── O QUE CONTA COMO RÓTULO, AQUI ─────────────────────────────────────────
 *
 * Qualquer uma das três: um `aria-label`/`aria-labelledby` no próprio campo,
 * um `id` apanhado por um `htmlFor` do ficheiro, ou um `<label` nas doze
 * linhas acima — que é como se escreve o `<label>` a envolver o campo (o
 * `Servicos.tsx` monta oito assim) e o `<label>` solto por cima dele (o
 * `RichEmailEditor.tsx`).
 *
 * ── A JANELA DE DOZE LINHAS É UMA APROXIMAÇÃO, E ASSUMO-A ─────────────────
 *
 * Um `<label>` a treze linhas de distância dava um falso positivo. Mas o preço
 * desse falso positivo é UMA linha — pôr um `aria-label` no campo, que é uma
 * coisa que ele devia ter de qualquer maneira. Prefiro esse custo ao contrário:
 * uma janela grande deixa passar o campo órfão que está debaixo do rótulo de
 * OUTRO campo, que foi como estes dois sobreviveram a três revisões.
 *
 * Medido no dia em que nasceu: 14 campos com marcador em toda a árvore do back
 * office, 12 com rótulo à vista e estes 2 sem nada.
 */

const ROOT = process.cwd();
const ARVORE = "src/app/[lang]/(admin)/orcamento/admin";

/** Quantas linhas acima do campo se aceita encontrar o `<label>`. */
const JANELA = 12;

function ficheiros(dir: string, fora: string[] = []): string[] {
  for (const entrada of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, entrada.name);
    if (entrada.isDirectory()) ficheiros(rel, fora);
    else if (/\.tsx$/.test(entrada.name) && !/\.test\.tsx$/.test(entrada.name)) fora.push(rel);
  }
  return fora;
}

/** Comentários fora, mudanças de linha dentro (o número acusado é o real). */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/** A etiqueta de abertura que começa em `inicio`, com `{}` e `<>` equilibrados. */
function etiqueta(fonte: string, inicio: number): string {
  let chaves = 0;
  let angulos = 0;
  for (let i = inicio; i < fonte.length; i++) {
    const c = fonte[i];
    if (c === "{") chaves++;
    else if (c === "}") chaves--;
    else if (c === "<" && chaves === 0) angulos++;
    else if (c === ">" && chaves === 0) {
      angulos--;
      if (angulos === 0) return fonte.slice(inicio, i + 1);
    }
  }
  return "";
}

interface Campo {
  onde: string;
  marcador: string;
  temRotulo: boolean;
}

function camposComMarcador(): Campo[] {
  const fora: Campo[] = [];
  for (const ficheiro of ficheiros(ARVORE)) {
    const fonte = semComentarios(fs.readFileSync(path.join(ROOT, ficheiro), "utf8"));
    const linhas = fonte.split("\n");
    const re = /<(input|textarea)[\s>]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte))) {
      const etiq = etiqueta(fonte, m.index);
      if (!/placeholder=/.test(etiq)) continue;

      const nLinha = fonte.slice(0, m.index).split("\n").length;
      const id = etiq.match(/\bid=\{?["`]?([\w$-]+)/)?.[1];
      const acima = linhas.slice(Math.max(0, nLinha - 1 - JANELA), nLinha - 1).join("\n");

      const temRotulo =
        /aria-label(ledby)?=/.test(etiq) ||
        (!!id && new RegExp(`htmlFor=\\{?["\`]?${id}`).test(fonte)) ||
        /<label\b/.test(acima);

      fora.push({
        onde: `${ficheiro}:${nLinha} <${m[1]}>`,
        marcador: etiq.match(/placeholder=\{?["`]([^"`]*)/)?.[1] ?? "(dinâmico)",
        temRotulo,
      });
    }
  }
  return fora;
}

describe("o marcador de um campo não faz de rótulo", () => {
  const campos = camposComMarcador();

  it("encontra campos com marcador para analisar", () => {
    // Sem isto, um leitor partido deixava o teste verde a não olhar para nada.
    expect(campos.length).toBeGreaterThan(8);
  });

  it("todo o campo com marcador tem rótulo por outra via", () => {
    const orfaos = campos
      .filter((c) => !c.temRotulo)
      .map(
        (c) =>
          `${c.onde} :: placeholder="${c.marcador}" e mais nada — ` +
          `dá-lhe um aria-label, um htmlFor ou um <label> por cima`,
      );
    expect(orfaos).toEqual([]);
  });
});
