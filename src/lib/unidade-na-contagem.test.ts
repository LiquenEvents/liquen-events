import { describe, expect, it } from "vitest";
import { quantidadeComUnidade, unidadeNaContagem } from "./unidade-na-contagem";

describe("unidadeNaContagem", () => {
  it.each([
    [0, "saco", "sacos"],
    [1, "saco", "saco"],
    [3, "unidade", "unidades"],
    [2, "rolo", "rolos"],
    [4, "flor", "flores"],
    [2, "item", "itens"],
    [5, "cordão", "cordões"],
    [2, "par", "pares"],
    [2, "pedestal", "pedestais"],
  ])("%i %s → %s", (n, u, esperado) => {
    expect(unidadeNaContagem(n, u)).toBe(esperado);
  });

  it("não mexe nas abreviaturas nem no que já está no plural", () => {
    expect(unidadeNaContagem(3, "un.")).toBe("un.");
    expect(unidadeNaContagem(2, "kg")).toBe("kg");
    expect(unidadeNaContagem(2, "m")).toBe("m");
    expect(unidadeNaContagem(2, "metros")).toBe("metros");
  });

  it("sem unidade, nada", () => {
    expect(unidadeNaContagem(2, "")).toBe("");
    expect(unidadeNaContagem(2, undefined)).toBe("");
  });
});

describe("quantidadeComUnidade", () => {
  it("junta com um espaço, e só quando há unidade", () => {
    expect(quantidadeComUnidade(0, "saco")).toBe("0 sacos");
    expect(quantidadeComUnidade(7, null)).toBe("7");
  });
});
