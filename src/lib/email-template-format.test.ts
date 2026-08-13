import { describe, it, expect } from "vitest";
import {
  buildSimpleEmailHtml,
  extractSimpleText,
  isSimpleBody,
  renderPreview,
  renderPreviewSubject,
  insertToken,
  htmlToPlainText,
  EXAMPLE_VARS,
} from "./email-template-format";
import { renderTemplate, DEFAULT_TEMPLATES } from "./email-templates-store";

describe("renderPreview", () => {
  it("mirrors renderTemplate: replaces every {key}, escapes values, blanks unknowns", () => {
    const src = "Olá {nome}, valor {valor}. {desconhecido}";
    // Same output the send path produces for the same vars.
    const viaServer = renderTemplate(
      { key: "", name: "", subject: "", body: src, updatedAt: "" },
      EXAMPLE_VARS,
    ).body;
    expect(renderPreview(src)).toBe(viaServer);
    expect(renderPreview(src)).toBe("Olá Maria Silva, valor 14.500 €. ");
  });

  it("HTML-escapes merge values so data cannot inject markup", () => {
    expect(renderPreview("{nome}", { nome: '<b>x</b>"&' })).toBe("&lt;b&gt;x&lt;/b&gt;&quot;&amp;");
  });
});

/**
 * A PRÉ-VISUALIZAÇÃO DO ASSUNTO TEM DE MENTIR TÃO POUCO COMO A DO CORPO.
 *
 * O assunto é um cabeçalho, não HTML: o caminho de envio não o escapa (ver
 * `renderTemplate`). Se a pré-visualização o escapasse, quem escreve o modelo
 * via «Marta &amp; João» no ecrã e mudava o modelo para corrigir uma coisa que
 * o cliente nunca chegaria a ver — e o contrário é igualmente mau. Os dois
 * andam sempre juntos.
 */
describe("renderPreviewSubject", () => {
  it("mirrors the send path: no HTML escaping in the subject", () => {
    const src = "Proposta para {nome}";
    const vars = { nome: "Marta & João" };
    const viaServer = renderTemplate(
      { key: "", name: "", subject: src, body: "", updatedAt: "" },
      vars,
    ).subject;
    expect(renderPreviewSubject(src, vars)).toBe(viaServer);
    expect(renderPreviewSubject(src, vars)).toBe("Proposta para Marta & João");
  });

  it("replaces every {key} and blanks unknowns, like the body preview", () => {
    expect(renderPreviewSubject("Olá {nome}. {desconhecido}")).toBe("Olá Maria Silva. ");
  });
});

describe("simple ⇄ html round trip", () => {
  it("recovers the exact plain text, including accents and merge tokens", () => {
    const text = 'Olá {nome},\n\nObrigado — até já.\nAbraço à equipa & pontuação "dupla".';
    const html = buildSimpleEmailHtml(text);
    expect(isSimpleBody(html)).toBe(true);
    expect(extractSimpleText(html)).toBe(text);
  });

  it("keeps {merge} tokens intact in the generated HTML for the send path", () => {
    const html = buildSimpleEmailHtml("Olá {nome}, veja {link}.");
    expect(html).toContain("{nome}");
    // {link} becomes a clickable, on-brand anchor but the token survives.
    expect(html).toContain('<a href="{link}"');
    // Send-path substitution still works end-to-end.
    const sent = renderTemplate(
      { key: "", name: "", subject: "", body: html, updatedAt: "" },
      EXAMPLE_VARS,
    ).body;
    expect(sent).toContain("Maria Silva");
    expect(sent).toContain('href="https://liquenevents.pt/proposta/exemplo"');
    expect(sent).not.toContain("{link}");
  });

  it("escapes user-typed HTML in simple mode", () => {
    const html = buildSimpleEmailHtml("1 < 2 & 3 > 0");
    expect(html).toContain("1 &lt; 2 &amp; 3 &gt; 0");
  });

  it("splits paragraphs on blank lines and single newlines become <br>", () => {
    const html = buildSimpleEmailHtml("linha 1\nlinha 2\n\nsegundo paragrafo");
    expect((html.match(/font-size:14px/g) ?? []).length).toBe(2);
    expect(html).toContain("linha 1<br>linha 2");
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * O MODELO NÃO SE DESPEDE — QUEM FECHA O EMAIL É A ASSINATURA DA CASA
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Isto escrevia um risco e «Líquen Events · Portugal» no fim de todo o corpo
   * que construía. Fazia sentido enquanto o corpo era o email inteiro; deixou
   * de fazer no dia em que a assinatura da casa (`email-assinatura.ts`) passou
   * a entrar em TODO o correio que sai para um cliente — e agora que os
   * modelos são mesmo enviados, o cliente receberia:
   *
   *     Líquen Events · Portugal      ← rodapé do modelo
   *     --
   *     Catarina Gaspar               ← assinatura da casa
   *     Manager
   *
   * Dois fechos colados. É o mesmo defeito que se corrigiu nos modelos de
   * resposta rápida do mensageiro, e a mesma regra: quem escreve o corpo
   * escreve só o que aquele email tem de particular.
   *
   * Os corpos JÁ GUARDADOS por ela têm o rodapé lá dentro e não se lhes pode
   * mexer — desses trata o `desmoldurar` no envio. Isto é a outra metade:
   * impedir que um modelo NOVO volte a nascer com ele.
   */
  it("não escreve rodapé nenhum — a assinatura da casa é o único fecho", () => {
    const html = buildSimpleEmailHtml("Olá {nome},\n\nObrigado.");
    expect(html).not.toContain("Líquen Events");
    expect(html).not.toMatch(/<hr\b/i);
  });
});

describe("advanced templates are detected as NOT simple", () => {
  it("every hand-written default opens in advanced mode", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(isSimpleBody(t.body)).toBe(false);
      expect(extractSimpleText(t.body)).toBeNull();
    }
  });
});

describe("insertToken", () => {
  it("splices a token over the selection and reports the caret", () => {
    expect(insertToken("Olá , tudo bem", 4, 4, "{nome}")).toEqual({
      text: "Olá {nome}, tudo bem",
      caret: 10,
    });
  });

  it("replaces a selection and clamps out-of-range indices", () => {
    expect(insertToken("abc", 1, 2, "X")).toEqual({ text: "aXc", caret: 2 });
    expect(insertToken("abc", 99, 99, "Z")).toEqual({ text: "abcZ", caret: 4 });
  });
});

describe("htmlToPlainText", () => {
  it("strips tags and the marker for the advanced→simple conversion", () => {
    const text = htmlToPlainText("<!-- liquen:simple:v1:AA== --><p>Olá {nome}</p><p>Fim</p>");
    expect(text).toBe("Olá {nome}\n\nFim");
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * «Jo&#227;o» NÃO É UM NOME
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Isto deixou de ser só a conversão avançado→simples no dia em que passou a
   * ser também a origem da VERSÃO EM TEXTO SIMPLES de todo o email que sai de
   * um modelo (ver `email-modelos.ts`). Os editores de texto rico escrevem os
   * acentos como referências numéricas, e um `&#227;` que sobrevivesse era o
   * nome de um cliente mal escrito na metade do email que os filtros de spam
   * leem e que um leitor de ecrã anuncia.
   *
   * Decimais e hexadecimais, porque os dois aparecem consoante o editor. E
   * ANTES do `&amp;`, pela mesma razão que já lá estava escrita: um
   * `&amp;#227;` é o texto literal «&#227;» e tem de continuar a sê-lo.
   */
  it("descodifica os acentos escritos como referência numérica", () => {
    expect(htmlToPlainText("<p>Jo&#227;o &#38; Ana</p>")).toBe("João & Ana");
    expect(htmlToPlainText("<p>par&#xE1;grafo</p>")).toBe("parágrafo");
  });

  it("um `&amp;#227;` continua a ser o texto «&#227;», e não um «ã»", () => {
    expect(htmlToPlainText("<p>&amp;#227;</p>")).toBe("&#227;");
  });
});
