/**
 * Uploads every file in public/imagens to a public Supabase Storage bucket so
 * the images can be served from Supabase's CDN instead of the app container.
 *
 * Safe & idempotent: it upserts (re-running just overwrites), creates the bucket
 * if missing, and never touches the running site. Activating the CDN is a
 * separate, deliberate step (see image-loader.mjs + .env.example).
 *
 * Usage:
 *   1. Make sure .env.local has SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *   2. npm run upload:images
 *   3. It prints the value to set as NEXT_PUBLIC_IMAGE_CDN.
 */
import { promises as fs } from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

// ── Load .env.local (a plain node script doesn't read it automatically) ──
async function loadEnv() {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), ".env.local"), "utf-8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* no .env.local — rely on the ambient environment */
  }
}
await loadEnv();

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.IMAGE_BUCKET ?? "imagens";
const SRC_DIR = path.join(process.cwd(), "public", "imagens");

if (!URL || !KEY) {
  console.error("✗ Faltam SUPABASE_URL e/ou SUPABASE_SERVICE_ROLE_KEY (defina-os em .env.local).");
  process.exit(1);
}

const CONTENT_TYPE = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".avif": "image/avif",
};

const supabase = createClient(URL, KEY, { auth: { persistSession: false } });

// Ensure a public bucket exists (createBucket is a no-op error if it already does).
const { error: bucketErr } = await supabase.storage.createBucket(BUCKET, {
  public: true,
  fileSizeLimit: "10MB",
});
if (bucketErr && !/already exists/i.test(bucketErr.message)) {
  console.error(`✗ Não foi possível criar o bucket "${BUCKET}":`, bucketErr.message);
  process.exit(1);
}

const files = (await fs.readdir(SRC_DIR)).filter((f) =>
  Object.prototype.hasOwnProperty.call(CONTENT_TYPE, path.extname(f).toLowerCase()),
);

console.log(`A enviar ${files.length} imagens para o bucket "${BUCKET}"…\n`);

const queue = [...files];
let done = 0;
let errors = 0;
const CONCURRENCY = 5;

async function worker() {
  while (queue.length > 0) {
    const file = queue.shift();
    const ext = path.extname(file).toLowerCase();
    try {
      const data = await fs.readFile(path.join(SRC_DIR, file));
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(file, data, { contentType: CONTENT_TYPE[ext], upsert: true });
      if (error) throw error;
    } catch (e) {
      errors++;
      console.error(`  ✗ ${file}: ${e.message ?? e}`);
    }
    done++;
    if (done % 25 === 0 || done === files.length) {
      console.log(`  ${done}/${files.length} (${errors} erros)`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));

const base = `${URL.replace(/\/$/, "")}/storage/v1/object/public/${BUCKET}`;
console.log(`\n✓ Concluído — ${done - errors}/${files.length} enviadas, ${errors} erros.`);
console.log(`\nPara ativar o CDN, define no ambiente:\n  NEXT_PUBLIC_IMAGE_CDN=${base}`);
console.log("…e segue os passos em image-loader.mjs / .env.example.");
