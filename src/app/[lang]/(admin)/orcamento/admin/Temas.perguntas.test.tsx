import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ELIMINAR UM TEMA DEIXA DE PASSAR PELA CAIXA DO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As razões gerais estão no `Tarefas.perguntas.test.tsx`. Este é o gesto mais
 * caro dos que já se converteram: um tema leva as fotografias todas com ele, e
 * a pergunta antiga espremia isso numa frase única do `confirm()` —
 * «Eliminar o tema "X" e as suas 24 fotos? As propostas já feitas…».
 *
 * A janela da casa tem um sítio próprio para isso: a `oQueSePerde` é uma LISTA,
 * uma linha por coisa, e é ela que faz a pergunta valer o toque. A contagem
 * pode ser desconhecida (pasta ilegível) ou um mínimo (contagem truncada), e as
 * três versões têm de continuar a fazer sentido.
 *
 * ── PORQUE É QUE ISTO LÊ O CÓDIGO EM VEZ DE DESENHAR O ECRÃ ───────────────
 *
 * Porque o comportamento já está desenhado e medido noutro sítio: o
 * `Temas.test.tsx` monta a biblioteca a sério e passa pela pergunta para provar
 * que a eliminação continua a correr. O que falta a esse é o que este ficheiro
 * guarda: que a pergunta é a da casa e não a do browser, e que a lista do que
 * se perde não voltou a ser uma frase espremida.
 *
 * ── O QUE FICA POR CONVERTER NESTE ECRÃ ───────────────────────────────────
 *
 * Três caixas, e cada uma pela sua razão:
 *
 *   · remover UMA foto e remover as fotos SELECCIONADAS vivem no componente da
 *     pasta aberta, que é outro ficheiro de trabalho e outro bloco.
 *   · sair com fotos ainda a subir NÃO é um apagar: é uma guarda de navegação
 *     síncrona, da mesma família das três do `AdminClient`. A pergunta tem de
 *     acontecer antes de a vista se ir embora, e isso pede um desenho próprio —
 *     não uma substituição.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Temas.tsx", "utf8");

/** Comentários fora: as palavras que se procuram vivem nos comentários. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** O corpo do `removeTheme`, do nome até à chaveta que o fecha. */
function removeTheme(): string {
  const codigo = semComentarios(FONTE);
  const i = codigo.indexOf("async function removeTheme(");
  expect(i, "o `removeTheme` desapareceu").toBeGreaterThan(-1);
  return codigo.slice(i, codigo.indexOf("\n  }", i));
}

describe("a pergunta de eliminar um tema", () => {
  it("o eliminar já não abre a caixa do browser", () => {
    expect(
      removeTheme(),
      "voltou o `confirm()` a este gesto — o mais caro de todos, e no telemóvel dela",
    ).not.toMatch(/\bconfirm\(/);
  });

  it("a pergunta da casa está montada, com o nome do tema", () => {
    const codigo = semComentarios(FONTE);
    expect(codigo, "a `PerguntaDestrutiva` desapareceu do ecrã dos temas").toContain(
      "<PerguntaDestrutiva",
    );
    expect(codigo, "a pergunta deixou de dizer qual tema").toMatch(
      /titulo=\{`Eliminar o tema «\$\{aEliminar\?\.name/,
    );
    expect(codigo, "o botão deixou de repetir o verbo").toContain(
      'rotuloConfirmar="Eliminar o tema"',
    );
  });

  it("o que se perde é uma lista, e cobre os três casos da contagem", () => {
    const codigo = semComentarios(FONTE);
    expect(codigo, "a lista do que se perde desapareceu").toContain("oQueSePerde=");
    // Pasta ilegível, contagem truncada, pasta vazia: as três leituras que a
    // frase antiga já tinha de aguentar.
    expect(codigo, "o caso da pasta ilegível perdeu-se").toContain("imageCount === null");
    expect(codigo, "o caso da contagem truncada perdeu-se").toContain("truncated");
    expect(codigo, "o caso da pasta vazia perdeu-se").toMatch(/vazia/i);
  });

  it("a pergunta aparece nos DOIS ramos do desenho", () => {
    // Eliminar chega-se da lista E de dentro da pasta aberta, e esse ramo
    // devolve outro componente. Com a pergunta só num deles, o gesto feito lá
    // dentro não tinha onde aparecer — e não dava erro nenhum: não acontecia
    // simplesmente nada.
    const codigo = semComentarios(FONTE);
    const usos = codigo.split("{perguntaDeEliminar}").length - 1;
    expect(usos, "a pergunta deixou de estar nos dois ramos do desenho").toBe(2);
  });
});
