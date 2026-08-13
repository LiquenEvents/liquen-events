import { describe, it, expect } from "vitest";
import { SITE, SITE_KEYWORDS, abs } from "./site";

describe("abs", () => {
  it("joins the canonical origin with a path", () => {
    expect(abs("/servicos")).toBe(`${SITE.url}/servicos`);
  });

  it("returns the bare origin when given no path", () => {
    expect(abs()).toBe(SITE.url);
  });
});

describe("SITE identity invariants", () => {
  it("uses an absolute https canonical URL with no trailing slash", () => {
    expect(SITE.url).toMatch(/^https:\/\//);
    expect(SITE.url.endsWith("/")).toBe(false);
  });

  it("keeps the founding year and contact details consistent", () => {
    expect(SITE.founded).toBe("2018");
    expect(SITE.email).toContain("@");
    expect(SITE.locale).toBe("pt_PT");
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O SITE NÃO DIZ ONDE FICA
   * ════════════════════════════════════════════════════════════════════════
   *
   * Este teste guardava o OPOSTO: exigia que `AREAS_SERVED[0]` fosse
   * "Portugal", para o site não se ler como um fornecedor de uma região só.
   * A decisão mudou — a dona quer o site sem geografia nenhuma, nem o país —
   * e um teste que continue a guardar a regra antiga é pior do que teste
   * nenhum: reprova a decisão nova e faz alguém repor a velha para o calar.
   *
   * As palavras-chave viajam em TODAS as páginas. Uma que traga um topónimo
   * volta a pôr geografia em todo o lado, sem se ver em ecrã nenhum.
   */
  it("as palavras-chave do site não nomeiam um sítio", () => {
    const TOPONIMOS =
      /\b(Portugal|Alentejo|Algarve|Lisboa|Porto|Évora|Comporta|Cascais|Sintra|Setúbal|Madeira|Açores|Douro|Minho|Ribatejo)\b/i;
    const culpadas = SITE_KEYWORDS.filter((k) => TOPONIMOS.test(k));
    expect(culpadas, `palavras-chave com geografia: ${culpadas.join(", ")}`).toEqual([]);
  });

  /**
   * A morada de registo CONTINUA a existir — é obrigatória no papel timbrado
   * dos contratos, que é um documento legal. O que não pode é voltar a sair
   * daqui para os dados estruturados, que é de onde saiu.
   */
  it("a morada de registo continua disponível para os contratos", () => {
    expect(SITE.city).toBeTruthy();
    expect(SITE.region).toBeTruthy();
  });
});
