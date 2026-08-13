#!/usr/bin/env node
/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS 49 FOTOGRAFIAS DO CASO REAL — fabricadas, mas com o peso das verdadeiras
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso observado é um lote de 49 fotos de casamento de 4–10 MB. Medir com
 * ficheiros pequenos mediria outra coisa: o que dói neste percurso é o número
 * de bytes e o custo de descodificar um bitmap de 20 megapíxeis, e ambos
 * desaparecem se as fotos de teste forem leves.
 *
 * Estas saem das fotografias REAIS do repositório (2048 px, já otimizadas),
 * ampliadas para tamanho de máquina e regravadas em JPEG de qualidade alta —
 * que é exactamente o que sai de uma reflex ou de um telemóvel moderno. A
 * ampliação não inventa detalhe, e não precisa de inventar: o que se está a
 * medir é peso e área, não nitidez.
 *
 * O RUÍDO fino que se acrescenta não é decoração. Sem ele o JPEG comprime
 * muito melhor do que uma fotografia verdadeira (uma ampliação é suave, e o
 * suave comprime), e os ficheiros saíam a 1–2 MB em vez dos 4–10 MB do caso
 * real — a medição ficaria otimista de graça.
 *
 * Ficam fora do git (ver .gitignore): são ~300 MB.
 *
 *   node scripts/gerar-fotos-de-teste.mjs [quantas]
 */
import { mkdir, readdir, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const QUANTAS = Number(process.argv[2] || 49);
const DESTINO = "e2e/fotos-de-teste";
const ORIGEM = "public/_img";

/** Tamanhos de máquina reais, alternados para o lote não ser uniforme — é a
 *  variedade que faz a barra de progresso por FICHEIROS saltar de forma
 *  errática, e isso é uma das coisas que se quer medir. */
const LADOS = [5472, 4032, 6000, 4608];

async function main() {
  await mkdir(DESTINO, { recursive: true });
  const todas = await readdir(ORIGEM);
  // As de 2048 px são as maiores que o repositório tem — melhor ponto de
  // partida para ampliar.
  const fontes = todas.filter((f) => f.includes("-2048.") && /\.(avif|webp|jpg)$/i.test(f));
  if (fontes.length === 0) throw new Error(`sem fotografias de origem em ${ORIGEM}`);

  let total = 0;
  for (let i = 0; i < QUANTAS; i++) {
    const fonte = join(ORIGEM, fontes[i % fontes.length]);
    const lado = LADOS[i % LADOS.length];
    const nome = `casamento-${String(i + 1).padStart(2, "0")}.jpg`;
    const alvo = join(DESTINO, nome);

    const base = sharp(fonte).resize(lado, null, { fit: "inside", withoutEnlargement: false });
    const { width, height } = await base.clone().metadata();

    // O ruído: um PNG de ruído do mesmo tamanho, sobreposto com pouca opacidade.
    const ruido = await sharp({
      create: {
        width: width ?? lado,
        height: height ?? lado,
        channels: 3,
        noise: { type: "gaussian", mean: 128, sigma: 28 },
      },
    })
      .png()
      .toBuffer();

    await base
      .composite([{ input: ruido, blend: "overlay" }])
      .jpeg({ quality: 94, chromaSubsampling: "4:4:4", mozjpeg: false })
      .toFile(alvo);

    const { size } = await stat(alvo);
    total += size;
    process.stdout.write(
      `\r${i + 1}/${QUANTAS} — ${nome} ${(size / 1024 / 1024).toFixed(1)} MB   `,
    );
  }

  const resumo = {
    quantas: QUANTAS,
    bytesTotais: total,
    mediaMB: +(total / QUANTAS / 1024 / 1024).toFixed(2),
    totalMB: +(total / 1024 / 1024).toFixed(1),
  };
  await writeFile(join(DESTINO, "resumo.json"), JSON.stringify(resumo, null, 2));
  console.log(`\n${QUANTAS} fotos — ${resumo.totalMB} MB no total, média ${resumo.mediaMB} MB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
