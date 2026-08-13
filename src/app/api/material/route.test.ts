import { describe, it, expect } from "vitest";
import { normNumero, normMinimo } from "./route";

/**
 * O MÍNIMO DISTINGUE "NÃO VIGIAR" DE ZERO.
 *
 * É a regra mais fácil de partir sem ninguém dar por isso, e a que desliga a
 * reposição em silêncio: se um campo vazio virar 0, o item deixa de disparar a
 * lista de compras — porque nunca há "menos do que nenhum" — e a primeira
 * pessoa a descobrir está a carregar a carrinha sem sacos do lixo.
 */
describe("normMinimo", () => {
  it("vazio, nulo e indefinido querem dizer NÃO VIGIAR", () => {
    expect(normMinimo("")).toBeUndefined();
    expect(normMinimo(null)).toBeUndefined();
    expect(normMinimo(undefined)).toBeUndefined();
  });

  it("zero é um mínimo legítimo, e não o mesmo que vazio", () => {
    expect(normMinimo(0)).toBe(0);
    expect(normMinimo("0")).toBe(0);
  });

  it("lixo não vira zero — vira não vigiar", () => {
    // Cair para 0 aqui era inventar uma regra de reposição que ninguém pediu.
    expect(normMinimo("abc")).toBeUndefined();
    expect(normMinimo(-5)).toBeUndefined();
  });

  it("aceita decimais, porque há metros e rolos", () => {
    expect(normMinimo(2.5)).toBe(2.5);
  });
});

describe("normNumero", () => {
  it("o stock nunca é negativo nem absurdo", () => {
    expect(normNumero(-1)).toBe(0);
    expect(normNumero("abc")).toBe(0);
    expect(normNumero(10 ** 9)).toBe(1_000_000);
  });

  it("mantém decimais", () => {
    expect(normNumero("12.5")).toBe(12.5);
  });
});
