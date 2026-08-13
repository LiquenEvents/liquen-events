import { describe, expect, it } from "vitest";
import { LQIP_LIMITE_CARACTERES, lqipAceitavel, lqipsDoLote } from "./lqip";

/**
 * O que este ficheiro guarda não é o caso normal — é o caso em que o pedido
 * NÃO veio do nosso gerador.
 *
 * O LQIP é um `data:` URI que vem do cliente, é gravado na base de dados e
 * depois servido inline num `src`. As três coisas juntas é que fazem disto uma
 * superfície a sério.
 */

const webp = (n = 40) => `data:image/webp;base64,${"A".repeat(n)}`;

describe("LQIP — o guarda à entrada", () => {
  it("aceita o que o gerador produz", () => {
    expect(lqipAceitavel(webp())).toBe(true);
    expect(lqipAceitavel(`data:image/jpeg;base64,${"B".repeat(60)}==`)).toBe(true);
  });

  /**
   * O caso que motiva a lista de permitidos. Um SVG não é uma fotografia
   * reduzida: é um documento com capacidade de execução, e a CSP do site
   * permite `data:` em `img-src` de propósito, para os placeholders.
   */
  it("recusa SVG, HTML e tudo o que não seja uma fotografia", () => {
    expect(lqipAceitavel("data:image/svg+xml;base64,PHN2Zz48c2NyaXB0Pg==")).toBe(false);
    expect(lqipAceitavel("data:text/html;base64,PGgxPm9sw6E8L2gxPg==")).toBe(false);
    expect(lqipAceitavel("data:image/png;base64,iVBORw0KGgo=")).toBe(false);
    expect(lqipAceitavel("javascript:alert(1)")).toBe(false);
    expect(lqipAceitavel("https://exemplo.pt/foto.webp")).toBe(false);
  });

  it("recusa base64 malformado, em vez de o gravar e servir", () => {
    expect(lqipAceitavel("data:image/webp;base64,")).toBe(false);
    expect(lqipAceitavel('data:image/webp;base64,AAA"><img onerror=x')).toBe(false);
    expect(lqipAceitavel("data:image/webp;base64,AA=AA")).toBe(false);
  });

  /**
   * Sem tecto, um cliente adulterado gravava 8 KB por foto e cada resposta da
   * biblioteca — servida a CADA abertura — passava a levar um megabyte de
   * placeholders. Não é exótico: acontece sozinho se alguém mudar a qualidade
   * do encode e ninguém reparar.
   */
  it("recusa o que é grande de mais para viajar inline", () => {
    expect(lqipAceitavel(webp(LQIP_LIMITE_CARACTERES))).toBe(false);
    expect(lqipAceitavel(webp(LQIP_LIMITE_CARACTERES - 100))).toBe(true);
  });

  it("é total — qualquer entrada tem resposta", () => {
    for (const x of [undefined, null, 0, {}, [], true, NaN]) expect(lqipAceitavel(x)).toBe(false);
  });

  describe("o lote", () => {
    const aceites = ["terracotta/a.jpg", "terracotta/b.jpg"];

    it("guarda só os caminhos que a confirmação aceitou", () => {
      const m = lqipsDoLote(
        {
          "terracotta/a.jpg": webp(),
          // Nunca fez parte deste carregamento — e podia nem ser deste tema.
          "outro-tema/x.jpg": webp(),
        },
        aceites,
      );
      expect([...m.keys()]).toEqual(["terracotta/a.jpg"]);
    });

    it("deixa cair o placeholder mau sem deixar cair o bom ao lado", () => {
      const m = lqipsDoLote(
        { "terracotta/a.jpg": "data:image/svg+xml;base64,PHN2Zz4=", "terracotta/b.jpg": webp() },
        aceites,
      );
      // A foto boa é gravada; a outra fica sem placeholder, que é o estado de
      // antes desta funcionalidade — nunca um carregamento perdido.
      expect([...m.keys()]).toEqual(["terracotta/b.jpg"]);
    });

    it("não rebenta com um corpo que não é um objecto", () => {
      for (const x of [null, undefined, "texto", 42, [webp()]]) {
        expect(lqipsDoLote(x, aceites).size).toBe(0);
      }
    });
  });
});
