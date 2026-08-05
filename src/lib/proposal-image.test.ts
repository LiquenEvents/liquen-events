import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  MAX_IMAGE_EDGE_PX,
  imageContentKey,
  pixelsForBox,
  resizeToBox,
  achatarLogotipo,
} from "./proposal-image";

/**
 * O peso (e a fluidez) do PDF da proposta decide-se aqui: quantos pixéis é que
 * cada foto leva para a caixa onde vai mesmo ser desenhada, e com que encode.
 * Uma caixa PDF mede-se em pontos = 1/72 de polegada, portanto `w pt` a `d DPI`
 * dá `w × d / 72` pixéis — é essa conta que estes testes fixam.
 */

/** Uma foto sintética, com grão suficiente para se comportar como fotografia. */
async function photo(w: number, h: number): Promise<Buffer> {
  const px = Buffer.alloc(w * h * 3);
  let s = 12345;
  for (let i = 0; i < px.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    px[i] = (s >> 16) & 0xff;
  }
  return sharp(px, { raw: { width: w, height: h, channels: 3 } })
    .jpeg({ quality: 90 })
    .toBuffer();
}

/** Marcador SOF do JPEG: C0 = baseline, C2 = progressivo. */
function jpegKind(buf: Buffer): "baseline" | "progressive" | "outro" {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] !== 0xff) continue;
    if (buf[i + 1] === 0xc0 || buf[i + 1] === 0xc1) return "baseline";
    if (buf[i + 1] === 0xc2) return "progressive";
  }
  return "outro";
}

describe("pixelsForBox", () => {
  it("converte pontos → pixéis pelo DPI do sítio onde a foto é desenhada", () => {
    // Tira de capa da A4 paisagem: (841.89 − 841.89×0.34) / 2 pt de largura,
    // altura toda da página. A 160 DPI = 2.2222 px/pt.
    const strip = pixelsForBox((841.89 - 841.89 * 0.34) / 2, 595.28, "cover");
    expect(strip).toEqual({ width: 617, height: 1323 });

    // Célula pequena de mood board (~147 × 101 pt) a 130 DPI = 1.8056 px/pt.
    const cell = pixelsForBox(147, 101, "collage");
    expect(cell).toEqual({ width: 265, height: 182 });
  });

  it("dá menos pixéis a uma célula de mood board do que à capa, para a MESMA caixa", () => {
    const box: [number, number] = [300, 200];
    const cover = pixelsForBox(...box, "cover");
    const collage = pixelsForBox(...box, "collage");
    expect(collage.width).toBeLessThan(cover.width);
    expect(collage.height).toBeLessThan(cover.height);
  });

  it("preserva o aspeto da caixa (desenhar às medidas dela nunca pode esticar)", () => {
    const { width, height } = pixelsForBox(400, 250, "cover");
    expect(width / height).toBeCloseTo(400 / 250, 2);
  });

  it("nunca passa de MAX_IMAGE_EDGE_PX no lado maior", () => {
    const huge = pixelsForBox(4000, 2000, "cover");
    expect(Math.max(huge.width, huge.height)).toBe(MAX_IMAGE_EDGE_PX);
    expect(huge.width / huge.height).toBeCloseTo(2, 2);
  });

  it("nunca devolve zero, por mais pequena que seja a caixa", () => {
    expect(pixelsForBox(0.1, 0.1, "collage")).toEqual({ width: 1, height: 1 });
  });
});

describe("imageContentKey", () => {
  it("é a mesma para os mesmos bytes e diferente para bytes diferentes", () => {
    const a = Buffer.from("a mesma fotografia");
    expect(imageContentKey(a)).toBe(imageContentKey(Buffer.from("a mesma fotografia")));
    expect(imageContentKey(a)).not.toBe(imageContentKey(Buffer.from("outra fotografia")));
  });
});

describe("resizeToBox", () => {
  it("recorta ao tamanho EXATO que a caixa justifica, não ao tamanho do original", async () => {
    const original = await photo(1200, 900);
    const out = await resizeToBox(original, 147, 101, "collage");
    expect(out).not.toBeNull();
    const meta = await sharp(out!).metadata();
    expect({ width: meta.width, height: meta.height }).toEqual({ width: 265, height: 182 });
    // O ponto todo: sai uma fração dos bytes do original.
    expect(out!.length).toBeLessThan(original.length / 4);
  });

  it("REGRESSÃO fluidez: o JPEG que entra no PDF é BASELINE, nunca progressivo", async () => {
    // `mozjpeg: true` liga optimiseScans e força JPEG progressivo. Progressivo
    // dentro de DCTDecode é fora do que o formato PDF assume (o Acrobat nunca o
    // suportou) e obriga o leitor a várias passagens sobre a imagem inteira a
    // cada página que entra no ecrã — era isto que travava o scroll.
    const original = await photo(1200, 900);
    for (const placement of ["cover", "collage"] as const) {
      const out = await resizeToBox(original, 300, 200, placement);
      expect(jpegKind(out!)).toBe("baseline");
    }
  });

  it("devolve null para bytes que não são imagem, em vez de rebentar", async () => {
    expect(
      await resizeToBox(Buffer.from("isto não é uma fotografia, de todo"), 100, 100, "cover"),
    ).toBeNull();
    expect(await resizeToBox(Buffer.alloc(0), 100, 100, "cover")).toBeNull();
  });

  it("ainda salva um JPEG truncado (segunda tentativa, tolerante)", async () => {
    const original = await photo(600, 400);
    const truncated = original.subarray(0, Math.floor(original.length * 0.6));
    const out = await resizeToBox(truncated, 200, 140, "collage");
    expect(out).not.toBeNull();
    expect(jpegKind(out!)).toBe("baseline");
  });
});

describe("achatarLogotipo", () => {
  /** PNG 4×4 com canal alfa: metade opaca a verde, metade transparente. */
  async function pngComAlfa(): Promise<Buffer> {
    const sharp = (await import("sharp")).default;
    return sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 128, b: 0, alpha: 0.5 } },
    })
      .png()
      .toBuffer();
  }

  it("devolve um PNG SEM canal alfa", async () => {
    // É o ponto todo: a máscara alfa do logótipo era composta em cada página, e
    // compor transparência é das operações mais caras num visualizador de PDF.
    const sharp = (await import("sharp")).default;
    const saida = await achatarLogotipo(await pngComAlfa(), { r: 255, g: 255, b: 255 }, 72);
    expect(saida).not.toBeNull();
    const meta = await sharp(saida!).metadata();
    expect(meta.format).toBe("png");
    expect(meta.hasAlpha, "o logótipo voltou a trazer canal alfa").toBe(false);
  });

  it("um pixel TOTALMENTE transparente fica exactamente com a cor de fundo", async () => {
    // A garantia que interessa: onde o logótipo não tem tinta, fica o fundo tal
    // e qual. Se isto derivar, desenha-se um rectângulo visível à volta da marca
    // — foi o que aconteceu ao tentar achatar a marca da capa contra o
    // verde-escuro, medido no PDF a 11,13,10 onde o painel dava 12,14,11. Por
    // isso só a das páginas de conteúdo é achatada, e contra BRANCO.
    const sharp = (await import("sharp")).default;
    const vazio = await sharp({
      create: { width: 4, height: 4, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .png()
      .toBuffer();
    const saida = await achatarLogotipo(vazio, { r: 255, g: 255, b: 255 }, 72);
    const { data } = await sharp(saida!).raw().toBuffer({ resolveWithObject: true });
    expect([data[0], data[1], data[2]]).toEqual([255, 255, 255]);
  });

  it("não amplia um logótipo já mais pequeno do que o pedido", async () => {
    const sharp = (await import("sharp")).default;
    const saida = await achatarLogotipo(await pngComAlfa(), { r: 255, g: 255, b: 255 }, 72);
    const meta = await sharp(saida!).metadata();
    expect(meta.width).toBe(4);
  });

  it("bytes que não são imagem devolvem null em vez de lançar", async () => {
    // Quem chama volta ao PNG original: o documento sai sempre.
    expect(await achatarLogotipo(Buffer.from("nada"), { r: 0, g: 0, b: 0 }, 72)).toBeNull();
  });
});
