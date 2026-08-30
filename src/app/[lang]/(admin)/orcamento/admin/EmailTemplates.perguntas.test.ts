import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS TRÊS PERGUNTAS DO EDITOR CLÁSSICO DEIXAM DE SER CAIXAS DO BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nenhuma destas é um «apagar», e as três são destrutivas na mesma: o que se
 * perde é TRABALHO.
 *
 *   1. mudar de modelo com o rascunho por gravar — e só quando este aparelho
 *      não está a deixar guardar rascunhos, que é o caso em que a perda é real;
 *   2. descartar as alterações por publicar;
 *   3. voltar ao editor visual a partir de HTML escrito à mão, onde a
 *      formatação avançada se converte em texto simples.
 *
 * Nas três, quem responde «sim» perde o que escreveu — portanto o botão
 * vermelho da `PerguntaDestrutiva` está no sítio certo.
 *
 * ── UMA JANELA, TRÊS PERGUNTAS ────────────────────────────────────────────
 *
 * Um estado só, com o título, o aviso e o que fazer lá dentro. Três estados
 * seriam três folhas a poderem abrir ao mesmo tempo; é o mesmo desenho que o
 * `Inventario` já usa.
 *
 * ── O QUE FICA POR CONVERTER, E PORQUÊ ────────────────────────────────────
 *
 * O `confirm()` do `EmailTemplatesBilingue` — «voltar a esta versão?» — fica.
 * Aquele gesto NÃO perde nada: a própria frase diz que o texto que está a sair
 * fica guardado no histórico e que se pode desfazer. Um botão vermelho ali
 * seria um aviso onde não há perigo nenhum.
 *
 * É o segundo caso do mesmo tipo — o primeiro é o «marcar a proposta como
 * aceite» — e os dois esperam pela mesma decisão: uma variante calma desta
 * janela, ou outra janela.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/EmailTemplates.tsx", "utf8");

/** Comentários fora: as palavras que se procuram vivem nos comentários. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

describe("as perguntas do editor clássico de modelos", () => {
  it("nenhuma delas abre a caixa do browser", () => {
    const codigo = semComentarios(FONTE);
    const soltos = codigo
      .split("\n")
      .map((l, i) => ({ l, n: i + 1 }))
      .filter(({ l }) => /\bwindow\.confirm\(|(?<![\w.])confirm\(/.test(l));
    expect(
      soltos.map(({ n, l }) => `${n}: ${l.trim()}`),
      "voltou uma caixa do browser ao editor de modelos",
    ).toEqual([]);
  });

  it("as três perguntas estão montadas, cada uma com o seu verbo no botão", () => {
    const codigo = semComentarios(FONTE);
    expect(codigo, "a janela da casa desapareceu do editor").toContain("<PerguntaDestrutiva");
    for (const rotulo of ["Mudar de modelo", "Descartar", "Voltar ao visual"]) {
      expect(codigo, `a pergunta de «${rotulo}» perdeu-se`).toContain(`rotulo: "${rotulo}"`);
    }
  });

  it("é UMA janela para as três, e não três", () => {
    // Três estados seriam três folhas a poderem abrir ao mesmo tempo.
    const codigo = semComentarios(FONTE);
    expect(codigo.split("<PerguntaDestrutiva").length - 1, "há mais janelas do que uma").toBe(1);
    expect(codigo, "o estado partilhado das perguntas desapareceu").toContain("fazer: () => void");
  });

  it("mudar de modelo só pergunta quando o rascunho não pôde ser guardado", () => {
    // A pergunta custa um toque. Perguntar sempre que se troca de modelo seria
    // cobrá-lo em todas as trocas — e na esmagadora maioria não há nada a
    // perder, porque o rascunho ficou guardado neste aparelho.
    const codigo = semComentarios(FONTE);
    const i = codigo.indexOf("function trocarDeModelo(");
    expect(i, "o `trocarDeModelo` desapareceu").toBeGreaterThan(-1);
    const corpo = codigo.slice(i, codigo.indexOf("\n  }", i));
    expect(corpo, "a condição que faz a pergunta valer a pena perdeu-se").toContain(
      "dirty && rascunhoFalhou.current",
    );
    // E o rascunho continua a ser guardado ANTES de tudo: o travão de 800 ms
    // ainda não disparou, e era precisamente isso que se perdia.
    expect(corpo.indexOf("guardarRascunhoAgora()")).toBeLessThan(corpo.indexOf("setAPerguntar"));
  });
});
