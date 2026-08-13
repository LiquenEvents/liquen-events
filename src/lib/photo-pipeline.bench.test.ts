import { describe, it, expect } from "vitest";
import sharp from "sharp";
import fs from "node:fs";
import path from "node:path";
import { MAX_IMAGE_EDGE_PX, PDF_JPEG_OPTIONS, pixelsForBox } from "@/lib/proposal-image";
import {
  COVER_MAX_EDGE,
  COVER_QUALITY,
  THUMB_EDGE,
  THUMB_QUALITY,
  needsThumb,
} from "@/app/[lang]/(site)/orcamento/admin/image-prep";

/**
 * REDE DE SEGURANÇA DO PIPELINE DAS FOTOS
 *
 * O banco de ensaio (`node scripts/bench-fotos.mjs`) mede tempos, e tempos não
 * se afirmam num teste: dependem da máquina. O que se afirma aqui é o que é
 * DETERMINÍSTICO e o que, se mudar sem querer, faz a Catarina voltar a esperar
 * minutos por um lote de fotos — ou, pior, estraga fotos que já lá estão.
 *
 * São quatro promessas:
 *
 *   1. O ORIGINAL GUARDADO CHEGA PARA QUEM O DESENHA. Encolher o original é a
 *      optimização mais tentadora e a mais perigosa: o original não se pode
 *      recuperar. Este teste calcula, a partir da geometria real do PDF, quantos
 *      pixéis o maior consumidor chega mesmo a desenhar, e exige que o tecto de
 *      gravação fique acima disso.
 *   2. A MINIATURA CONTINUA A EXISTIR E A SER PEQUENA. É ela que faz uma página
 *      de 60 fotos custar ~1,4 MB em vez de ~130 MB.
 *   3. O JPEG DO PDF CONTINUA BASELINE. Já aqui esteve progressivo e foi uma das
 *      causas do PDF pesado a fazer scroll — não pode voltar sem se dar por isso.
 *   4. O BANCO DE ENSAIO NÃO ESTÁ A MENTIR. Ele espelha à mão as constantes do
 *      pipeline; se o código mudar e o banco não, os números que ele imprime
 *      passam a ser ficção. Aqui compara-se uma coisa com a outra.
 */

const ROOT = process.cwd();

const BENCH = "scripts/bench-fotos.mjs";

/**
 * O maior lado, em pixéis, que ALGUM sítio do PDF chega a desenhar de uma foto
 * da biblioteca. Derivado da geometria real (A4 paisagem, as caixas do gerador)
 * passada pela mesma função que o gerador usa — não é um número escrito à mão.
 */
function largestRenderedEdgePx(): number {
  const W = 841.89; // A4 paisagem, pontos (proposal-doc-pdf.ts)
  const H = 595.28;
  const M = 68; // margem da página
  // Capa: duas tiras a ladear um painel central de 34 % da largura.
  const sideW = (W - W * 0.34) / 2;
  const cover = pixelsForBox(sideW, H, "cover");
  // Mood board, pior caso: uma foto sozinha a ocupar a área toda da página.
  const collage = pixelsForBox(W - 2 * M, H - M - 112 - (M + 8), "collage");
  return Math.max(cover.width, cover.height, collage.width, collage.height);
}

/** Uma foto real da biblioteca (as sintéticas com ruído não comprimem como
 *  fotografia e davam um orçamento de bytes falso). */
function realPhotos(n: number): Buffer[] {
  const dir = path.join(ROOT, "public", "imagens");
  const files = fs
    .readdirSync(dir)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort()
    .slice(0, n);
  return files.map((f) => fs.readFileSync(path.join(dir, f)));
}

describe("o original guardado chega para quem o desenha", () => {
  it("o tecto de gravação fica acima do maior consumidor do PDF", () => {
    const needed = largestRenderedEdgePx();
    // A capa é o maior: 277,82 × 595,28 pt a 160 DPI = 617 × 1323 px.
    expect(needed).toBe(1323);
    expect(COVER_MAX_EDGE).toBeGreaterThanOrEqual(needed);
  });

  it("a capa e o mood board continuam abaixo do tecto rígido do gerador", () => {
    expect(largestRenderedEdgePx()).toBeLessThanOrEqual(MAX_IMAGE_EDGE_PX);
  });

  it("a geometria da capa dá exactamente os pixéis que o gerador pede", () => {
    // Se este número mudar, mudou a página ou o DPI — e o mínimo do original
    // com ele. É o valor que justifica todo o orçamento acima.
    expect(pixelsForBox((841.89 - 841.89 * 0.34) / 2, 595.28, "cover")).toEqual({
      width: 617,
      height: 1323,
    });
  });
});

describe("a miniatura continua a existir e a ser pequena", () => {
  it("uma foto saída do preset de capa pede sempre miniatura", () => {
    const edge = COVER_MAX_EDGE;
    expect(needsThumb(edge, Math.round(edge * 0.66))).toBe(true);
    expect(needsThumb(Math.round(edge * 0.66), edge)).toBe(true);
  });

  it("a miniatura serve uma célula de ~150 px num ecrã Retina (2×)", () => {
    expect(THUMB_EDGE).toBeGreaterThanOrEqual(150 * 2);
  });

  it("uma página de 60 fotos cabe no orçamento de bytes com miniaturas", async () => {
    const photos = realPhotos(6);
    const sizes: number[] = [];
    for (const p of photos) {
      const t = await sharp(p)
        .rotate()
        .resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside" })
        .jpeg({ quality: Math.round(THUMB_QUALITY * 100) })
        .toBuffer();
      sizes.push(t.length);
    }
    const worst = Math.max(...sizes);
    // Medido: 11–30 KB por miniatura. O tecto é folgado de propósito — só falha
    // se alguém mudar THUMB_EDGE/THUMB_QUALITY para valores de outra ordem.
    expect(worst).toBeLessThan(80 * 1024);
    expect(worst * 60).toBeLessThan(5 * 1024 * 1024);
  });

  it("a miniatura é muito mais leve do que o original da mesma foto", async () => {
    const [photo] = realPhotos(1);
    const edge = COVER_MAX_EDGE;
    const original = await sharp(photo)
      .rotate()
      .resize(edge, edge, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: Math.round(COVER_QUALITY * 100) })
      .toBuffer();
    const thumb = await sharp(photo)
      .rotate()
      .resize(THUMB_EDGE, THUMB_EDGE, { fit: "inside" })
      .jpeg({ quality: Math.round(THUMB_QUALITY * 100) })
      .toBuffer();
    // Medido: 13–17×. É esta razão que faz a grelha valer a pena; abaixo de 5×
    // a miniatura deixou de ser miniatura.
    expect(original.length / thumb.length).toBeGreaterThan(5);
  });
});

describe("o JPEG que entra no PDF continua baseline", () => {
  it("nunca progressivo — foi uma das causas do PDF pesado a fazer scroll", () => {
    expect(PDF_JPEG_OPTIONS.progressive).toBe(false);
    expect(PDF_JPEG_OPTIONS.optimiseScans).toBe(false);
  });

  it("e sai mesmo baseline do encoder, não só na configuração", async () => {
    const [photo] = realPhotos(1);
    const out = await sharp(photo)
      .resize(617, 1323, { fit: "cover" })
      .jpeg(PDF_JPEG_OPTIONS)
      .toBuffer();
    // Marcador SOF: C0/C1 = baseline, C2 = progressivo.
    let kind = "nenhum";
    for (let i = 0; i < out.length - 1; i++) {
      if (out[i] !== 0xff) continue;
      if (out[i + 1] === 0xc0 || out[i + 1] === 0xc1) {
        kind = "baseline";
        break;
      }
      if (out[i + 1] === 0xc2) {
        kind = "progressivo";
        break;
      }
    }
    expect(kind).toBe("baseline");
  });
});

describe("o banco de ensaio não está a mentir", () => {
  it("as constantes que scripts/bench-fotos.mjs espelha são as do código", () => {
    const bench = fs.readFileSync(path.join(ROOT, BENCH), "utf8");
    const inBench = (re: RegExp, label: string) => {
      const m = bench.match(re);
      if (!m) throw new Error(`Não encontrei ${label} no banco de ensaio`);
      return Number(m[1]);
    };
    expect(inBench(/const COVER_MAX_EDGE = (\d+);/, "COVER_MAX_EDGE")).toBe(COVER_MAX_EDGE);
    expect(inBench(/const COVER_QUALITY = ([\d.]+);/, "COVER_QUALITY")).toBe(COVER_QUALITY);
    expect(inBench(/const THUMB_EDGE = (\d+);/, "THUMB_EDGE")).toBe(THUMB_EDGE);
    expect(inBench(/const THUMB_QUALITY = ([\d.]+);/, "THUMB_QUALITY")).toBe(THUMB_QUALITY);
  });
});
