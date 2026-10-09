import { describe, expect, it } from "vitest";
import {
  ASPETO_DA_FOLHA,
  LADO_MINIMO_DA_CAPA,
  perdaNaFolha,
  problemaDaCapa,
} from "./regra-da-capa";

describe("a fotografia da capa — quando é que a dela serve", () => {
  it("deitada e com pixéis para a folha inteira: serve", () => {
    expect(problemaDaCapa(1800, 1200)).toBeNull();
    expect(problemaDaCapa(LADO_MINIMO_DA_CAPA, 800)).toBeNull();
  });

  it("ao alto não serve, seja qual for o tamanho", () => {
    expect(problemaDaCapa(1200, 1800)).toBe("ao-alto");
    expect(problemaDaCapa(4000, 6000)).toBe("ao-alto");
  });

  it("pequena não serve — ampliada numa página inteira via-se o grão", () => {
    expect(problemaDaCapa(1000, 700)).toBe("pequena");
  });

  it("quadrada conta como deitada", () => {
    expect(problemaDaCapa(1500, 1500)).toBeNull();
  });

  it("sem medida não há veredicto — não saber é não saber", () => {
    expect(problemaDaCapa(0, 0)).toBeNull();
    expect(problemaDaCapa(Number.NaN, 100)).toBeNull();
  });

  it("o recorte mede-se contra a folha deitada inteira", () => {
    expect(perdaNaFolha(ASPETO_DA_FOLHA)).toBeCloseTo(0, 5);
    // Um 3:2 quase não perde nada; um vertical perde mais de metade.
    expect(perdaNaFolha(1.5)).toBeLessThan(0.1);
    expect(perdaNaFolha(2 / 3)).toBeGreaterThan(0.5);
    expect(perdaNaFolha(0)).toBe(0);
  });
});
