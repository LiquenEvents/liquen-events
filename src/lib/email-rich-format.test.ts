// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import {
  buildRichEmailHtml,
  extractRichDoc,
  isRichBody,
  normalizeDoc,
  renderRichInnerHtml,
  readDocFromEditor,
  docFromPlainText,
  emptyRichDoc,
  safeHref,
  type RichDoc,
} from "./email-rich-format";
import { renderPreview, buildSimpleEmailHtml, EXAMPLE_VARS } from "./email-template-format";
import { renderTemplate, DEFAULT_TEMPLATES } from "./email-templates-store";

/** Build a document body-only DOM element from an HTML string (for the reader). */
function elFrom(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div;
}

describe("serializer — injection safety", () => {
  it("escapes text, angle brackets and quotes; never emits raw user markup", () => {
    const doc: RichDoc = {
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: `<script>alert("x")</script> 1 < 2 & 3` }] }],
    };
    const html = buildRichEmailHtml(doc);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; 1 &lt; 2 &amp; 3");
  });

  it("drops colours outside the brand palette", () => {
    const html = renderRichInnerHtml({
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: "hi", color: "#ff0000" }] }],
    });
    expect(html).not.toContain("#ff0000");
    expect(html).toBe(
      `<p style="font-size:14px;line-height:1.6;margin:0 0 16px;color:#2a2620">hi</p>`,
    );
  });

  it("keeps a brand colour", () => {
    const html = renderRichInnerHtml({
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: "hi", color: "#4d6350" }] }],
    });
    expect(html).toContain(`<span style="color:#4d6350">hi</span>`);
  });

  it("rejects unsafe hrefs (javascript:, data:) but keeps http/mailto/tokens", () => {
    expect(safeHref("javascript:alert(1)")).toBeUndefined();
    expect(safeHref("data:text/html,<script>")).toBeUndefined();
    expect(safeHref("https://liquenevents.pt")).toBe("https://liquenevents.pt");
    expect(safeHref("mailto:ola@liquenevents.pt")).toBe("mailto:ola@liquenevents.pt");
    expect(safeHref("{link}")).toBe("{link}");
    // A run with an unsafe href emits its text but no anchor.
    const html = renderRichInnerHtml({
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: "clique", href: "javascript:alert(1)" }] }],
    });
    expect(html).not.toContain("<a");
    expect(html).toContain("clique");
  });

  it("emits nested marks in a stable inside-out order", () => {
    const html = renderRichInnerHtml({
      version: 1,
      blocks: [
        {
          type: "paragraph",
          runs: [{ text: "x", bold: true, italic: true, underline: true, href: "https://a.pt" }],
        },
      ],
    });
    expect(html).toContain(
      `<a href="https://a.pt" style="color:#4d6350"><strong><em><span style="text-decoration:underline">x</span></em></strong></a>`,
    );
  });
});

describe("merge tokens survive into the output", () => {
  it("keeps {token} braces verbatim in text and links, and send path resolves them", () => {
    const doc: RichDoc = {
      version: 1,
      blocks: [
        { type: "paragraph", runs: [{ text: "Olá {nome}," }] },
        { type: "button", href: "{link}", label: "Ver proposta" },
      ],
    };
    const body = buildRichEmailHtml(doc);
    expect(body).toContain("{nome}");
    expect(body).toContain(`href="{link}"`);

    const sent = renderTemplate(
      { key: "", name: "", subject: "", body, updatedAt: "" },
      EXAMPLE_VARS,
    ).body;
    expect(sent).toContain("Maria Silva");
    expect(sent).toContain(`href="https://liquenevents.pt/proposta/exemplo"`);
    expect(sent).not.toContain("{link}");
  });

  it("preview mirrors the send path for a rich body", () => {
    const body = buildRichEmailHtml({
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: "Olá {nome}" }] }],
    });
    const viaServer = renderTemplate(
      { key: "", name: "", subject: "", body, updatedAt: "" },
      EXAMPLE_VARS,
    ).body;
    expect(renderPreview(body)).toBe(viaServer);
    expect(renderPreview(body)).toContain("Olá Maria Silva");
  });
});

describe("marker round-trip", () => {
  it("build → extract recovers the same normalized model", () => {
    const doc: RichDoc = {
      version: 1,
      blocks: [
        { type: "heading", align: "center", runs: [{ text: "Título", bold: true }] },
        { type: "subheading", runs: [{ text: "Sub" }] },
        { type: "paragraph", runs: [{ text: "corpo com ", color: "#4d6350" }, { text: "{nome}" }] },
        { type: "bullets", items: [[{ text: "um" }], [{ text: "dois" }]] },
        { type: "numbers", items: [[{ text: "a" }]] },
        { type: "button", href: "{link}", label: "Abrir" },
        { type: "divider" },
      ],
    };
    const body = buildRichEmailHtml(doc);
    expect(isRichBody(body)).toBe(true);
    expect(extractRichDoc(body)).toEqual(normalizeDoc(doc));
  });

  it("is deterministic: rebuilding an extracted doc yields identical bytes (not falsely dirty)", () => {
    const body = buildRichEmailHtml({
      version: 1,
      blocks: [{ type: "paragraph", runs: [{ text: "Olá {nome}" }] }],
    });
    const reopened = extractRichDoc(body)!;
    expect(buildRichEmailHtml(reopened)).toBe(body);
  });

  it("a tampered marker cannot smuggle bad colours/hrefs/shapes into the model", () => {
    const evil = {
      version: 1,
      blocks: [
        { type: "paragraph", runs: [{ text: "x", color: "#ff0000", href: "javascript:alert(1)" }] },
        { type: "bogus", runs: [{ text: "y" }] },
      ],
    };
    const b64 = Buffer.from(JSON.stringify(evil), "utf8").toString("base64");
    const body = `<!-- liquen:rich:v1:${b64} -->\n<div></div>`;
    const doc = extractRichDoc(body)!;
    expect(doc.blocks).toHaveLength(1);
    expect(doc.blocks[0]).toEqual({ type: "paragraph", runs: [{ text: "x" }] });
  });
});

describe("back-compat with existing templates", () => {
  it("hand-written HTML defaults are not detected as rich", () => {
    for (const t of DEFAULT_TEMPLATES) {
      expect(isRichBody(t.body)).toBe(false);
      expect(extractRichDoc(t.body)).toBeNull();
    }
  });

  it("a modo-simples body is not detected as rich", () => {
    const simple = buildSimpleEmailHtml("Olá {nome},\n\nObrigado.");
    expect(isRichBody(simple)).toBe(false);
    expect(extractRichDoc(simple)).toBeNull();
  });

  it("docFromPlainText opens simple text as paragraphs, preserving tokens", () => {
    const doc = docFromPlainText("Olá {nome},\nlinha 2\n\nsegundo");
    expect(doc.blocks).toEqual([
      { type: "paragraph", runs: [{ text: "Olá {nome},\nlinha 2" }] },
      { type: "paragraph", runs: [{ text: "segundo" }] },
    ]);
  });
});

describe("DOM reader — the contentEditable → model boundary", () => {
  it("reads headings, paragraphs, marks, colours, links and alignment", () => {
    const el = elFrom(
      `<h2 style="text-align:center">Olá</h2>` +
        `<p>texto <strong>forte</strong> <em>itálico</em> <a href="https://a.pt">liga</a></p>` +
        `<p><span style="color: rgb(77, 99, 80)">verde</span></p>`,
    );
    const doc = readDocFromEditor(el);
    expect(doc.blocks[0]).toEqual({ type: "heading", align: "center", runs: [{ text: "Olá" }] });
    expect(doc.blocks[1]).toEqual({
      type: "paragraph",
      runs: [
        { text: "texto " },
        { text: "forte", bold: true },
        { text: " " },
        { text: "itálico", italic: true },
        { text: " " },
        { text: "liga", href: "https://a.pt" },
      ],
    });
    expect(doc.blocks[2]).toEqual({
      type: "paragraph",
      runs: [{ text: "verde", color: "#4d6350" }],
    });
  });

  it("reads lists, dividers and a CTA button island; strips unsafe/unknown markup", () => {
    const el = elFrom(
      `<ul><li>um</li><li>dois</li></ul>` +
        `<hr>` +
        `<div data-liquen="button" style="text-align:center"><a href="{link}" contenteditable="false">Ver</a></div>` +
        `<p><a href="javascript:alert(1)">mau</a></p>` +
        `<script>alert(1)</script>`,
    );
    const doc = readDocFromEditor(el);
    expect(doc.blocks[0]).toEqual({
      type: "bullets",
      items: [[{ text: "um" }], [{ text: "dois" }]],
    });
    expect(doc.blocks[1]).toEqual({ type: "divider" });
    expect(doc.blocks[2]).toEqual({
      type: "button",
      href: "{link}",
      label: "Ver",
      align: "center",
    });
    // The javascript: link is stripped to plain text (no href kept).
    expect(doc.blocks[3]).toEqual({ type: "paragraph", runs: [{ text: "mau" }] });
    // Rebuilt HTML from a reader model carries no <script> and no javascript:.
    const rebuilt = buildRichEmailHtml(doc);
    expect(rebuilt).not.toContain("<script");
    expect(rebuilt).not.toContain("javascript:");
  });

  it("round-trips editor HTML → model → editor HTML stably", () => {
    const doc: RichDoc = {
      version: 1,
      blocks: [
        { type: "heading", runs: [{ text: "T" }] },
        { type: "paragraph", runs: [{ text: "linha 1\nlinha 2" }] },
        { type: "bullets", items: [[{ text: "x" }]] },
      ],
    };
    const editorHtml = renderRichInnerHtml(doc, { editable: true });
    const reread = readDocFromEditor(elFrom(editorHtml));
    expect(reread).toEqual(normalizeDoc(doc));
  });

  it("soft breaks (<br>) become \\n and back to <br>", () => {
    const doc = readDocFromEditor(elFrom(`<p>a<br>b</p>`));
    expect(doc.blocks[0]).toEqual({ type: "paragraph", runs: [{ text: "a\nb" }] });
    expect(renderRichInnerHtml(doc)).toContain("a<br>b");
  });

  it("never collapses to nothing (empty editor → one empty paragraph)", () => {
    expect(readDocFromEditor(elFrom(""))).toEqual(emptyRichDoc());
  });
});
