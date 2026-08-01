import { describe, it, expect } from "vitest";
import { statSync } from "node:fs";
import { join } from "node:path";
import {
  VARIANTES,
  todosOsCaminhos,
  resolverVariante,
  conteudoVariante,
  ganchoNoIdioma,
  fotosDaVariante,
  poloDaVariante,
} from "./variantes";
import { heroKey } from "@/lib/hero-image-loader";
import { POLOS } from "@/lib/ads/polos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CATÁLOGO DAS VARIANTES SOCIAIS TEM DE ESTAR COMPLETO E COERENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas páginas são o destino de dinheiro gasto em anúncios. Uma entrada
 * incompleta não parte nada de forma visível — a página desenha-se à mesma —,
 * limita-se a converter pior, e isso descobre-se ao fim de um mês a olhar para
 * um custo por resultado mau sem se perceber porquê. Daí a rede.
 */

const LIMITE_CAPA_KB = 100;
const LARGURA = 1536;

describe("catálogo das variantes sociais", () => {
  it("não passa por vacuidade", () => {
    expect(VARIANTES.length).toBeGreaterThanOrEqual(4);
    expect(todosOsCaminhos().length).toBe(VARIANTES.length * 2);
  });

  it("os slugs são únicos e não colidem com o sufixo do gancho B", () => {
    // A armadilha concreta: uma variante chamada "algarve" e outra chamada
    // "algarve-b" fariam `/s/algarve-b` resolver para duas coisas diferentes,
    // e a que ganhava dependia da ordem do array.
    const todos = todosOsCaminhos().map((c) => c.slug);
    expect(new Set(todos).size, `slugs repetidos: ${todos.join(", ")}`).toBe(todos.length);
  });

  it.each(VARIANTES)("$slug tem os dois ganchos, e são diferentes", (v) => {
    for (const locale of ["pt", "en"] as const) {
      const c = conteudoVariante(v, locale);
      expect(c.ganchos.map((g) => g.id).sort()).toEqual(["a", "b"]);
      const a = ganchoNoIdioma(v, "a", locale);
      const b = ganchoNoIdioma(v, "b", locale);
      expect(
        a.titulo,
        `${v.slug} (${locale}): os dois ganchos são iguais. Um teste A/B com o ` +
          "mesmo gancho dos dois lados não mede nada.",
      ).not.toBe(b.titulo);
      expect(a.titulo.length).toBeGreaterThan(15);
      // O primeiro ecrã é uma frase, não um parágrafo. Acima disto parte-se em
      // quatro linhas num ecrã de 390 px e deixa de se ler em três segundos.
      expect(a.titulo.length, `${v.slug} (${locale}) gancho A é longo demais`).toBeLessThanOrEqual(
        95,
      );
      expect(b.titulo.length, `${v.slug} (${locale}) gancho B é longo demais`).toBeLessThanOrEqual(
        95,
      );
    }
  });

  it.each(VARIANTES)("$slug: a capa cabe no orçamento de bytes", (v) => {
    // Mesmo limite e mesma razão dos heróis das páginas do Google (ver
    // polos-peso.test.ts): a capa é o candidato a LCP de uma página paga, e
    // cada 50 KB a mais valem cerca de um segundo de espera no telemóvel.
    const ficheiro = join(process.cwd(), "public", "_img", `${heroKey(v.capa)}-${LARGURA}.webp`);
    let bytes: number;
    try {
      bytes = statSync(ficheiro).size;
    } catch {
      throw new Error(
        `${ficheiro} não existe. A capa de "${v.slug}" tem de estar em HERO_SOURCES ` +
          "(scripts/pregen-heroes.mjs e src/lib/hero-image-loader.ts). Corre `npm run pregen`.",
      );
    }
    const kb = Math.round(bytes / 1024);
    expect(kb, `a capa de "${v.slug}" pesa ${kb} KB a ${LARGURA} px`).toBeLessThanOrEqual(
      LIMITE_CAPA_KB,
    );
  });

  it.each(VARIANTES)("$slug aponta para um polo que existe", (v) => {
    if (!v.polo) return; // a variante nacional não tem polo, e é legítimo
    expect(
      poloDaVariante(v),
      `"${v.slug}" refere o polo "${v.polo}", que não está em polos.ts`,
    ).toBeTruthy();
  });

  it.each(VARIANTES)("$slug tem fotografias de apoio", (v) => {
    const fotos = fotosDaVariante(v);
    expect(fotos.length).toBeGreaterThanOrEqual(4);
    expect(new Set(fotos).size, `fotografias repetidas em "${v.slug}"`).toBe(fotos.length);
  });

  it("resolverVariante devolve o gancho certo, e null para o que não existe", () => {
    const primeira = VARIANTES[0];
    expect(resolverVariante(primeira.slug)?.gancho.id).toBe("a");
    expect(resolverVariante(`${primeira.slug}-b`)?.gancho.id).toBe("b");
    // Um erro de dedo no URL de um anúncio TEM de dar 404 e ser visível, e não
    // abrir uma página com o gancho errado que ninguém nota durante um mês.
    expect(resolverVariante(`${primeira.slug}-c`)).toBeNull();
    expect(resolverVariante("nao-existe")).toBeNull();
    expect(resolverVariante("")).toBeNull();
  });

  it("nenhum texto tem travessões nem caracteres fora do alfabeto latino", () => {
    // Duas redes com origens diferentes, no mesmo sítio porque o custo é o
    // mesmo. O travessão é regra do projecto no texto visível. Os caracteres
    // não-latinos são o defeito que já aconteceu neste repositório: um "е"
    // cirílico dentro de uma palavra portuguesa, invisível a olho, que passa
    // por revisão e vai parar a um anúncio.
    const problemas: string[] = [];
    for (const v of VARIANTES) {
      for (const locale of ["pt", "en"] as const) {
        const c = conteudoVariante(v, locale);
        const textos = [
          c.metaTitle,
          c.metaDescription,
          c.prova,
          c.ctaWhatsApp,
          c.mensagemWhatsApp,
          ...c.oQueFazemos,
          ...c.ganchos.flatMap((g) => [g.titulo, g.apoio]),
        ];
        for (const t of textos) {
          if (/[—–]/.test(t)) problemas.push(`${v.slug}/${locale}: travessão em "${t}"`);
          for (const ch of t) {
            const cp = ch.codePointAt(0)!;
            if ((cp >= 0x0370 && cp <= 0x03ff) || (cp >= 0x0400 && cp <= 0x04ff)) {
              problemas.push(
                `${v.slug}/${locale}: carácter grego ou cirílico U+${cp.toString(16)} em "${t}"`,
              );
            }
          }
        }
      }
    }
    expect(problemas, problemas.join("\n")).toEqual([]);
  });

  it("as variantes cobrem os polos onde o dinheiro rende mais", () => {
    // Não são treze variantes, e isso é uma decisão argumentada (ver o
    // cabeçalho de variantes.ts). O que este teste impede é a decisão mudar
    // por acidente: se alguém apagar a variante do Alentejo ou a de Lisboa,
    // que são os dois polos de maior peso, tem de ser de propósito.
    const doisMaiores = [...POLOS].sort((a, b) => b.peso - a.peso).slice(0, 2);
    const cobertos = new Set(VARIANTES.map((v) => v.polo));
    for (const p of doisMaiores) {
      expect(cobertos.has(p.slug), `o polo "${p.slug}" (peso ${p.peso}) não tem variante`).toBe(
        true,
      );
    }
  });

  it("a variante internacional só é servida em inglês", () => {
    const internacional = VARIANTES.find((v) => !v.polo);
    expect(internacional, "não há variante nacional/internacional").toBeTruthy();
    expect(internacional!.soEm).toBe("en");
  });
});
