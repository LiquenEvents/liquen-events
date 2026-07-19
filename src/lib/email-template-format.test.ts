import { describe, it, expect } from "vitest";
import {
  buildSimpleEmailHtml,
  extractSimpleText,
  isSimpleBody,
  renderPreview,
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
      { key: "", name: "", subject: src, body: "", updatedAt: "" },
      EXAMPLE_VARS,
    ).subject;
    expect(renderPreview(src)).toBe(viaServer);
    expect(renderPreview(src)).toBe("Olá Maria Silva, valor 14.500 €. ");
  });

  it("HTML-escapes merge values so data cannot inject markup", () => {
    expect(renderPreview("{nome}", { nome: '<b>x</b>"&' })).toBe("&lt;b&gt;x&lt;/b&gt;&quot;&amp;");
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
    // Two content paragraphs (font-size:14px); the footer uses font-size:12px.
    expect((html.match(/font-size:14px/g) ?? []).length).toBe(2);
    expect(html).toContain("linha 1<br>linha 2");
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
});
