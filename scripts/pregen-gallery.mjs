/**
 * Pré-gera as MINIATURAS de TODAS as fotos do site como ficheiros WebP
 * estáticos.
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
 * PORQUÊ TODAS E NÃO SÓ AS DA GALERIA. Retirar a galeria do optimizador
 * resolveu a galeria e mais nada: o menu, o portefólio das páginas de serviço e
 * os fundos de secção continuavam a passar pelo `/_next/image`, e é aí que a
 * dona do site continuava a ver ícones de imagem partida. As fotos que essas
 * páginas desenham vêm todas da MESMA pasta (public/imagens/), mas nem todas
 * estão em photos-data.ts — são 557 ficheiros contra 427 na galeria. Gerar só
 * as 427 deixava 130 sem ficheiro estático, ou seja, deixava o problema de pé
 * exactamente onde ele estava a ser visto. A regra passa a ser simples e sem
 * excepções: TODO o ficheiro de imagem em public/imagens/ tem escada estática.
 *
 * SAÍDA. public/_img/g/<chave>-<largura>.webp, para todos os ficheiros de
 * imagem de public/imagens/ nas larguras de GALLERY_WIDTHS. NÃO é versionado
 * (ver .gitignore): são ~220 MB de WebP incompressível (gzip -1 poupa 0,2%) que
 * o build regenera de graça.
 *
 * CACHE DE BUILD. A saída é primeiro escrita em .next/cache/pregen-gallery/
 * (pasta que a Vercel preserva entre builds) e depois ligada por hardlink para
 * public/_img/g. Um build em que nenhuma foto mudou não re-encoda nada: só
 * refaz os links (~3 s). Só o primeiro build de cada foto paga o encode.
 *
 * Manter WIDTHS / QUALITY / galleryKey() em sincronia com
 * src/app/[lang]/galeria/gallery-image-loader.ts (esse ficheiro é TS e não
 * pode ser importado daqui). O teste gallery-image-loader.test.ts falha se
 * saírem de sincronia.
 *
 * Corre automaticamente no `npm run build`; à parte com `npm run pregen`.
 * Os logótipos têm escada e pasta próprias — ver scripts/pregen-logos.mjs.
 */
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
import os from "os";

const ROOT = process.cwd();
const PUBLIC = path.join(ROOT, "public");
const IMAGES_DIR = path.join(PUBLIC, "imagens");
const OUT_DIR = path.join(PUBLIC, "_img", "g");
const CACHE_DIR = path.join(ROOT, ".next", "cache", "pregen-gallery");
const INDEX_FILE = path.join(CACHE_DIR, "index.json");

/** Extensões que contam como foto. Em sincronia com o teste de caminho lá em
    baixo — o que este filtro deixa entrar tem de passar nesse teste. */
const IMAGE_EXT = /\.(jpe?g|png|webp)$/i;

/**
 * public/imagens/_intake/ é a bandeja de entrada de scripts/gallery-sync.mjs:
 * fotos que ainda NÃO fazem parte do site e que o sync move para
 * public/imagens/ quando entram mesmo. Gerar-lhes a escada seria encode pago
 * por fotos que nada desenha e, pior, uma foto em trânsito existiria nos dois
 * sítios com o mesmo basename — ou seja, uma colisão de chave a falhar o build
 * a meio de um `gallery:sync`.
 */
const SKIP_DIRS = new Set(["_intake"]);

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

/**
 * As fotos DA GALERIA, lidas do módulo de dados (é TS, por isso lê-se como
 * texto). Já não é a lista de trabalho — é só o subconjunto que precisa de cor
 * em tile-colors.json, e a lista que TEM de existir no disco.
 */
async function readGallerySources() {
  const dataFile = path.join(ROOT, "src", "app", "[lang]", "galeria", "photos-data.ts");
  const raw = await fs.readFile(dataFile, "utf8");
  const sources = [...raw.matchAll(/src: "([^"]+)"/g)].map((m) => m[1]);
  if (sources.length === 0) {
    throw new Error("pregen-gallery: não encontrei nenhuma foto em photos-data.ts");
  }
  return [...new Set(sources)];
}

/** Todos os ficheiros de imagem debaixo de public/imagens/, como `src` do site
    ("/imagens/…"). Recursivo: uma pasta nova de fotos entra sozinha. */
async function readDiskSources(dir = IMAGES_DIR) {
  const out = [];
  for (const ent of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      out.push(...(await readDiskSources(full)));
    } else if (ent.isFile() && IMAGE_EXT.test(ent.name)) {
      out.push("/" + path.relative(PUBLIC, full).split(path.sep).join("/"));
    }
  }
  return out;
}

const gallerySources = await readGallerySources();
const GALLERY_SRCS = new Set(gallerySources);

/**
 * A UNIÃO, e não só o disco.
 *
 * Se uma foto estiver em photos-data.ts e não no disco, enumerar só o disco
 * fazia-a desaparecer da lista de trabalho E da verificação final — build
 * verde, mosaico partido em produção. Somando as duas listas, essa foto entra
 * na lista, não abre, e o script falha com "ficheiro de origem não existe", que
 * é o que tem de acontecer.
 */
const sources = [...new Set([...gallerySources, ...(await readDiskSources())])].sort();

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
 * O contrato que o site assume é exactamente este: PARA CADA ficheiro de imagem
 * de public/imagens/ e CADA largura da escada existe um ficheiro. Ou se
 * verifica, ou não é um contrato. São ~2800 `stat` no fim de um passo de ~130s.
 */
const missing = [];
const badKeys = new Set();
for (const src of sources) {
  const key = galleryKey(src);
  for (const w of WIDTHS) {
    const out = path.join(OUT_DIR, `${key}-${w}.webp`);
    try {
      const s = await fs.stat(out);
      if (s.size === 0) {
        missing.push(`${key}-${w}.webp (0 bytes)`);
        badKeys.add(key);
      }
    } catch {
      missing.push(`${key}-${w}.webp`);
      badKeys.add(key);
    }
  }
}
if (missing.length) {
  /**
   * FALHAR ALTO, MAS NÃO ENCRAVAR PARA SEMPRE.
   *
   * A cache vive em .next/cache/, que a Vercel guarda entre builds. Uma entrada
   * má lá dentro (uma escrita cortada a meio por um build cancelado, por
   * exemplo) tem o carimbo certo e o ficheiro no sítio — só que vazio. Sem isto,
   * a verificação reprovava-a hoje e voltaria a reprová-la em TODOS os builds
   * seguintes, e a única saída seria alguém ir limpar a cache à mão. Deitando
   * fora as entradas culpadas antes de sair, este build falha (que é o que tem
   * de fazer) e o próximo regenera-as sozinho.
   */
  for (const key of badKeys) {
    for (const w of WIDTHS) {
      await fs.rm(path.join(CACHE_DIR, `${key}-${w}.webp`), { force: true });
      await fs.rm(path.join(OUT_DIR, `${key}-${w}.webp`), { force: true });
    }
  }
  console.error(
    `pregen-gallery: ${missing.length} ficheiro(s) em falta na saída, de ` +
      `${sources.length * WIDTHS.length} esperados:`,
  );
  for (const m of missing.slice(0, 20)) console.error(`  - ${m}`);
  console.error(
    `  ${badKeys.size} entrada(s) da cache deitadas fora — uma nova corrida regenera-as.`,
  );
  process.exit(1);
}

// Limpeza: ficheiros de fotos que já não existem em public/imagens/, tanto na
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
 *
 * SÓ AS FOTOS DA GALERIA. O script gera miniaturas para os 557 ficheiros de
 * public/imagens/, mas este ficheiro fica-se pelas 427 de photos-data.ts: as
 * outras 130 nunca são desenhadas como mosaico, portanto a cor delas não serve
 * a ninguém — seria peso morto no bundle da página e entradas órfãs que o teste
 * "não tem entradas a mais" de gallery-image-loader.test.ts recusa, e bem.
 * (A cor continua a ser calculada e guardada no índice da cache para todas: é
 * derivada da miniatura de 384 que já se gerou, não custa um decode extra, e
 * poupa recalcular o dia em que uma foto entre na galeria.)
 */
const COLORS_FILE = path.join(ROOT, "src", "app", "[lang]", "galeria", "tile-colors.json");
const colorsJson =
  JSON.stringify(
    Object.fromEntries(
      Object.keys(colors)
        .filter((src) => GALLERY_SRCS.has(src))
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
  `pregen-gallery: ${sources.length} fotos (${gallerySources.length} na galeria) x ` +
    `${WIDTHS.length} larguras = ${sources.length * WIDTHS.length} ficheiros ` +
    `(${(totalBytes / 1048576).toFixed(1)} MB) em ${seconds.toFixed(1)}s — ` +
    `${encoded} encodadas, ${reused} reaproveitadas da cache` +
    (pruned ? `, ${pruned} obsoletas removidas` : ""),
);
console.log(
  "  " +
    WIDTHS.map(
      (w) => `w=${w}: ${(bytesByWidth[w] / countByWidth[w] / 1024).toFixed(1)}KB média`,
    ).join("  "),
);
