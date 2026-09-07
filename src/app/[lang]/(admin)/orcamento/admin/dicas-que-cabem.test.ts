import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA DICA DE `title` NÃO É UM PARÁGRAFO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra 8 do capítulo «Escrita»: a dica descreve SÓ o controlo apontado,
 * começa por verbo, não repete o nome do controlo, tem 60 a 75 caracteres e
 * **não leva ponto final**.
 *
 * O `title` do browser não é um sítio onde se possa escrever à vontade: abre
 * ao fim de um segundo de rato parado, desaparece sozinho, não quebra linha de
 * forma previsível e não aparece de todo ao toque. O que não couber num
 * relance não é lido — fica só a ocupar o ecrã de quem passou o rato por
 * engano.
 *
 * Quatro tinham passado a fronteira, e a mais longa contava a história toda:
 *
 *   · `NotificationBell.tsx`  117 caracteres, duas frases, e repetia o rótulo
 *                             do próprio botão («Notificações: …»)
 *   · `ServicesEditor.tsx`     84, com ponto final, e repetia o `aria-label`
 *   · `DossierHeader.tsx`      82, uma lista de quatro coisas entre parênteses
 *   · `ProposalStudio.tsx`     76, com ponto final
 *
 * ── O QUE ESTE TESTE MEDE, E O QUE DEIXA À REVISÃO ────────────────────────
 *
 * Mede as duas metades da regra que são CONTÁVEIS: o comprimento e o ponto
 * final. As outras duas — «começa por verbo» e «não repete o nome do
 * controlo» — precisavam de uma lista de verbos e de saber qual é o rótulo
 * daquele botão, e as duas coisas dão falsos positivos a rodos: metade dos
 * verbos desta casa são reflexos («Numera-se sozinho»), e um rótulo pode estar
 * três componentes acima. Um teste frágil ensina a desligá-lo; fica dito aqui
 * que essa metade se revê a olho.
 *
 * O PISO DE 60 CARACTERES TAMBÉM NÃO SE MEDE, e de propósito. A regra dá uma
 * FAIXA para a dica que explica alguma coisa, não um mínimo para todas: mais
 * de metade das dicas do back office são o nome da acção de um botão só com
 * ícone («Copiar email», «Recolher o menu», «Terminar sessão»), e essas estão
 * certas com quinze caracteres. Alongá-las até sessenta era escrever ruído
 * para passar num teste.
 *
 * Só se olha para `title` em CONTROLOS — `<button>`, `<a>`, `<input>`,
 * `<select>`, `<textarea>` e o `ui/Button`, que o entrega ao `<button>` de
 * dentro. O `title` num `<span>` de texto estático é outra coisa: é o texto
 * que não coube na caixa (ver o `ProposalStudio`, onde a célula tem 104 px e
 * `overflow-hidden`), e a regra 8 não fala dele.
 */

const ROOT = process.cwd();
const ARVORE = "src/app/[lang]/(admin)/orcamento/admin";

/** O máximo da faixa da regra 8. */
const MAXIMO = 75;

/** Etiquetas que abrem um controlo a sério — as que o rato aponta e o dedo carrega. */
const CONTROLOS = /<(button|a|input|select|textarea|Button)[\s>]/g;

function ficheiros(dir: string, fora: string[] = []): string[] {
  const abs = path.join(ROOT, dir);
  for (const entrada of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entrada.name);
    if (entrada.isDirectory()) ficheiros(rel, fora);
    else if (/\.tsx$/.test(entrada.name) && !/\.test\.tsx$/.test(entrada.name)) fora.push(rel);
  }
  return fora;
}

/** Comentários fora, mudanças de linha dentro (para o número acusado ser o real). */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, " "))
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

/**
 * O texto da etiqueta de abertura que começa em `inicio`, com `{}` e `<>`
 * equilibrados — sem isto, um `iconLeft={<svg …/>}` fechava a etiqueta cedo e
 * o `title` que vem a seguir ficava por ler.
 */
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

interface Dica {
  onde: string;
  texto: string;
}

function dicasDosControlos(): Dica[] {
  const fora: Dica[] = [];
  for (const ficheiro of ficheiros(ARVORE)) {
    const fonte = semComentarios(fs.readFileSync(path.join(ROOT, ficheiro), "utf8"));
    CONTROLOS.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = CONTROLOS.exec(fonte))) {
      const encontrada = etiqueta(fonte, m.index).match(/\btitle="([^"]*)"/);
      if (!encontrada) continue;
      const linha = fonte.slice(0, m.index).split("\n").length;
      fora.push({ onde: `${ficheiro}:${linha} <${m[1]}>`, texto: encontrada[1] });
    }
  }
  return fora;
}

describe("as dicas dos controlos do back office", () => {
  const dicas = dicasDosControlos();

  it("encontra dicas para analisar", () => {
    // Se o leitor de etiquetas se partir, os dois testes abaixo passavam por
    // não terem nada na mão.
    expect(dicas.length).toBeGreaterThan(30);
  });

  it("nenhuma leva ponto final", () => {
    const culpadas = dicas
      .filter((d) => /[.!]$/.test(d.texto))
      .map((d) => `${d.onde} :: ${d.texto}`);
    expect(culpadas).toEqual([]);
  });

  it("nenhuma passa dos 75 caracteres", () => {
    const culpadas = dicas
      .filter((d) => d.texto.length > MAXIMO)
      .map((d) => `${d.onde} (${d.texto.length}) :: ${d.texto}`);
    expect(culpadas).toEqual([]);
  });

  it("o leitor de etiquetas atravessa um `iconLeft` com SVG lá dentro", () => {
    // Foi este caso que escondeu três das quatro dicas longas de uma primeira
    // contagem: a etiqueta do `Button` tem um `<svg>` inteiro no meio.
    const fonte =
      '<Button iconLeft={<svg width="14"><path d="M0 0" /></svg>} title="Imprimir">x</Button>';
    expect(etiqueta(fonte, 0)).toContain('title="Imprimir"');
  });
});
