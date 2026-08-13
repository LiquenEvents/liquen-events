import { describe, it, expect } from "vitest";
import { corAceitavel, corNormalizada, coresDoLote } from "./cor";

describe("corAceitavel", () => {
  it("aceita `#rrggbb`", () => {
    expect(corAceitavel("#4d6350")).toBe(true);
    expect(corAceitavel("#4D6350")).toBe(true);
  });

  it("recusa tudo o que não seja isso", () => {
    for (const mau of [
      "#abc",
      "#4d63500",
      "4d6350",
      "rgb(77,99,80)",
      "red",
      "var(--cor)",
      // O que o guarda existe para travar: qualquer coisa que, num atributo de
      // estilo, deixasse de ser uma cor e passasse a ser uma declaração.
      "#4d6350; background: url(https://exemplo.pt/x)",
      "url(javascript:alert(1))",
      "",
      "   ",
      null,
      undefined,
      42,
      {},
      ["#4d6350"],
    ]) {
      expect(corAceitavel(mau), String(mau)).toBe(false);
    }
  });
});

describe("corNormalizada", () => {
  it("baixa a caixa para o mesmo valor não ficar guardado de duas maneiras", () => {
    expect(corNormalizada("#4D6350")).toBe("#4d6350");
  });

  it("devolve null para o que não passa", () => {
    expect(corNormalizada("azul")).toBeNull();
  });
});

describe("coresDoLote", () => {
  it("fica só pelos caminhos confirmados", () => {
    const mapa = coresDoLote({ "tema/a.jpg": "#4d6350", "outro/b.jpg": "#ffffff" }, ["tema/a.jpg"]);
    expect([...mapa]).toEqual([["tema/a.jpg", "#4d6350"]]);
  });

  it("deita fora os valores que não são cores, e fica com os que são", () => {
    const mapa = coresDoLote({ "t/a.jpg": "vermelho", "t/b.jpg": "#AABBCC" }, [
      "t/a.jpg",
      "t/b.jpg",
    ]);
    expect([...mapa]).toEqual([["t/b.jpg", "#aabbcc"]]);
  });

  it("aguenta um corpo que não é um objeto", () => {
    for (const mau of [null, undefined, "x", 3, ["#fff"]]) {
      expect(coresDoLote(mau, ["t/a.jpg"]).size).toBe(0);
    }
  });
});
