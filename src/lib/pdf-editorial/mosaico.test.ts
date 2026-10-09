import { describe, expect, it } from "vitest";
import { composicao, repartir, type Caixa } from "./mosaico";

/** As caixas de uma composição não saem da folha nem se sobrepõem. */
const sobrepoem = (a: Caixa, b: Caixa) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("as composições pelo número de fotografias", () => {
  const aspectos = (n: number) =>
    Array.from({ length: n }, (_, i) => [1.5, 0.67, 1, 2.4, 0.4][i % 5]);

  it.each([
    [0, "texto"],
    [1, "inteira"],
    [2, "fila"],
    [3, "fila"],
    [4, "tijolo"],
    [5, "desalinhadas"],
    [6, "mosaico"],
    [12, "mosaico"],
  ])("%i fotografias → %s", (n, tipo) => {
    expect(composicao(aspectos(n), false).tipo).toBe(tipo);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])(
    "%i fotografias: uma célula por foto, dentro da folha, sem sobreposições",
    (n) => {
      for (const par of [false, true]) {
        const c = composicao(aspectos(n), par);
        if (c.tipo === "texto") continue;
        expect(c.celulas).toHaveLength(n);
        const todas = "mosaico" in c ? [...c.celulas, c.mosaico] : c.celulas;
        for (const [i, a] of todas.entries()) {
          expect(a.x).toBeGreaterThanOrEqual(0);
          expect(a.y).toBeGreaterThanOrEqual(0);
          expect(a.x + a.w).toBeLessThanOrEqual(1123.01);
          expect(a.y + a.h).toBeLessThanOrEqual(794.01);
          expect(a.w).toBeGreaterThan(20);
          for (const b of todas.slice(i + 1)) expect(sobrepoem(a, b)).toBe(false);
        }
      }
    },
  );

  it("o mosaico de texto alterna de lado nos temas pares, e o tijolo não", () => {
    const impar = composicao(aspectos(8), false);
    const par = composicao(aspectos(8), true);
    expect("mosaico" in impar && impar.mosaico.x).toBe(0);
    expect("mosaico" in par && par.mosaico.x).toBeGreaterThan(0);
    const tijolo = composicao(aspectos(4), true);
    expect("mosaico" in tijolo && tijolo.mosaico).toMatchObject({ x: 0, y: 0 });
  });

  it("acima de doze, reparte o mais por igual possível", () => {
    expect(repartir(12)).toEqual([12]);
    expect(repartir(13)).toEqual([7, 6]);
    expect(repartir(25)).toEqual([9, 8, 8]);
  });
});
