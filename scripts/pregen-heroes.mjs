/**
 * Pre-generates the marketing heroes as static, responsive WebP files under
 * public/_img so the FIRST visitor to any page gets a sharp hero immediately —
 * no on-demand `/_next/image` cold-encode (the "blurred placeholder, then it
 * snaps into focus" gap on the very first request after a fresh deploy).
 *
 * Each hero <Image> uses the `heroImageLoader` (src/lib/hero-image-loader.ts),
 * which rewrites its srcset to `/_img/<key>-<w>.webp`. This script produces
 * exactly those files. Runs automatically before every build (`prebuild`), and
 * on demand with `npm run pregen`.
 *
 * Keep HERO_SOURCES / HERO_WIDTHS / the key sanitiser in sync with
 * src/lib/hero-image-loader.ts (that module is TS and can't be imported here).
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const PUBLIC = path.join(process.cwd(), "public");
const OUT_DIR = path.join(PUBLIC, "_img");

// The six full-bleed page heroes (kept in sync with each page + HeroWarm).
const HERO_SOURCES = [
  "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg", // home
  "/imagens/hd-edited.jpg", // sobre
  "/imagens/EW1_1330.jpg", // servicos
  "/imagens/DaniGui_Preview20.jpg", // galeria
  "/imagens/DJI_20250913190635_0120_D.jpg", // contacto
  "/imagens/EW1_1393.jpg", // clientes
];

// The widths the loader snaps to. A hero is 100vw, so these span phone → 2x
// desktop; the loader rounds each srcset candidate up to the nearest of these.
const HERO_WIDTHS = [640, 1080, 1536, 2048];

// Same sanitiser as heroKey() in the loader: basename without extension, with
// anything outside [A-Za-z0-9_-] collapsed to "_".
function heroKey(src) {
  const base = src
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

await fs.mkdir(OUT_DIR, { recursive: true });

let written = 0;
for (const src of HERO_SOURCES) {
  const inputPath = path.join(PUBLIC, src);
  const key = heroKey(src);
  let meta;
  try {
    meta = await sharp(inputPath).metadata();
  } catch (err) {
    console.warn(`skip ${src}: ${err.message}`);
    continue;
  }
  for (const w of HERO_WIDTHS) {
    // Never upscale past the source width (matches next/image behaviour).
    const target = meta.width ? Math.min(w, meta.width) : w;
    const outPath = path.join(OUT_DIR, `${key}-${w}.webp`);
    await sharp(inputPath)
      .resize(target, null, { withoutEnlargement: true })
      .webp({ quality: 75 })
      .toFile(outPath);
    written++;
  }
}

console.log(`pregen-heroes: wrote ${written} files to public/_img`);
