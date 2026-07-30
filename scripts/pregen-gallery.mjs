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
/** src -> cor média, escrito em tile-colors.json (ver mais abaixo). */
const colors = {};

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

    /**
     * VALIDAR O CAMINHO ANTES DE LHE TOCAR.
     *
     * O `src` vem de um ficheiro de dados e vai parar a leituras e escritas no
     * disco. Hoje a lista é código nosso, mas um script de build que escreve a
     * partir de caminhos que não valida torna-se perigoso no dia em que a lista
     * passar a vir de outro lado.
     *
     * A lista de caracteres do nome é deliberadamente LARGA: as fotos reais
     * chamam-se "M&F0678.jpg" ou "natalia e jonathan-4.jpg". Uma expressão
     * apertada recusava 153 das 427 (medido a correr o build), o que seria bem
     * pior do que o problema. Quem faz o trabalho de segurança é o
     * `path.relative` a seguir: se o caminho resolvido sair de `public/`, a
     * relativa começa com ".." ou é absoluta.
     */
    if (!/^\/[^\0]+\.(jpe?g|png|webp)$/i.test(src)) {
      failures.push(`${src}: caminho de origem recusado`);
      continue;
    }
    const inputPath = path.resolve(PUBLIC, "." + src);
    const rel = path.relative(PUBLIC, inputPath);
    if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
      failures.push(`${src}: caminho de origem fora de public/`);
      continue;
    }

    /**
     * UM SÓ DESCRITOR PARA VER E PARA LER.
     *
     * Antes fazia-se `stat(caminho)` e, mais abaixo, `readFile(caminho)`: duas
     * resoluções do mesmo nome, e entre elas o ficheiro pode mudar ou ser
     * trocado. Abrindo UMA vez e usando o descritor para as duas coisas, ambas
     * falam do mesmo ficheiro, sempre.
     */
    let fh;
    try {
      fh = await fs.open(inputPath, "r");
    } catch {
      failures.push(`${src}: ficheiro de origem não existe`);
      continue;
    }

    let want;
    let color;
    try {
      const st = await fh.stat();
      want = stamp(st);

      // Reaproveitar da cache de build quando a fonte não mudou E todos os
      // ficheiros estão lá (uma cache truncada regenera em vez de mentir).
      const entry = index[key];
      let cached = entry?.stamp === want && typeof entry.color === "string";
      if (cached) color = entry.color;
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
        // Um único read do original reutilizado para todas as larguras: o custo
        // dominante é o decode, não o encode. Lido pelo MESMO descritor.
        let input;
        let meta;
        try {
          input = await fh.readFile();
          meta = await sharp(input).metadata();
        } catch (err) {
          failures.push(`${src}: ${err.message}`);
          continue;
        }
        let smallest;
        for (const w of WIDTHS) {
          // Nunca ampliar acima da fonte (igual ao next/image).
          const target = meta.width ? Math.min(w, meta.width) : w;
          const buf = await sharp(input)
            .resize(target, null, { withoutEnlargement: true })
            .webp({ quality: QUALITY })
            .toBuffer();
          await fs.writeFile(path.join(CACHE_DIR, `${key}-${w}.webp`), buf);
          smallest ??= buf;
        }
        // Cor média da foto, para o mosaico nunca ser um rectângulo liso do
        // fundo da página enquanto a fotografia não chega (ver tile-colors.json
        // e o uso em galeria/page.tsx). Calculada a partir da miniatura mais
        // pequena que acabámos de gerar — é um decode de 384px, não do
        // original.
        const px = await sharp(smallest).resize(1, 1, { fit: "cover" }).raw().toBuffer();
        color = "#" + [px[0], px[1], px[2]].map((v) => v.toString(16).padStart(2, "0")).join("");
        encoded++;
      } else {
        reused++;
      }
    } finally {
      await fh.close();
    }

    for (const w of WIDTHS) {
      const cacheFile = path.join(CACHE_DIR, `${key}-${w}.webp`);
      await link(cacheFile, path.join(OUT_DIR, `${key}-${w}.webp`));
      const s = await fs.stat(cacheFile);
      bytesByWidth[w] += s.size;
      countByWidth[w]++;
    }
    nextIndex[key] = { stamp: want, color };
    colors[src] = color;
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

/**
 * CONFERIR A SAÍDA, ficheiro a ficheiro, antes de dizer que correu bem.
 *
 * Até aqui o script dava-se por satisfeito por nenhum passo ter lançado
 * excepção. Não é a mesma coisa que a saída estar completa: um `link()` que
 * caia num ramo de fallback, uma cache parcial de uma corrida anterior
 * interrompida, um disco cheio a meio — e o build passa verde com miniaturas em
 * falta. No site isso é um 404 por mosaico, ou seja, a queixa que este script
 * existe para eliminar.
 *
 * O contrato que a galeria assume é exactamente este: PARA CADA foto de
 * photos-data.ts e CADA largura da escada existe um ficheiro. Ou se verifica,
 * ou não é um contrato. São ~2100 `stat` no fim de um passo de ~100s.
 */
const missing = [];
for (const src of sources) {
  const key = galleryKey(src);
  for (const w of WIDTHS) {
    const out = path.join(OUT_DIR, `${key}-${w}.webp`);
    try {
      const s = await fs.stat(out);
      if (s.size === 0) missing.push(`${key}-${w}.webp (0 bytes)`);
    } catch {
      missing.push(`${key}-${w}.webp`);
    }
  }
}
if (missing.length) {
  console.error(
    `pregen-gallery: ${missing.length} ficheiro(s) em falta na saída, de ` +
      `${sources.length * WIDTHS.length} esperados:`,
  );
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
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

/**
 * tile-colors.json — a cor média de cada foto, para o mosaico ter uma cor sua
 * enquanto a fotografia não chega.
 *
 * PORQUÊ NÃO SÓ O BLUR. O blur é bonito mas pesado: mandar os 427 na carga da
 * página custa +21,4 KB comprimidos e, medido num telemóvel a 1,6 Mbit/s,
 * atrasa a PRIMEIRA fotografia de 3,4 s para 4,2 s. As 427 cores custam ~2 KB
 * comprimidos e cobrem tudo. Fica o blur para a primeira janela (o que se vê
 * já) e a cor para as outras 300 e tal, em vez de rectângulo liso.
 *
 * É um ficheiro de código-fonte (versionado, como src/lib/blur-map.json), para
 * `tsc`/`eslint`/`vitest` funcionarem numa árvore acabada de clonar sem ter de
 * correr o build primeiro. Só se reescreve quando muda, para um build não
 * sujar a árvore de trabalho à toa.
 */
const COLORS_FILE = path.join(ROOT, "src", "app", "[lang]", "galeria", "tile-colors.json");
const colorsJson =
  JSON.stringify(
    Object.fromEntries(
      Object.keys(colors)
        .sort()
        .map((k) => [k, colors[k]]),
    ),
    null,
    2,
  ) + "\n";
let colorsChanged = false;
try {
  colorsChanged = (await fs.readFile(COLORS_FILE, "utf8")) !== colorsJson;
} catch {
  colorsChanged = true;
}
if (colorsChanged) await fs.writeFile(COLORS_FILE, colorsJson, "utf8");

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
