import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pedido dela: o texto das páginas de serviços «em formato quadrado em vez de
 * estar descentralizado» — justificado. Só o texto corrido: a introdução de
 * cada serviço, as respostas das perguntas frequentes e o texto do bloco de
 * SEO da lista. Os rótulos, os títulos, as legendas curtas sobre as
 * fotografias e o fecho centrado ficam como estavam.
 */
const dir = join(process.cwd(), "src/app/[lang]/(site)/servicos");
const lista = readFileSync(join(dir, "page.tsx"), "utf8");
const servico = readFileSync(join(dir, "[slug]/page.tsx"), "utf8");

describe("páginas de serviços — texto corrido justificado", () => {
  it("a introdução de cada serviço", () => {
    expect(servico).toMatch(/className="[^"]*text-\[16px\][^"]*text-justify[^"]*">\s*\{\/\*/);
  });

  it("as respostas das perguntas frequentes", () => {
    expect(servico).toMatch(/<p className="[^"]*text-justify[^"]*">\{f\.a\}<\/p>/);
  });

  it("o texto do bloco de SEO da lista", () => {
    expect(lista).toMatch(/<p className="[^"]*text-justify[^"]*">\s*\{ts\.seoText\}/);
  });

  it("o fecho centrado continua centrado", () => {
    expect(lista).toMatch(/<p className="(?![^"]*text-justify)[^"]*">\{ts\.ctaText\}<\/p>/);
  });
});
