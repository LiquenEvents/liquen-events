/**
 * Pre-compresses all source JPEGs in public/imagens.
 *
 * Each image is:
 *   - auto-rotated from EXIF orientation (then EXIF stripped)
 *   - resized to fit within 2560×2560 (no enlargement)
 *   - re-encoded as progressive JPEG at 82% quality via MozJPEG
 *
 * This is a one-time operation that typically saves 50-70% on disk size,
 * which reduces the work the Next.js image optimizer has to do on every
 * cache-miss request. Re-run after adding new images, then:
 *   npm run gen:blur && npm run gen:dims
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "public", "imagens");
const MAX_DIM = 2560;
const QUALITY = 82;
const CONCURRENCY = 2;
const EXT = new Set([".jpg", ".jpeg"]);

const allFiles = (await fs.readdir(SRC_DIR))
  .filter((f) => EXT.has(path.extname(f).toLowerCase()))
  .sort();

console.log(`Compressing ${allFiles.length} images (concurrency ${CONCURRENCY}) …\n`);

const queue = [...allFiles];
let totalBefore = 0;
let totalAfter = 0;
let done = 0;

async function processNext() {
  while (queue.length > 0) {
    const file = queue.shift();
    const fp = path.join(SRC_DIR, file);

    const before = (await fs.stat(fp)).size;
    totalBefore += before;

    let buf;
    try {
      buf = await sharp(fp, { failOn: "none" })
        .rotate()
        .resize(MAX_DIM, MAX_DIM, { fit: "inside", withoutEnlargement: true })
        .jpeg({ quality: QUALITY, progressive: true, mozjpeg: true })
        .toBuffer();
    } catch (err) {
      console.warn(`  SKIP ${file}: ${err.message}`);
      totalBefore -= before;
      continue;
    }

    // Only overwrite if the result is actually smaller (safety net).
    // Use atomic write (tmp → rename) to avoid Windows file-lock races.
    if (buf.length < before) {
      const tmp = fp + ".tmp";
      await fs.writeFile(tmp, buf);
      await fs.rename(tmp, fp);
      totalAfter += buf.length;
    } else {
      totalAfter += before;
    }

    done++;
    const pct = ((1 - Math.min(buf.length, before) / before) * 100).toFixed(1);
    const totalPct = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
    if (done % 30 === 0 || done === allFiles.length) {
      const savedMB = ((totalBefore - totalAfter) / 1024 / 1024).toFixed(1);
      console.log(
        `  [${String(done).padStart(3)}/${allFiles.length}] ${file.padEnd(55)} -${pct.padStart(5)}%  |  total saved ${savedMB} MB (-${totalPct}%)`,
      );
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, processNext));

const savedMB = ((totalBefore - totalAfter) / 1024 / 1024).toFixed(1);
const savedPct = ((1 - totalAfter / totalBefore) * 100).toFixed(1);
console.log(`\n✓ Done. ${savedMB} MB saved — ${savedPct}% reduction across ${done} images.`);
console.log(`  Next step: npm run gen:blur && npm run gen:dims`);
