/**
 * Warms the Next.js image-optimization cache by pre-requesting every image
 * at the widths defined in next.config (deviceSizes).
 *
 * ⚠️ A GALERIA JÁ NÃO PRECISA DISTO, E APONTÁ-LO À PRODUÇÃO É PERIGOSO.
 *
 * As 427 miniaturas da galeria passaram a ser ficheiros estáticos gerados no
 * build (scripts/pregen-gallery.mjs), portanto já nascem quentes — não há
 * cache para aquecer e a primeira visita não paga encode nenhum. O que este
 * script faz hoje é pedir ~5 000 transformações ao optimizador, a q=75, para
 * URLs que o sítio NÃO usa: no plano Hobby da Vercel isso é o orçamento mensal
 * inteiro de transformações gasto de uma vez, que é precisamente a avaria que
 * se andava a investigar ("nem todas as fotos carregam").
 *
 * Fica cá porque continua a servir para um servidor próprio (self-hosted, sem
 * CDN por trás) onde a cache do optimizador é local e volátil. Contra qualquer
 * host que não seja local exige uma confirmação explícita.
 *
 * Usage:
 *   npm run build
 *   npm run start &           # keep the server running
 *   npm run warm:cache
 *   # (or) WARM_CACHE_CONFIRM=1 NEXTJS_URL=https://your-domain.com npm run warm:cache
 */
import { promises as fs } from "fs";
import path from "path";

const BASE_URL = process.env.NEXTJS_URL ?? "http://localhost:3000";

const host = (() => {
  try {
    return new URL(BASE_URL).hostname;
  } catch {
    return "";
  }
})();
const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
if (!isLocal && process.env.WARM_CACHE_CONFIRM !== "1") {
  console.error(
    `Recusado: ${BASE_URL} não é um servidor local.\n` +
      `Isto pediria milhares de transformações ao optimizador de imagens desse host,\n` +
      `para URLs que o sítio já não usa (a galeria é servida por ficheiros estáticos).\n` +
      `Se é mesmo o que queres, repete com WARM_CACHE_CONFIRM=1.`,
  );
  process.exit(1);
}
const SRC_DIR = path.join(process.cwd(), "public", "imagens");

// Match deviceSizes from next.config.ts — the widths Next.js actually generates
const WIDTHS = [360, 480, 640, 768, 1024, 1280, 1920];
const QUALITY = 75;
const CONCURRENCY = 6;
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

const files = (await fs.readdir(SRC_DIR))
  .filter((f) => EXT.has(path.extname(f).toLowerCase()))
  .sort();

const jobs = [];
for (const file of files) {
  for (const w of WIDTHS) {
    jobs.push(
      `${BASE_URL}/_next/image?url=${encodeURIComponent(`/imagens/${file}`)}&w=${w}&q=${QUALITY}`,
    );
  }
}

const total = jobs.length;
console.log(`Warming cache: ${files.length} images × ${WIDTHS.length} widths = ${total} requests`);
console.log(`Endpoint: ${BASE_URL}  (concurrency: ${CONCURRENCY})\n`);

const queue = [...jobs];
let done = 0;
let errors = 0;

async function worker() {
  while (queue.length > 0) {
    const url = queue.shift();
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) errors++;
      await res.arrayBuffer(); // drain so the response is actually processed
    } catch {
      errors++;
    }
    done++;
    if (done % 100 === 0 || done === total) {
      console.log(`  ${done}/${total} (${errors} errors)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

console.log(`\n✓ Cache warm-up complete — ${done} requests, ${errors} errors.`);
