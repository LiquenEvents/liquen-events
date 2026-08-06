/**
 * Fixtures com o PESO REAL do pipeline dela.
 *  · miniatura  400px lado maior, JPEG q72  (THUMB_EDGE / THUMB_QUALITY)
 *  · original  2200px lado maior, JPEG q90  (COVER_MAX_EDGE / COVER_QUALITY)
 * Fonte: fotos reais do repositório.
 */
import sharp from "sharp";
import { readdirSync, statSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "public/imagens";
const OUT =
  "/tmp/claude-0/-home-user-liquen-events/74d09af5-5a21-52ee-9b68-e35984f7054b/scratchpad/fx";
const N = Number(process.argv[2] ?? 104);

mkdirSync(join(OUT, "thumb"), { recursive: true });
mkdirSync(join(OUT, "orig"), { recursive: true });

const fotos = readdirSync(SRC)
  .filter((f) => /\.jpe?g$/i.test(f))
  .slice(0, N);
let tb = 0,
  ob = 0;
for (let i = 0; i < fotos.length; i++) {
  const src = join(SRC, fotos[i]);
  const nome = `f${String(i).padStart(3, "0")}.jpg`;
  await sharp(src)
    .rotate()
    .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 72 })
    .toFile(join(OUT, "thumb", nome));
  await sharp(src)
    .rotate()
    .resize({ width: 2200, height: 2200, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toFile(join(OUT, "orig", nome));
  tb += statSync(join(OUT, "thumb", nome)).size;
  ob += statSync(join(OUT, "orig", nome)).size;
}
console.log(
  JSON.stringify(
    {
      fotos: fotos.length,
      miniatura: { totalKB: Math.round(tb / 1024), mediaKB: Math.round(tb / fotos.length / 1024) },
      original: {
        totalMB: +(ob / 1048576).toFixed(1),
        mediaKB: Math.round(ob / fotos.length / 1024),
      },
    },
    null,
    2,
  ),
);
