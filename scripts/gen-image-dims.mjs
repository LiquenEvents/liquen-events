/**
 * Extracts real pixel dimensions for every image in public/imagens and writes
 * them to src/lib/image-dims.json as { "/imagens/x.jpg": [w, h] }.
 * Powers true aspect-ratio masonry in the gallery. Run: npm run gen:dims
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const SRC = path.join(process.cwd(), "public", "imagens");
const OUT = path.join(process.cwd(), "src", "lib", "image-dims.json");
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const files = (await fs.readdir(SRC)).filter((f) => EXT.has(path.extname(f).toLowerCase())).sort();
const map = {};
for (const f of files) {
  try {
    const m = await sharp(path.join(SRC, f)).metadata();
    if (m.width && m.height) map[`/imagens/${f}`] = [m.width, m.height];
  } catch (e) { console.warn("skip", f, e.message); }
}
await fs.writeFile(OUT, JSON.stringify(map) + "\n");
console.log(`Wrote ${Object.keys(map).length} dimensions (${(JSON.stringify(map).length/1024).toFixed(1)} KB)`);
