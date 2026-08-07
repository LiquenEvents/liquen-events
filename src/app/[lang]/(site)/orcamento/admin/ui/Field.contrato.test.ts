import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NINGUÉM PODE PÔR UM CONTROLO POR DENTRO DO `Field`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `Field` DESENHA o controlo: recebe as propriedades dele e devolve um
 * `<label for>` já ligado a um `<input>`, `<select>` ou `<textarea>` — é essa
 * a razão de ele existir. Escrever
 *
 *     <Field label="Nome"><input className="bo-input" /></Field>
 *
 * parece inofensivo e compila, mas o `<input>` que lá está vai parar aos
 * `children` do `<input>` que o `Field` desenha — e um elemento vazio não pode
 * ter filhos. O React não avisa: ABORTA a árvore. O ecrã inteiro fica em
 * branco, sem mensagem de erro visível.
 *
 * Foi assim que os três separadores do Material estiveram partidos. A forma
 * certa é passar as propriedades ao `Field` (`<Field label="Nome" value=… />`)
 * e, quando é um `<select>`, dizer `as="select"` e deixar só os `<option>` lá
 * dentro — que é o único filho que ele espera.
 *
 * Este teste lê o código-fonte porque o defeito não aparece em nenhuma
 * assinatura de tipo: o `Field` aceita `Record<string, unknown>` para poder
 * reencaminhar as propriedades nativas, e `children` entra por aí.
 */

const RAIZ = join(process.cwd(), "src");

function ficheiros(dir: string, out: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheiros(caminho, out);
    else if (caminho.endsWith(".tsx")) out.push(caminho);
  }
  return out;
}

/**
 * Onde acaba a etiqueta de abertura de um `<Field`. Uma expressão regular
 * simples não serve: o `>` das setas (`onChange={(e) => …}`) fecharia a
 * etiqueta cedo demais. Por isso conta-se o aninhamento de `{}` e ignoram-se
 * as aspas — é uma leitura tosca, mas é a que distingue as duas coisas.
 *
 * Devolve o fim da etiqueta e se ela é `/>` (sem filhos).
 */
function fimDaEtiqueta(src: string, inicio: number): { fim: number; sozinha: boolean } | null {
  let chavetas = 0;
  let aspas: string | null = null;
  for (let i = inicio; i < src.length; i++) {
    const c = src[i];
    if (aspas) {
      if (c === aspas) aspas = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") aspas = c;
    else if (c === "{") chavetas++;
    else if (c === "}") chavetas--;
    else if (c === ">" && chavetas === 0) {
      return { fim: i, sozinha: src[i - 1] === "/" };
    }
  }
  return null;
}

/** Os controlos que aparecem POR DENTRO de um `<Field>`, se houver algum. */
function controlosDentroDeField(src: string): string[] {
  const achados: string[] = [];
  for (const m of src.matchAll(/<Field\b/g)) {
    const abre = fimDaEtiqueta(src, m.index + 6);
    if (!abre || abre.sozinha) continue; // sem filhos: nada a verificar.
    const fecha = src.indexOf("</Field>", abre.fim);
    if (fecha < 0) continue;

    const atributos = src.slice(m.index, abre.fim);
    const filhos = src.slice(abre.fim + 1, fecha);
    const controlo = /<(input|select|textarea)\b/.exec(filhos);
    if (!controlo) continue;
    // `as="select"` / `as="textarea"` com `<option>`s lá dentro é o uso
    // correcto — o que não pode é o CONTROLO vir por dentro.
    const as = /\bas="(\w+)"/.exec(atributos)?.[1] ?? "input";
    achados.push(`<${controlo[1]}> dentro de <Field as="${as}">`);
  }
  return achados;
}

describe("o Field desenha o controlo, não o embrulha", () => {
  it("nenhum ecrã põe um <input>/<select>/<textarea> por dentro de um <Field>", () => {
    const maus: string[] = [];
    for (const f of ficheiros(RAIZ)) {
      // Dois sítios escrevem a forma ERRADA de propósito: o comentário do
      // próprio `Field`, que é onde ela está explicada, e o teste que prova
      // que ela já não derruba o ecrã. O varrimento é textual e não distingue
      // um do outro — e o alvo aqui são os ECRÃS, não a documentação deles.
      if (f.endsWith(join("ui", "Field.tsx")) || f.endsWith(".test.tsx")) continue;
      for (const achado of controlosDentroDeField(readFileSync(f, "utf8"))) {
        maus.push(`${f.slice(RAIZ.length + 1)} → ${achado}`);
      }
    }
    expect(maus).toEqual([]);
  });

  /**
   * O varrimento acima só vale se apanhar mesmo o defeito. Um teste que passa
   * porque nunca encontra nada não protege coisa nenhuma — e a primeira versão
   * desta expressão parava no `>` de uma seta e deixava passar tudo.
   */
  it("o varrimento apanha o defeito, e deixa passar o uso correcto", () => {
    const mau = `<Field label="Nome"><input className="bo-input" /></Field>`;
    expect(controlosDentroDeField(mau)).toHaveLength(1);

    const comSeta = `<Field label="Nome" onChange={(e) => set(e)}><input /></Field>`;
    expect(controlosDentroDeField(comSeta)).toHaveLength(1);

    const bom = `<Field label="Nome" onChange={(e) => set(e)} value={n} />`;
    expect(controlosDentroDeField(bom)).toEqual([]);

    const select = `<Field as="select" label="Tipo" onChange={(e) => set(e)}><option value="a">A</option></Field>`;
    expect(controlosDentroDeField(select)).toEqual([]);
  });
});
