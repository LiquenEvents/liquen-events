import { describe, it, expect } from "vitest";
import { renderTemplate, type EmailTemplate } from "./email-templates-store";

// renderTemplate is the send-path merge: it resolves `{key}` in subject+body
// against caller-supplied vars. These lock the security-relevant contract —
// values are HTML-escaped, unknown placeholders blank out, and merge data can
// never itself trigger further substitution or leave a broken placeholder.
function tpl(subject: string, body: string): EmailTemplate {
  return { key: "k", name: "n", subject, body, updatedAt: "" };
}

describe("renderTemplate — send-path merge", () => {
  it("HTML-escapes merge values in the body so data cannot inject markup", () => {
    const out = renderTemplate(tpl("", `<p>{nome}</p>`), {
      nome: `<script>alert(1)</script>"&`,
    });
    expect(out.body).toBe(`<p>&lt;script&gt;alert(1)&lt;/script&gt;&quot;&amp;</p>`);
    expect(out.body).not.toContain("<script>");
  });

  it("blanks unknown placeholders rather than leaving them literal", () => {
    const out = renderTemplate(tpl("", `Olá {nome}, {desconhecido}!`), { nome: "Ana" });
    expect(out.body).toBe("Olá Ana, !");
    expect(out.body).not.toContain("{desconhecido}");
  });

  it("treats a missing (undefined) var as empty, not the string 'undefined'", () => {
    // `nome` is a declared key but the caller passed no value for it.
    const out = renderTemplate(tpl("", `[{nome}]`), { nome: undefined as unknown as string });
    expect(out.body).toBe("[]");
  });

  it("does not re-expand placeholders that appear inside a merged value", () => {
    // A value that itself looks like `{link}` must survive verbatim (escaped),
    // never be substituted again — single-pass replacement, no recursion.
    const out = renderTemplate(tpl("", `{nome}`), { nome: "{link}", link: "https://evil" });
    expect(out.body).toBe("{link}");
    expect(out.body).not.toContain("https://evil");
  });

  it("resolves placeholders in the subject as well as the body", () => {
    const out = renderTemplate(tpl("Olá {nome}", "corpo {nome}"), { nome: "Rui" });
    expect(out.subject).toBe("Olá Rui");
    expect(out.body).toBe("corpo Rui");
  });

  it("leaves a brace-free template untouched", () => {
    const out = renderTemplate(tpl("Assunto fixo", "Corpo sem merges"), {});
    expect(out).toEqual({ subject: "Assunto fixo", body: "Corpo sem merges" });
  });
});
