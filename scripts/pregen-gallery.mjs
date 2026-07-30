/**
 * Pré-gera as MINIATURAS da galeria como ficheiros WebP estáticos.
 *
 * PORQUÊ. Ver o cabeçalho de src/app/[lang]/galeria/gallery-image-loader.ts.
 * Em resumo: cada miniatura da grelha era uma transformação on-demand no
 * `/_next/image` (431 a 442 URLs distintos numa travessia completa, 2 637 na
 * união de 8 classes de dispositivo). Isso põe o carregamento de CADA foto
 * dependente de um serviço com quota mensal e com degradação medida de 13x sob
 * rajada (219 ms isolado -> 2 900 ms em 30 simultâneas). Servidas como
 * ficheiros estáticos do CDN, as miniaturas deixam de ter quota, encode,
 * arranque a frio ou tempo esgotado — deixam de poder falhar.
 *
 * SAÍDA. public/_img/g/<chave>-<largura>.webp, para as 427 fotos de
 * photos-data.ts nas larguras de GALLERY_WIDTHS. NÃO é versionado (ver
 * .gitignore): são ~166 MB de WebP incompressível (gzip -1 poupa 0,2%) que o
 * build regenera de graça.
 *
 * CACHE DE BUILD. A saída é primeiro escrita em .next/cache/pregen-gallery/
 * (pasta que a Vercel preserva entre builds) e depois ligada por hardlink para
 * public/_img/g. Um build em que nenhuma foto mudou não re-encoda nada: só
 * refaz os links (~1 s). Só o primeiro build de cada foto paga o encode.
 *
 * Manter WIDTHS / QUALITY / galleryKey() em sincronia com
 * src/app/[lang]/galeria/gallery-image-loader.ts (esse ficheiro é TS e não
 * pode ser importado daqui). O teste gallery-image-loader.test.ts falha se
 * saírem de sincronia.
 *
 * Corre automaticamente no `npm run build`; à parte com `npm run pregen`.
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const OUT_DIR = path.join(PUBLIC, "_img", "g");
const CACHE_DIR = path.join(ROOT, ".next", "cache", "pregen-gallery");
const INDEX_FILE = path.join(CACHE_DIR, "index.json");

// Em sincronia com GALLERY_WIDTHS / GALLERY_QUALITY do loader.
const WIDTHS = [384, 640, 768, 1024, 1280];
const QUALITY = 65;

// sharp já é multi-thread no seu próprio pool; mais workers do que núcleos só
// serve para manter o pool cheio enquanto uns fazem I/O.
const CONCURRENCY = Number(process.env.PREGEN_CONCURRENCY) || Math.max(2, os.cpus().length);

/** Mesma função que galleryKey() no loader. */
function galleryKey(src) {
  const base = (src.split("/").pop() ?? src).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** As fontes, lidas do módulo de dados (é TS, por isso lê-se como texto). */
async function readSources() {
  const dataFile = path.join(ROOT, "src", "app", "[lang]", "galeria", "photos-data.ts");
  const raw = await fs.readFile(dataFile, "utf8");
  const sources = [...raw.matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
  if (sources.length === 0) {
    throw new Error("pregen-gallery: não encontrei nenhuma foto em photos-data.ts");
  }
  return [...new Set(sources)];
}

const sources = await readSources();

// Duas fotos com o mesmo basename dariam a mesma chave e uma escreveria por
// cima da outra — silenciosamente, e a galeria mostraria a foto errada.
const byKey = new Map();
for (const src of sources) {
  const k = galleryKey(src);
  if (byKey.has(k)) {
    throw new Error(`pregen-gallery: colisão de chave "${k}": ${byKey.get(k)} e ${src}`);
  }
  byKey.set(k, src);
}

await fs.mkdir(OUT_DIR, { recursive: true });
await fs.mkdir(CACHE_DIR, { recursive: true });

/** Índice da cache: chave -> carimbo da fonte que a gerou. */
let index = {};
try {
  index = JSON.parse(await fs.readFile(INDEX_FILE, "utf8"));
} catch {
  index = {};
}

/** Carimbo de uma fonte: muda se o ficheiro mudar (mtime + tamanho) ou se as
    larguras/qualidade mudarem — nesse caso toda a galeria é regenerada. */
function stamp(st) {
  return `${Math.round(st.mtimeMs)}:${st.size}:${WIDTHS.join(",")}:${QUALITY}`;
}

const nextIndex = {};
const t0 = Date.now();
let encoded = 0;
let reused = 0;
let i = 0;
const bytesByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const countByWidth = Object.fromEntries(WIDTHS.map((w) => [w, 0]));
const failures = [];

async function link(from, to) {
  await fs.rm(to, { force: true });
  try {
    await fs.link(from, to);
  } catch {
    // Sistemas de ficheiros diferentes (ou sem suporte a hardlinks): copia.
    await fs.copyFile(from, to);
  }
}

async function worker() {
  for (;;) {
    const k = i++;
    if (k >= sources.length) return;
    const src = sources[k];
    const key = galleryKey(src);
    const inputPath = path.join(PUBLIC, src);

    let st;
    try {
      st = await fs.stat(inputPath);
    } catch {
      failures.push(`${src}: ficheiro de origem não existe`);
      continue;
    }
    const want = stamp(st);

    // Reaproveitar da cache de build quando a fonte não mudou E todos os
    // ficheiros estão lá (uma cache truncada regenera em vez de mentir).
    let cached = index[key] === want;
    if (cached) {
      for (const w of WIDTHS) {
        try {
          await fs.access(path.join(CACHE_DIR, `${key}-${w}.webp`));
        } catch {
          cached = false;
          break;
        }
      }
    }

    if (!cached) {
      let meta;
      try {
        meta = await sharp(inputPath).metadata();
      } catch (err) {
        failures.push(`${src}: ${err.message}`);
        continue;
      }
      // Um único read do original reutilizado para todas as larguras: o custo
      // dominante é o decode, não o encode.
      const input = await fs.readFile(inputPath);
      for (const w of WIDTHS) {
        // Nunca ampliar acima da fonte (igual ao next/image).
        const target = meta.width ? Math.min(w, meta.width) : w;
        const buf = await sharp(input)
          .resize(target, null, { withoutEnlargement: true })
          .webp({ quality: QUALITY })
          .toBuffer();
        await fs.writeFile(path.join(CACHE_DIR, `${key}-${w}.webp`), buf);
      }
      encoded++;
    } else {
      reused++;
    }

    for (const w of WIDTHS) {
      const cacheFile = path.join(CACHE_DIR, `${key}-${w}.webp`);
      await link(cacheFile, path.join(OUT_DIR, `${key}-${w}.webp`));
      const s = await fs.stat(cacheFile);
      bytesByWidth[w] += s.size;
      countByWidth[w]++;
    }
    nextIndex[key] = want;
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

// Uma foto que falhe deixa a grelha a mostrar "Foto indisponível" — que é
// exactamente o sintoma que este script existe para eliminar. Melhor falhar o
// build do que publicar buracos.
if (failures.length) {
  console.error(`pregen-gallery: ${failures.length} foto(s) falharam:`);
  for (const f of failures.slice(0, 20)) console.error(`  - ${f}`);
  process.exit(1);
}

// Limpeza: ficheiros de fotos que já não existem em photos-data.ts, tanto na
// saída como na cache (senão a cache cresce para sempre).
const wanted = new Set();
for (const key of byKey.keys()) for (const w of WIDTHS) wanted.add(`${key}-${w}.webp`);
let pruned = 0;
for (const dir of [OUT_DIR, CACHE_DIR]) {
  for (const name of await fs.readdir(dir)) {
    if (name === "index.json" || wanted.has(name)) continue;
    await fs.rm(path.join(dir, name), { force: true, recursive: true });
    pruned++;
  }
}

await fs.writeFile(INDEX_FILE, JSON.stringify(nextIndex), "utf8");

const seconds = (Date.now() - t0) / 1000;
const totalBytes = Object.values(bytesByWidth).reduce((a, b) => a + b, 0);
console.log(
  `pregen-gallery: ${sources.length} fotos x ${WIDTHS.length} larguras = ` +
    `${sources.length * WIDTHS.length} ficheiros (${(totalBytes / 1048576).toFixed(1)} MB) ` +
    `em ${seconds.toFixed(1)}s — ${encoded} encodadas, ${reused} reaproveitadas da cache` +
    (pruned ? `, ${pruned} obsoletas removidas` : ""),
);
console.log(
  "  " +
    WIDTHS.map(
      (w) => `w=${w}: ${(bytesByWidth[w] / countByWidth[w] / 1024).toFixed(1)}KB média`,
    ).join("  "),
);
