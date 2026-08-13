import { describe, it, expect } from "vitest";
import { planearPaletas, resumoDoPlano } from "./paleta-etiquetar";

const semNenhuma = new Set<string>();

describe("planearPaletas", () => {
  it("propõe a paleta das fotos que têm cor e ainda não têm etiqueta", () => {
    const p = planearPaletas(
      [
        { path: "t/verde.jpg", cor: "#3d5a40" },
        { path: "t/creme.jpg", cor: "#f0ece4" },
      ],
      semNenhuma,
    );
    expect(p.aAplicar).toEqual([
      { path: "t/verde.jpg", etiquetaId: "paleta:verde" },
      { path: "t/creme.jpg", etiquetaId: "paleta:branco" },
    ]);
  });

  /**
   * A regra que manda. Uma foto de um ramo branco sobre parede de barro pode
   * ser «branco» pelos píxeis e «terracotta» para quem a vai usar — e quem tem
   * razão é quem a vai usar.
   */
  it("NÃO toca numa foto que já tem paleta, seja ela qual for", () => {
    const p = planearPaletas([{ path: "t/a.jpg", cor: "#3d5a40" }], new Set(["t/a.jpg"]));
    expect(p.aAplicar).toEqual([]);
    expect(p.jaTinham).toBe(1);
  });

  it("é seguro correr duas vezes: a segunda não faz nada", () => {
    const fotos = [{ path: "t/a.jpg", cor: "#3d5a40" }];
    const primeira = planearPaletas(fotos, semNenhuma);
    expect(primeira.aAplicar).toHaveLength(1);

    // O que a primeira aplicou passa a estar no conjunto.
    const depois = new Set(primeira.aAplicar.map((x) => x.path));
    expect(planearPaletas(fotos, depois).aAplicar).toEqual([]);
  });

  it("conta as fotos sem cor em vez de as esconder no «nada a fazer»", () => {
    // São as carregadas antes de a cor existir, e são trabalho que falta.
    const p = planearPaletas(
      [{ path: "t/a.jpg", cor: "#3d5a40" }, { path: "t/b.jpg" }, { path: "t/c.jpg", cor: null }],
      semNenhuma,
    );
    expect(p.aAplicar).toHaveLength(1);
    expect(p.semCor).toBe(2);
  });

  it("conta à parte uma cor que não se consegue ler", () => {
    const p = planearPaletas([{ path: "t/a.jpg", cor: "terracotta" }], semNenhuma);
    expect(p.aAplicar).toEqual([]);
    expect(p.corIlegivel).toBe(1);
  });

  it("aguenta uma biblioteca vazia", () => {
    expect(planearPaletas([], semNenhuma)).toEqual({
      aAplicar: [],
      jaTinham: 0,
      semCor: 0,
      corIlegivel: 0,
    });
  });
});

describe("resumoDoPlano", () => {
  it("diz as quatro contas, mesmo as que são zero", () => {
    const p = planearPaletas(
      [{ path: "t/a.jpg", cor: "#3d5a40" }, { path: "t/b.jpg" }],
      semNenhuma,
    );
    expect(resumoDoPlano(p)).toBe(
      "1 a etiquetar · 0 já tinham · 1 sem cor conhecida · 0 com cor ilegível",
    );
  });
});
