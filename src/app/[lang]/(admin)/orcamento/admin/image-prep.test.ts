import { describe, expect, it } from "vitest";
import {
  COVER_MAX_EDGE,
  COVER_QUALITY,
  fitWithin,
  keepOriginal,
  midFileName,
  needsMid,
  needsThumb,
  thumbFileName,
  THUMB_EDGE,
} from "./image-prep";
import { MID_EDGE, MID_QUALITY, planResize, planThumb } from "./image-worker";
import { MEDIA_LADO, MEDIA_QUALIDADE } from "@/lib/derivadas-medidas";

/**
 * Pure-logic coverage for the upload image preparation. The canvas/decode path
 * needs a real browser; these pin the sizing math and the skip heuristics that
 * decide whether a photo is re-encoded at all — and whether it also gets a
 * thumbnail.
 */

describe("fitWithin", () => {
  it("caps the long edge and keeps the aspect ratio", () => {
    expect(fitWithin(4000, 3000, 2000)).toEqual({ w: 2000, h: 1500 });
    expect(fitWithin(3000, 4000, 2000)).toEqual({ w: 1500, h: 2000 });
  });

  it("never upscales a small image", () => {
    expect(fitWithin(800, 600, 2000)).toEqual({ w: 800, h: 600 });
  });

  it("survives degenerate dimensions", () => {
    expect(fitWithin(0, 0, 2000)).toEqual({ w: 1, h: 1 });
    expect(fitWithin(1, 100000, 2000)).toEqual({ w: 1, h: 2000 });
  });
});

describe("keepOriginal", () => {
  it("keeps small already-supported files untouched", () => {
    expect(keepOriginal("image/jpeg", 500_000)).toBe(true);
    expect(keepOriginal("image/png", 1_500_000)).toBe(true);
  });

  it("um WEBP pequeno NÃO é guardado como está — o PDF não sabe imprimi-lo", () => {
    // O `pdf-lib` só embute JPEG e PNG. Um WebP pequeno passava por aqui
    // intacto e ia parar à biblioteca; no mood board ficava uma moldura vazia.
    // Continua a ser aceite — o que muda é que vai sempre ao canvas, que
    // devolve JPEG.
    expect(keepOriginal("image/webp", 100)).toBe(false);
    expect(keepOriginal("image/webp", 100, "board")).toBe(false);
  });

  it("re-encodes big files even when the format is supported", () => {
    // A telemóvel photo of 6 MB was exactly what blew the host's body limit.
    expect(keepOriginal("image/jpeg", 6_000_000)).toBe(false);
  });

  it("always re-encodes unsupported formats (HEIC from iPhones)", () => {
    expect(keepOriginal("image/heic", 100_000)).toBe(false);
    expect(keepOriginal("image/heif", 100_000)).toBe(false);
    expect(keepOriginal("", 100_000)).toBe(false);
  });

  it("uses a tighter byte gate for mood-board photos than for covers", () => {
    // 1.2 MB supported file: kept as-is for a cover (≤1.5 MB), re-encoded for a
    // board (≤1.0 MB) so a board of many photos stays light.
    expect(keepOriginal("image/jpeg", 1_200_000, "cover")).toBe(true);
    expect(keepOriginal("image/jpeg", 1_200_000, "board")).toBe(false);
  });
});

describe("needsThumb", () => {
  it("wants a thumbnail for the photos the library actually holds", () => {
    // O que sai do preset de capa: 3000 px de lado maior.
    expect(needsThumb(3000, 2000)).toBe(true);
    expect(needsThumb(2000, 3000)).toBe(true);
  });

  it("skips the second file when the photo is already thumbnail-sized", () => {
    // Sem miniatura a grelha usa o original — que, aqui, já é leve. Um segundo
    // ficheiro só acrescentaria um upload e um objeto no bucket para limpar.
    expect(needsThumb(THUMB_EDGE, THUMB_EDGE)).toBe(false);
    expect(needsThumb(320, 240)).toBe(false);
  });

  it("does not bother with a thumbnail a hair smaller than the original", () => {
    // 420 px → 400 px não poupa nada que se veja; a margem de 25 % evita-o.
    expect(needsThumb(420, 300)).toBe(false);
    expect(needsThumb(700, 300)).toBe(true);
  });
});

describe("preset da capa", () => {
  /**
   * A tira de capa do PDF: 277,8 × 595,3 pt desenhados a 160 DPI
   * (`src/lib/proposal-image.ts`) = 617 × 1323 px. É a MAIOR utilização que uma
   * foto da biblioteca alguma vez tem.
   */
  const COVER_PX = { w: 617, h: 1323 };

  it("nunca obriga o PDF a AMPLIAR a foto de capa — nem no pior caso", () => {
    // Pior caso: foto DEITADA (3:2) recortada para uma tira EM PÉ. O recorte só
    // aproveita uma faixa central estreita do original.
    const stored = fitWithin(4032, 3024, COVER_MAX_EDGE); // 2200 × 1650
    const aspect = COVER_PX.w / COVER_PX.h;
    const usableW = stored.h * aspect; // faixa central que o recorte aproveita
    expect(usableW).toBeGreaterThan(COVER_PX.w);
    expect(stored.h).toBeGreaterThan(COVER_PX.h);
    // E com margem de sobreamostragem — é ela que mantém a capa nítida depois
    // da redução. Abaixo de ~2000 px esta margem desaparece.
    expect(usableW / COVER_PX.w).toBeGreaterThanOrEqual(1.2);
  });

  it("não guarda mais pixéis do que o PDF alguma vez desenha", () => {
    // `MAX_IMAGE_EDGE_PX` em src/lib/proposal-image.ts. Guardar acima disto é
    // pagar bytes por pixéis que nada renderiza.
    expect(COVER_MAX_EDGE).toBeLessThanOrEqual(2200);
  });

  it("mantém a qualidade da capa alta (é a imagem herói do documento)", () => {
    expect(COVER_QUALITY).toBeGreaterThanOrEqual(0.88);
  });
});

describe("aritmética do trabalhador", () => {
  /**
   * O trabalhador tem a SUA cópia da aritmética (não pode importar um módulo
   * "use client" cheio de DOM). Estes testes são a rede que impede as duas
   * cópias de divergirem em silêncio — que daria fotos preparadas de maneira
   * diferente conforme o browser tivesse ou não OffscreenCanvas.
   */
  const cases: [number, number, number][] = [
    [4032, 3024, 2200],
    [3024, 4032, 2200],
    [800, 600, 2200],
    [0, 0, 2200],
    [1, 100000, 2200],
    [4000, 3000, 400],
  ];

  it("planResize concorda com fitWithin", () => {
    for (const [w, h, edge] of cases) {
      expect(planResize(w, h, edge)).toEqual(fitWithin(w, h, edge));
    }
  });

  it("planThumb concorda com needsThumb", () => {
    for (const [w, h] of [...cases, [420, 300, 0], [700, 300, 0]] as [number, number, number][]) {
      expect(planThumb(w, h, THUMB_EDGE)).toBe(needsThumb(w, h));
    }
  });
});

describe("thumbFileName", () => {
  it("marks the thumbnail and always lands on .jpg (the canvas only makes JPEG)", () => {
    expect(thumbFileName("praia.jpg")).toBe("praia.thumb.jpg");
    expect(thumbFileName("IMG_0042.HEIC")).toBe("IMG_0042.thumb.jpg");
    expect(thumbFileName("sem-extensao")).toBe("sem-extensao.thumb.jpg");
  });

  it("keeps dots inside the name", () => {
    expect(thumbFileName("casa.da.pedra.png")).toBe("casa.da.pedra.thumb.jpg");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DE 1200 px NASCE NO NAVEGADOR, E NÃO À PRIMEIRA VISITA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A miniatura de 400 px serve as GRELHAS do back office. A página da proposta
 * mostra outra coisa: num telemóvel a fotografia ocupa ~343 pontos a três
 * pixéis por ponto, e o `srcset` escolhe a de 1200.
 *
 * Essa nascia no servidor, uma a uma, à primeira vez que alguém olhava para
 * cada fotografia — e numa proposta acabada de enviar essa pessoa é o casal.
 * Aqui sai do MESMO canvas que já fez a miniatura.
 */
describe("a derivada de 1200 px", () => {
  it("tem as medidas do servidor — senão a mesma foto sai diferente conforme o caminho", () => {
    // Se estas divergirem, uma fotografia carregada pelo estúdio fica
    // diferente da mesma fotografia fabricada pelo lote, e ninguém repara.
    expect(MID_EDGE).toBe(MEDIA_LADO);
    expect(Math.round(MID_QUALITY * 100)).toBe(MEDIA_QUALIDADE);
  });

  it("não se fabrica quando a foto já é pequena — seria ampliar", () => {
    // Uma fotografia que nasce com 1000 px é servida tal e qual: fabricar-lhe
    // uma «de 1200» produzia um ficheiro MAIOR do que o que se está a evitar.
    expect(needsMid(1000, 700)).toBe(false);
    expect(needsMid(1200, 900)).toBe(false);
    // Com folga suficiente, vale a pena.
    expect(needsMid(2200, 1467)).toBe(true);
    expect(needsMid(1467, 2200)).toBe(true);
  });

  it("a mesma aritmética do trabalhador e do fio principal", () => {
    // As duas cópias existem porque o trabalhador não pode importar um módulo
    // "use client" cheio de DOM. Esta é a rede contra divergirem em silêncio.
    for (const [w, h] of [
      [4032, 3024],
      [2200, 1467],
      [1000, 700],
      [1200, 900],
      [0, 0],
    ] as [number, number][]) {
      expect(planThumb(w, h, MID_EDGE)).toBe(needsMid(w, h));
    }
  });

  it("o nome diz o que é, e acaba sempre em .jpg", () => {
    expect(midFileName("praia.jpg")).toBe("praia.mid.jpg");
    expect(midFileName("IMG_0042.HEIC")).toBe("IMG_0042.mid.jpg");
    expect(midFileName("casa.da.pedra.png")).toBe("casa.da.pedra.mid.jpg");
  });

  it("não se confunde com a miniatura nem com a micro", () => {
    // Três derivadas da mesma fotografia sobem no mesmo pedido; nomes iguais
    // fariam uma escrever por cima da outra.
    const nomes = new Set([midFileName("f.jpg"), thumbFileName("f.jpg"), "f.micro.jpg"]);
    expect(nomes.size).toBe(3);
  });
});
