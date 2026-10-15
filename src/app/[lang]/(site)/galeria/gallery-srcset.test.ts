import { describe, expect, it } from "vitest";
import { PHOTOS } from "./photos-data";
import GALLERY_META from "./gallery-meta.json";
import { aspectFor } from "@/lib/image-meta";
import { interleaveByCollection, razaoDe, type Photo } from "./interleave";
import {
  ESCADA_ECRA_GRANDE,
  ESCADA_TELEMOVEL,
  larguraEsperada,
  sizesDaFila,
} from "./gallery-srcset";

describe("sizesDaFila — a largura de cada foto da fila do topo", () => {
  // Um destaque deitado (1,5) e três ao alto (0,8, 0,8, 0,667).
  const racios = [1.5, 0.8, 0.8, 2 / 3];

  it("o destaque ocupa a largura toda no telemóvel e a sua parte em cada degrau", () => {
    // 1,5/2,3 = 65,2 %; 1,5/3,1 = 48,4 %; 1,5/3,767 = 39,8 %.
    expect(sizesDaFila(racios, 0)).toBe(
      "(max-width: 639px) 100vw, (max-width: 767px) 65.2vw, (max-width: 1535px) 48.3vw, 39.8vw",
    );
  });

  it("uma foto só entra nas larguras em que está na fila", () => {
    // A 3.ª (idx 2) só existe a partir de 768 px; a 4.ª a partir de 1536 px.
    expect(sizesDaFila(racios, 2)).toBe("(max-width: 1535px) 25.8vw, 21.2vw");
    expect(sizesDaFila(racios, 3)).toBe("17.6vw");
  });

  it("uma foto mais estreita pede menos (é o que um `sizes` fixo não sabia)", () => {
    const largura = (s: string) => Number(/([\d.]+)vw$/.exec(s)?.[1]);
    expect(largura(sizesDaFila(racios, 3))).toBeLessThan(largura(sizesDaFila(racios, 1)));
  });

  it("com menos fotos do que lugares, as que há dividem a largura", () => {
    expect(sizesDaFila([1.5], 0)).toBe(
      "(max-width: 639px) 100vw, (max-width: 767px) 100vw, (max-width: 1535px) 100vw, 100vw",
    );
  });
});

/**
 * O ficheiro pedido nunca passa do degrau certo da caixa verdadeira — a regra
 * do passeio `@galeria` («nenhuma foto é servida acima do degrau certo»), aqui
 * com as fotografias reais e 200 ordens, porque o build sorteia a ordem e o
 * passeio só vê uma. Com o arredondamento para cima falhava 29 vezes em 900.
 */
describe("sizesDaFila com as fotografias verdadeiras", () => {
  const VISTO = GALLERY_META as Record<
    string,
    { c?: string; pb?: number | boolean; d?: number | boolean }
  >;
  const FOTOS: Photo[] = PHOTOS.map((p) => {
    const v = VISTO[p.src] ?? {};
    return {
      ...p,
      aspectRatio: aspectFor(p.src),
      ...(v.c ? { cena: v.c } : {}),
      ...(v.pb ? { pb: true } : {}),
      ...(v.d ? { destaque: true } : {}),
    };
  });
  const ECRAS = [
    {
      largura: 1440,
      dpr: 2,
      naFila: 3,
      limite: "(max-width: 1535px) ",
      escada: ESCADA_ECRA_GRANDE,
    },
    { largura: 1920, dpr: 2, naFila: 4, limite: "", escada: ESCADA_ECRA_GRANDE },
    { largura: 700, dpr: 2, naFila: 2, limite: "(max-width: 767px) ", escada: ESCADA_ECRA_GRANDE },
    { largura: 412, dpr: 3, naFila: 1, limite: "(max-width: 639px) ", escada: ESCADA_TELEMOVEL },
  ];

  it.each(ECRAS)("a $largura px: nenhuma foto da fila pede acima do degrau", (e) => {
    const excessivas: string[] = [];
    for (let s = 0; s < 200; s++) {
      const r = interleaveByCollection(FOTOS, `:z${s}`)
        .slice(0, 4)
        .map((p) => razaoDe(p.aspectRatio));
      const soma = r.slice(0, e.naFila).reduce((a, b) => a + b, 0);
      const livre = e.largura - 2 * (e.naFila - 1); // gap-0.5 entre fotos
      for (let i = 0; i < e.naFila; i++) {
        const parte = sizesDaFila(r, i)
          .split(", ")
          .find((x) => (e.limite ? x.startsWith(e.limite) : !x.startsWith("(")));
        const vw = Number(/([\d.]+)vw$/.exec(parte ?? "")?.[1]);
        const pedido = ((e.largura * vw) / 100) * e.dpr;
        const servida = e.escada.find((w) => w >= pedido) ?? e.escada[e.escada.length - 1];
        const css = (livre * r[i]) / soma;
        if (servida > larguraEsperada(css, e.escada)) excessivas.push(`:z${s} foto ${i}`);
      }
    }
    expect(excessivas).toEqual([]);
  });
});
