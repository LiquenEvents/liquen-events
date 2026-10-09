import "server-only";
import sharp, { type OverlayOptions } from "sharp";
import { HEX } from "./paleta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS, PREPARADAS NO SERVIDOR — SEM TRANSPARÊNCIA NO PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O exemplo dela escurece as fotografias com degradés por cima (`.ov`, os
 * `linear-gradient` com `rgba`). Num PDF isso é transparência, e transparência
 * por cima de uma JPEG é o que alguns leitores (o do Mail, versões antigas do
 * Acrobat) pintam com o tom cor-de-rosa que ela já viu. Aqui não há nada por
 * cima de nada: o degradé, o desfoque e a sombra do painel são FUNDIDOS na
 * própria imagem com o `sharp`, e o PDF recebe uma JPEG opaca já pronta.
 *
 * ── O peso ─────────────────────────────────────────────────────────────────
 * O objectivo dela é ~10 MB; o limite real desta casa é o anexo de email, 8 MB
 * (`custo-do-pdf.ts`). Por isso: página inteira até {@link LADO_PAGINA} px,
 * células até
 * {@link LADO_CELULA} px, e JPEG mozjpeg a {@link QUALIDADE}.
 */

/** Lado maior de uma fotografia que ocupa a página inteira, nítida. */
export const LADO_PAGINA = 1800;
/** Lado maior de uma célula de mosaico ou do painel da capa. */
export const LADO_CELULA = 1250;
/** Qualidade JPEG por omissão — dentro dos 62–80 que ela pediu. */
export const QUALIDADE = 72;

/**
 * Um degradé, em fracções da imagem (0 = esquerda/topo, 1 = direita/fundo).
 *
 * As paragens dizem quanto da COR DO FUNDO (#1f2022) cobre a foto naquele
 * ponto: 0 é a foto como está, 1 é o fundo chapado.
 */
export interface Degrade {
  de: readonly [number, number];
  para: readonly [number, number];
  paragens: readonly { em: number; cobre: number }[];
}

/** A sombra de um painel, em píxeis do EXEMPLO (como `box-shadow`). */
export interface Sombra {
  x: number;
  y: number;
  w: number;
  h: number;
  /** O raio de desfoque do `box-shadow` (60px no exemplo). */
  desfoque: number;
  /** O deslocamento vertical (30px no exemplo). */
  desce: number;
  /** A opacidade do preto (.45 no exemplo). */
  opacidade: number;
}

export interface Tratamento {
  /** Desfoque em píxeis do exemplo (σ). 0 = nítida. */
  desfoque?: number;
  /** Multiplicador do brilho (1 = como está). */
  brilho?: number;
  degrades?: readonly Degrade[];
  sombra?: Sombra;
  qualidade?: number;
}

const svgDegrades = (w: number, h: number, degrades: readonly Degrade[]) => {
  const defs = degrades
    .map(
      (d, i) =>
        `<linearGradient id="g${i}" x1="${d.de[0]}" y1="${d.de[1]}" x2="${d.para[0]}" y2="${d.para[1]}">` +
        d.paragens
          .map(
            (p) =>
              `<stop offset="${p.em}" stop-color="${HEX.fundo}" stop-opacity="${Math.max(0, Math.min(1, p.cobre))}"/>`,
          )
          .join("") +
        `</linearGradient>`,
    )
    .join("");
  const rects = degrades
    .map((_, i) => `<rect x="0" y="0" width="${w}" height="${h}" fill="url(#g${i})"/>`)
    .join("");
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs>${defs}</defs>${rects}</svg>`,
  );
};

const svgSombra = (w: number, h: number, s: Sombra, escala: number) => {
  // O `box-shadow` desfoca com σ = metade do raio.
  const sd = (s.desfoque / 2) * escala;
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">` +
      `<defs><filter id="s" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${sd}"/></filter></defs>` +
      `<rect x="${s.x * escala}" y="${(s.y + s.desce) * escala}" width="${s.w * escala}" height="${s.h * escala}" fill="#000" fill-opacity="${s.opacidade}" filter="url(#s)"/>` +
      `</svg>`,
  );
};

/**
 * Recorta `bytes` para `w × h` píxeis como o `object-fit: cover` e aplica o
 * tratamento. Devolve uma JPEG opaca, ou `null` se a foto não se deixar ler —
 * quem chama conta-a como foto em falta, nunca deita o documento abaixo.
 *
 * `larguraFolha` é a largura, em píxeis do EXEMPLO, que a imagem vai ocupar: é
 * o que converte o desfoque e a sombra (escritos em píxeis do exemplo) para os
 * píxeis desta imagem.
 */
export async function preparar(
  bytes: Buffer,
  w: number,
  h: number,
  larguraFolha: number,
  t: Tratamento = {},
): Promise<Buffer | null> {
  try {
    const escala = w / larguraFolha;
    let img = sharp(bytes, { failOn: "none" })
      .rotate()
      .resize(Math.round(w), Math.round(h), { fit: "cover", position: sharp.strategy.attention })
      .flatten({ background: HEX.fundo });
    if (t.desfoque && t.desfoque > 0) img = img.blur(Math.max(0.3, t.desfoque * escala));
    if (t.brilho && t.brilho !== 1) img = img.modulate({ brightness: t.brilho });
    const camadas: OverlayOptions[] = [];
    if (t.degrades?.length)
      camadas.push({ input: svgDegrades(Math.round(w), Math.round(h), t.degrades) });
    if (t.sombra)
      camadas.push({ input: svgSombra(Math.round(w), Math.round(h), t.sombra, escala) });
    // O `composite` corre DEPOIS do desfoque e do brilho só se a imagem for
    // materializada primeiro: o sharp aplica as operações numa ordem fixa, e o
    // degradé tem de cair sobre a foto já escurecida.
    if (camadas.length) {
      const base = await img.toBuffer();
      img = sharp(base).composite(camadas);
    }
    return await img
      .jpeg({ quality: t.qualidade ?? QUALIDADE, mozjpeg: true, chromaSubsampling: "4:2:0" })
      .toBuffer();
  } catch {
    return null;
  }
}

/**
 * Píxeis de uma caixa de `wPx × hPx` (píxeis do exemplo), com o lado maior
 * limitado a `lado`. A 1123 px de folha, uma caixa de 300 px de largura numa
 * imagem de 2,2× dá 660 px — nítida no ecrã e na impressão de casa.
 */
export function pixeisDaCaixa(wPx: number, hPx: number, lado = LADO_CELULA, densidade = 2.2) {
  const k = Math.min(densidade, lado / Math.max(wPx, hPx));
  return { w: Math.round(wPx * k), h: Math.round(hPx * k) };
}

/**
 * O logótipo, recortado às margens e pintado na cor do texto.
 *
 * O PNG branco da casa (`proposal-assets.ts`) é o mesmo desenho do exemplo; o
 * exemplo pinta-o no creme do texto (#f3f0ea), que no fundo escuro é menos
 * duro do que o branco puro. A forma vem do canal alfa e não se toca.
 */
export async function logotipoNaCor(png: Buffer, hex: string): Promise<Buffer> {
  try {
    const recortado = await sharp(png).trim().ensureAlpha().toBuffer({ resolveWithObject: true });
    const { width, height } = recortado.info;
    const alfa = await sharp(recortado.data).extractChannel(3).toBuffer();
    return await sharp({ create: { width, height, channels: 3, background: hex } })
      .joinChannel(alfa)
      .png()
      .toBuffer();
  } catch {
    return png;
  }
}
