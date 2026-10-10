import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pedido dela: o texto das páginas de serviços «em formato quadrado em vez de
 * estar descentralizado» — justificado. Só o texto corrido: a introdução de
 * cada serviço, as respostas das perguntas frequentes e o texto do bloco de
 * SEO da lista. Os rótulos, os títulos, as legendas curtas sobre as
 * fotografias e o fecho centrado ficam como estavam.
 *
 * E no telemóvel, com as palavras partidas por hífen: numa coluna de 390 px
 * cabem umas cinco palavras por linha, e sem partir nenhuma o justificado só
 * acerta a margem esticando os espaços — ela mandou a captura do iPhone com
 * «o texto está assim, no telemóvel espaçado». O `hyphens: auto` usa a língua
 * do `<html lang>` (pt-PT ou en) para saber onde se pode partir.
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

  it("todo o texto justificado parte as palavras com hífen", () => {
    for (const ficheiro of [servico, lista]) {
      const classes = ficheiro.match(/className="[^"]*text-justify[^"]*"/g) ?? [];
      expect(classes.length).toBeGreaterThan(0);
      for (const c of classes) expect(c).toContain("hyphens-auto");
    }
  });

  it("o fecho centrado continua centrado", () => {
    expect(lista).toMatch(/<p className="(?![^"]*text-justify)[^"]*">\{ts\.ctaText\}<\/p>/);
  });
});
