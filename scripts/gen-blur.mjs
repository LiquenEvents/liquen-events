/**
 * Generates tiny blur placeholders for every image in public/imagens and
 * writes them to src/lib/blur-map.json as a { "/imagens/x.jpg": dataURL } map.
 *
 * These power the "blur-up" loading effect (next/image placeholder="blur").
 * Re-run with `npm run gen:blur` whenever images are added or changed.
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const SRC_DIR = path.join(process.cwd(), "public", "imagens");
const OUT_FILE = path.join(process.cwd(), "src", "lib", "blur-map.json");
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

async function blurFor(file) {
  const buf = await sharp(path.join(SRC_DIR, file))
    .resize(16, 12, { fit: "inside" })
    .webp({ quality: 40 })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

const files = (await fs.readdir(SRC_DIR)).filter((f) => EXT.has(path.extname(f).toLowerCase()));
files.sort();

const map = {};
let done = 0;
for (const file of files) {
  try {
    map[`/imagens/${file}`] = await blurFor(file);
  } catch (err) {
    console.warn(`skip ${file}: ${err.message}`);
  }
  if (++done % 50 === 0) console.log(`  ${done}/${files.length}`);
}

await fs.writeFile(OUT_FILE, JSON.stringify(map, null, 0) + "\n");
const kb = (JSON.stringify(map).length / 1024).toFixed(1);
console.log(`Wrote ${Object.keys(map).length} placeholders to blur-map.json (${kb} KB)`);
