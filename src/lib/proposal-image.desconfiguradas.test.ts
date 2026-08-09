import { describe, it, expect } from "vitest";
import sharp from "sharp";
import { resizeToBox, transcodificarParaJpeg } from "./proposal-image";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «MUITAS DELAS APARECEM DESCONFIGURADAS NO PDF OU NÃO APARECEM»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os testes que já existiam cobriam a canalização toda — quantos pixéis, que
 * formatos, quantas fotos faltaram — e não cobriam a única coisa que o cliente
 * vê: a IMAGEM. Nenhum deles alguma vez pôs transparência, orientação EXIF ou
 * uma foto pequena do outro lado, e por isso as três avarias deste ficheiro
 * passavam por eles todas verdes.
 *
 * Cada teste aqui é uma dessas avarias, escrita como a pessoa a viu.
 */

/** Um PNG com fundo transparente e um rectângulo vermelho no meio — o recorte,
 *  o logótipo, a exportação do Canva. O que ela carrega e vê bem no ecrã. */
async function pngComTransparencia(w = 400, h = 400): Promise<Buffer> {
  const meio = await sharp({
    create: {
      width: 100,
      height: 100,
      channels: 4,
      background: { r: 220, g: 40, b: 40, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  return sharp({
    create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  })
    .composite([{ input: meio, top: Math.round(h / 2 - 50), left: Math.round(w / 2 - 50) }])
    .png()
    .toBuffer();
}

/** A cor de um pixel do canto superior esquerdo do resultado. */
async function canto(jpeg: Buffer): Promise<[number, number, number]> {
  const px = await sharp(jpeg).extract({ left: 1, top: 1, width: 2, height: 2 }).raw().toBuffer();
  return [px[0], px[1], px[2]];
}

/** A caixa de uma tira de capa, em pontos (ver `proposal-geometria`). */
const CAPA_W = 277.8;
const CAPA_H = 595.28;

describe("a transparência não pode virar uma mancha preta", () => {
  /**
   * O JPEG não tem canal alfa. O `sharp`, ao escrever JPEG, deita a banda alfa
   * fora — e fica a cor guardada por baixo, que nos PNG exportados pelo
   * Photoshop, pelo Canva e pelo browser é PRETO.
   *
   * Uma imagem que no back office aparece bem (o ecrã é branco por trás) saía
   * no PDF como um rectângulo preto. Foi assim que chegou ao cliente.
   */
  it("um PNG transparente sai com fundo BRANCO, não preto", async () => {
    const saida = await resizeToBox(await pngComTransparencia(), CAPA_W, CAPA_H, "cover");
    expect(saida).not.toBeNull();
    expect(await canto(saida!)).toEqual([255, 255, 255]);
  });

  it("o mesmo pelo caminho da transcodificação (WebP/AVIF e o recurso)", async () => {
    const saida = await transcodificarParaJpeg(await pngComTransparencia());
    expect(saida).not.toBeNull();
    expect(await canto(saida!)).toEqual([255, 255, 255]);
  });
});

describe("não se inventam pixéis que a fotografia não tem", () => {
  /**
   * `pixelsForBox` diz quantos pixéis a CAIXA merece, sem olhar para a foto. A
   * caixa da capa pede 617×1323; uma foto de 120×240 era ampliada cinco vezes e
   * meia pelo lanczos e só depois recortada. Ampliar não acrescenta detalhe
   * nenhum — acrescenta peso e desfoque.
   */
  it("uma foto mais pequena do que a caixa não é ampliada", async () => {
    const pequena = await sharp({
      create: { width: 120, height: 240, channels: 3, background: { r: 90, g: 110, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    const saida = await resizeToBox(pequena, CAPA_W, CAPA_H, "cover");
    const m = await sharp(saida!).metadata();
    expect(m.width).toBeLessThanOrEqual(120);
    expect(m.height).toBeLessThanOrEqual(240);
  });

  /**
   * O que NÃO pode mudar por causa disso: o recorte continua a ser ao aspecto
   * exacto da caixa. É isso que garante que desenhar o resultado às medidas da
   * caixa nunca estica nada — o defeito das «fotos esticadas», que está
   * resolvido e tem de continuar a estar.
   */
  it("e o aspecto continua a ser o da caixa, ao milésimo", async () => {
    const grande = await sharp({
      create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 110, b: 90 } },
    })
      .jpeg()
      .toBuffer();
    for (const bytes of [
      grande,
      await sharp({
        create: { width: 120, height: 240, channels: 3, background: { r: 9, g: 11, b: 9 } },
      })
        .jpeg()
        .toBuffer(),
    ]) {
      const m = await sharp((await resizeToBox(bytes, CAPA_W, CAPA_H, "cover"))!).metadata();
      expect(Math.abs(m.width! / m.height! - CAPA_W / CAPA_H)).toBeLessThan(0.01);
    }
  });
});

describe("o recorte é ao centro, e é o mesmo em todas as tentativas", () => {
  /**
   * Era `attention`, o recorte «inteligente» do sharp. O estúdio mostra-lhe a
   * foto com `object-cover`, que corta AO CENTRO: o que ela escolhia no ecrã e
   * o que saía no PDF eram recortes diferentes da mesma fotografia. Numa caixa
   * de capa, que é altíssima e estreita, podem não ter nada em comum.
   */
  it("uma faixa central sobrevive ao recorte de uma foto panorâmica", async () => {
    // Panorama: azul nas pontas, vermelho ao centro. Ao cortar para a tira alta
    // da capa, o que fica tem de ser o CENTRO.
    const centro = await sharp({
      create: { width: 400, height: 1000, channels: 3, background: { r: 220, g: 40, b: 40 } },
    })
      .png()
      .toBuffer();
    const panorama = await sharp({
      create: { width: 4000, height: 1000, channels: 3, background: { r: 40, g: 40, b: 220 } },
    })
      .composite([{ input: centro, top: 0, left: 1800 }])
      .jpeg()
      .toBuffer();

    const saida = await resizeToBox(panorama, CAPA_W, CAPA_H, "cover");
    const m = await sharp(saida!).metadata();
    const px = await sharp(saida!)
      .extract({
        left: Math.floor(m.width! / 2) - 1,
        top: Math.floor(m.height! / 2) - 1,
        width: 2,
        height: 2,
      })
      .raw()
      .toBuffer();
    // Vermelho ao centro: o recorte ficou onde devia.
    expect(px[0]).toBeGreaterThan(150);
    expect(px[2]).toBeLessThan(120);
  });
});

describe("a orientação EXIF", () => {
  /**
   * Uma foto tirada com o telemóvel ao alto vem guardada DEITADA, com uma
   * etiqueta a dizer «roda-me». O caminho principal já a rodava; o de recurso
   * (quando o sharp falha) embutia o original tal como está — e o `pdf-lib` não
   * faz ideia do que seja a etiqueta. Saía deitada na página.
   */
  it("uma foto marcada como rodada sai com a largura e a altura trocadas", async () => {
    const deitada = await sharp({
      create: { width: 400, height: 200, channels: 3, background: { r: 90, g: 110, b: 90 } },
    })
      .withMetadata({ orientation: 6 }) // 90°: mostra-se 200×400
      .jpeg()
      .toBuffer();
    const m = await sharp((await transcodificarParaJpeg(deitada))!).metadata();
    expect(m.width).toBe(200);
    expect(m.height).toBe(400);
  });
});
