import { describe, expect, it } from "vitest";
import { sizesDaFila } from "./gallery-srcset";

describe("sizesDaFila — a largura de cada foto da fila do topo", () => {
  // Um destaque deitado (1,5) e três ao alto (0,8, 0,8, 0,667).
  const racios = [1.5, 0.8, 0.8, 2 / 3];

  it("o destaque ocupa a largura toda no telemóvel e a sua parte em cada degrau", () => {
    // 1,5/2,3 = 65,2 %; 1,5/3,1 = 48,4 %; 1,5/3,767 = 39,8 %.
    expect(sizesDaFila(racios, 0)).toBe(
      "(max-width: 639px) 100vw, (max-width: 767px) 66vw, (max-width: 1535px) 49vw, 40vw",
    );
  });

  it("uma foto só entra nas larguras em que está na fila", () => {
    // A 3.ª (idx 2) só existe a partir de 768 px; a 4.ª a partir de 1536 px.
    expect(sizesDaFila(racios, 2)).toBe("(max-width: 1535px) 26vw, 22vw");
    expect(sizesDaFila(racios, 3)).toBe("18vw");
  });

  it("uma foto mais estreita pede menos (é o que um `sizes` fixo não sabia)", () => {
    const largura = (s: string) => Number(/(\d+)vw$/.exec(s)?.[1]);
    expect(largura(sizesDaFila(racios, 3))).toBeLessThan(largura(sizesDaFila(racios, 1)));
  });

  it("com menos fotos do que lugares, as que há dividem a largura", () => {
    expect(sizesDaFila([1.5], 0)).toBe(
      "(max-width: 639px) 100vw, (max-width: 767px) 100vw, (max-width: 1535px) 100vw, 100vw",
    );
  });
});
