import { describe, it, expect } from "vitest";
import { POLOS, ESTILOS, getPolo, caminhoPolo, conteudoPolo } from "./polos";
import dims from "@/lib/image-dims.json";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CATÁLOGO DE POLOS TEM DE ESTAR INTEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro é lido por três consumidores (landing pages, CSV do Ads Editor,
 * sitemap) e um erro aqui propaga-se para os três em silêncio. Os modos de
 * falha que este teste fecha são todos REAIS, não hipotéticos:
 *
 *  • Uma fotografia com caminho errado — a página desenha um buraco e o
 *    visitante que veio de um clique pago vê uma página partida.
 *  • Pesos que não somam 100 — a repartição de orçamento deixa de bater certo
 *    com o documento que a justifica, e ninguém repara porque é aritmética.
 *  • Uma fotografia em RETRATO nas faixas largas — cortada a um risco do meio.
 *    Exactamente o defeito corrigido no mosaico de /clientes.
 *  • Caracteres fora do alfabeto latino no texto. Parece rebuscado; aconteceu
 *    neste mesmo ficheiro à primeira escrita ("materiais честos"), e passa
 *    despercebido em revisão porque as letras cirílicas são parecidas.
 *  • Meta title/description fora do que a SERP mostra — texto cortado a meio.
 */

const RACIO_MINIMO = 1.2;
const mapa = dims as Record<string, number[]>;

/** Só letras latinas, pontuação e símbolos comuns. Apanha cirílico e grego. */
const FORA_DO_LATIM = /[^\p{Script=Latin}\p{Script=Common}\p{Script=Inherited}]/u;

function todasAsFotos(): { dono: string; caminho: string }[] {
  const out: { dono: string; caminho: string }[] = [];
  for (const p of POLOS) {
    out.push({ dono: `polo ${p.slug} (hero)`, caminho: p.hero });
    p.fotos.forEach((f) => out.push({ dono: `polo ${p.slug}`, caminho: f }));
  }
  for (const e of ESTILOS) {
    out.push({ dono: `estilo ${e.slug} (hero)`, caminho: e.hero });
    e.fotos.forEach((f) => out.push({ dono: `estilo ${e.slug}`, caminho: f }));
  }
  return out;
}

describe("catálogo de polos", () => {
  it("não passa por vacuidade", () => {
    expect(POLOS.length).toBeGreaterThanOrEqual(8);
    expect(ESTILOS.length).toBeGreaterThanOrEqual(3);
  });

  it("os pesos somam exactamente 100", () => {
    const soma = POLOS.reduce((s, p) => s + p.peso, 0);
    expect(soma, `os pesos somam ${soma}; a repartição em estrutura.md assume 100`).toBe(100);
  });

  it("os slugs são únicos e seguros num URL", () => {
    const slugs = POLOS.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const s of slugs) expect(s, `slug "${s}"`).toMatch(/^[a-z0-9-]+$/);
    const estilos = ESTILOS.map((e) => e.slug);
    expect(new Set(estilos).size).toBe(estilos.length);
    for (const s of estilos) expect(s, `estilo "${s}"`).toMatch(/^[a-z0-9-]+$/);
  });

  it("getPolo e caminhoPolo concordam com o catálogo", () => {
    for (const p of POLOS) {
      expect(getPolo(p.slug)).toBe(p);
      expect(caminhoPolo(p.slug)).toBe(`/casamentos/${p.slug}`);
    }
    expect(getPolo("nao-existe")).toBeUndefined();
  });

  it.each(todasAsFotos())("$dono: $caminho existe e é em paisagem", ({ caminho }) => {
    const d = mapa[caminho];
    expect(
      d,
      `${caminho} não está em image-dims.json — ou o caminho está errado, ou a ` +
        "fotografia não existe. A página desenharia um buraco a quem veio de um clique pago.",
    ).toBeTruthy();
    const racio = d[0] / d[1];
    expect(
      racio,
      `${caminho} tem ${d[0]}x${d[1]} (rácio ${racio.toFixed(2)}). As faixas desta ` +
        "página são largas: uma fotografia em retrato é cortada a um risco do meio.",
    ).toBeGreaterThanOrEqual(RACIO_MINIMO);
  });

  describe.each(POLOS)("polo $slug", (polo) => {
    it.each(["pt", "en"] as const)("tem conteúdo completo em %s", (locale) => {
      const c = conteudoPolo(polo, locale);
      expect(c.regiao.trim()).not.toBe("");
      expect(c.h1.trim()).not.toBe("");
      expect(c.eyebrow.trim()).not.toBe("");
      expect(c.prova.trim()).not.toBe("");
      expect(c.intro.length).toBeGreaterThanOrEqual(2);
      for (const p of c.intro) expect(p.trim().length).toBeGreaterThan(60);
    });

    it("o H1 nomeia a região", () => {
      // Uma landing page regional que não diz a região no H1 é uma página
      // genérica com um URL diferente — e converte como uma página genérica.
      const primeiraPalavra = polo.pt.regiao.split(/[\s,]/)[0];
      expect(polo.pt.h1).toContain(primeiraPalavra);
    });

    it.each(["pt", "en"] as const)("meta cabe na SERP em %s", (locale) => {
      const c = conteudoPolo(polo, locale);
      expect(c.metaTitle.length, `title: "${c.metaTitle}"`).toBeLessThanOrEqual(65);
      expect(c.metaDescription.length, `description: "${c.metaDescription}"`).toBeLessThanOrEqual(
        165,
      );
    });

    it("declara segmentação geográfica e cidades", () => {
      expect(polo.geo.length).toBeGreaterThanOrEqual(1);
      expect(polo.cidades.length).toBeGreaterThanOrEqual(3);
    });
  });

  it("nenhum texto tem caracteres fora do alfabeto latino", () => {
    const problemas: string[] = [];
    const ver = (dono: string, texto: string) => {
      if (FORA_DO_LATIM.test(texto)) problemas.push(`${dono}: ${texto.slice(0, 80)}`);
    };
    for (const p of POLOS) {
      for (const locale of ["pt", "en"] as const) {
        const c = conteudoPolo(p, locale);
        ver(`${p.slug}.${locale}.h1`, c.h1);
        ver(`${p.slug}.${locale}.metaTitle`, c.metaTitle);
        ver(`${p.slug}.${locale}.metaDescription`, c.metaDescription);
        ver(`${p.slug}.${locale}.prova`, c.prova);
        c.intro.forEach((t, i) => ver(`${p.slug}.${locale}.intro[${i}]`, t));
      }
    }
    for (const e of ESTILOS) {
      for (const locale of ["pt", "en"] as const) {
        const c = e[locale];
        ver(`${e.slug}.${locale}.metaDescription`, c.metaDescription);
        c.intro.forEach((t, i) => ver(`${e.slug}.${locale}.intro[${i}]`, t));
      }
    }
    expect(problemas, `texto com caracteres não latinos:\n${problemas.join("\n")}`).toEqual([]);
  });
});
