// One-off image optimizer: downsize + recompress photos in public/imagens.
// Keeps the same filenames (JPEG), so no code changes are needed.
//   node scripts/optimize-images.mjs
import sharp from "sharp";
import { readdir, stat, rename, unlink } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "imagens");
const MAX_W = 2400;     // plenty for full-bleed on retina
const QUALITY = 78;     // visually lossless for photos at this size
const MIN_BYTES = 400 * 1024; // skip files already under 400 KB

const exts = new Set([".jpg", ".jpeg", ".png"]);

let before = 0;
let after = 0;
let done = 0;
let skipped = 0;

const files = await readdir(DIR);
for (const name of files) {
  const ext = path.extname(name).toLowerCase();
  if (!exts.has(ext)) continue;

  const file = path.join(DIR, name);
  const { size } = await stat(file);
  before += size;

  if (size < MIN_BYTES) {
    after += size;
    skipped++;
    continue;
  }

  const tmp = path.join(DIR, `__opt__${name}`);
  try {
    const img = sharp(file, { failOn: "none" }).rotate();
    const meta = await img.metadata();
    let pipeline = img;
    if (meta.width && meta.width > MAX_W) {
      pipeline = pipeline.resize({ width: MAX_W });
    }
    // Always re-encode as JPEG (mozjpeg) for consistent, small output.
    await pipeline.jpeg({ quality: QUALITY, mozjpeg: true }).toFile(tmp);

    const newSize = (await stat(tmp)).size;
    if (newSize < size) {
      await unlink(file);
      // normalize PNG-named files to keep their original name (still valid)
      await rename(tmp, file);
      after += newSize;
      done++;
      process.stdout.write(
        `✓ ${name}  ${(size / 1048576).toFixed(1)}MB → ${(newSize / 1048576).toFixed(1)}MB\n`
      );
    } else {
      await unlink(tmp);
      after += size;
      skipped++;
    }
  } catch (e) {
    console.warn(`! ${name}: ${e.message}`);
    after += size;
    skipped++;
  }
}

console.log(
  `\nDone. Optimized ${done}, skipped ${skipped}. ` +
    `Total ${(before / 1048576).toFixed(0)}MB → ${(after / 1048576).toFixed(0)}MB ` +
    `(${(100 - (after / before) * 100).toFixed(0)}% smaller).`
);
