/**
 * Warms the Next.js image-optimization cache by pre-requesting every image
 * at the widths defined in next.config (deviceSizes). Run this once after
 * `npm run build && npm run start` so the first real visitor is never blocked
 * on cold-cache encoding.
 *
 * Usage:
 *   npm run build
 *   npm run start &           # keep the server running
 *   npm run warm:cache
 *   # (or) NEXTJS_URL=https://your-domain.com npm run warm:cache
 */
import { promises as fs } from "fs";
import path from "path";

const BASE_URL = process.env.NEXTJS_URL ?? "http://localhost:3000";
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
