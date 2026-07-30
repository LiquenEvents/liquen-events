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
  // Os seis heróis de página originais.
  "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg", // home
  "/imagens/hd-edited.jpg", // sobre
  "/imagens/EW1_1330.jpg", // servicos
  "/imagens/DaniGui_Preview20.jpg", // galeria
  "/imagens/DJI_20250913190635_0120_D.jpg", // contacto
  "/imagens/EW1_1393.jpg", // clientes
  // Fundos de secção, faixas e capas de serviço — tudo o que é desenhado a
  // `sizes="100vw"`. Ver o comentário em src/lib/hero-image-loader.ts: a lista
  // foi recolhida a MEDIR o `naturalWidth` contra a caixa em pixels de
  // dispositivo, não a adivinhar, e TEM de ser igual à de lá (há um teste).
  "/imagens/DaniGui_Adois_61.jpg",
  "/imagens/DaniGui_JantarFesta_130.jpg",
  "/imagens/DaniGui_JantarFesta_18.jpg",
  "/imagens/DaniGui_JantarFesta_26.jpg",
  "/imagens/DaniGui_JantarFesta_48.jpg",
  "/imagens/EW1_1332.jpg",
  "/imagens/EW1_1333.jpg",
  "/imagens/EW1_1404.jpg",
  "/imagens/EW1_1405.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4463.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4472.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A4738.jpg",
  "/imagens/JOAO_E_PEDRO_1Y1A5248.jpg",
  "/imagens/JOAO_E_PEDRO_IMGL2823.jpg",
  "/imagens/J&A-68.jpg",
  "/imagens/M&F0497.jpg",
  "/imagens/Natalia e Jonathan-198.jpg",
  "/imagens/stephanie-mizio-555.jpg",
  "/imagens/stephanie-mizio-715.jpg",
  "/imagens/stephanie-mizio-760.jpg",
  "/imagens/viaturas-classicas.jpg",
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
