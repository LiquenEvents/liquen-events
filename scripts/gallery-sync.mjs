/**
 * gallery:sync — add new photos to the gallery in one step.
 *
 * WHY A STAGING FOLDER: the site keeps ~130 photos on disk that were
 * deliberately REMOVED from the gallery (owner-flagged). "Every file on disk
 * not yet listed" would wrongly re-add those. So new photos are staged in
 *   public/imagens/_intake/
 * and only files placed there (or passed explicitly) are added. Everything
 * else on disk is left untouched.
 *
 * WHAT IT DOES for each new photo:
 *   1. moves it from _intake/ into public/imagens/
 *   2. picks its category (label) — see resolution order below
 *   3. appends a { src, label } entry to photos-data.ts (idempotent)
 *   4. registers a couple/collection rule when asked (collections.json)
 *   5. regenerates blur-map.json + image-dims.json (alt text & captions are
 *      automatic from label + collection, so nothing else is needed)
 *
 * LABEL resolution order: --label flag  >  matched collection's label  >
 *   filename heuristic (DJI/…_D → Aéreo, EW1 → Corporativo, a date → Conferência)
 *   >  "Evento" (and it warns, so you can fix the one-liner).
 *
 * USAGE
 *   node scripts/gallery-sync.mjs                       # add everything in _intake/
 *   node scripts/gallery-sync.mjs --label Casamento
 *   node scripts/gallery-sync.mjs --label Casamento --collection "Sofia & André" --match sofia-andre
 *   node scripts/gallery-sync.mjs foo.jpg bar.jpg --label Aéreo   # explicit files
 *   node scripts/gallery-sync.mjs --dry                 # preview, write nothing
 *
 * Or just `npm run gallery:sync -- --label Casamento`.
 */
import { promises as fs } from "fs";
import path from "path";
import { execFileSync } from "child_process";

const ROOT = process.cwd();
const IMG_DIR = path.join(ROOT, "public", "imagens");
const INTAKE_DIR = path.join(IMG_DIR, "_intake");
const DATA_FILE = path.join(ROOT, "src", "app", "[lang]", "galeria", "photos-data.ts");
const COLL_FILE = path.join(ROOT, "src", "app", "[lang]", "galeria", "collections.json");
const EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const LABELS = ["Casamento", "Corporativo", "Conferência", "Aéreo", "Evento"];

// ── args ──────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const opts = { label: null, collection: null, match: [], dry: false, files: [] };
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === "--dry") opts.dry = true;
  else if (a === "--label") opts.label = argv[++i];
  else if (a === "--collection") opts.collection = argv[++i];
  else if (a === "--match") opts.match.push(argv[++i]);
  else opts.files.push(a);
}
if (opts.label && !LABELS.includes(opts.label)) {
  console.error(`✗ --label must be one of: ${LABELS.join(", ")}`);
  process.exit(1);
}

const die = (m) => {
  console.error(`✗ ${m}`);
  process.exit(1);
};
const isImg = (f) => EXT.has(path.extname(f).toLowerCase());

// ── load current state ──────────────────────────────────────────────────────
const dataSrc = await fs.readFile(DATA_FILE, "utf-8");
const listed = new Set([...dataSrc.matchAll(/src:\s*"([^"]+)"/g)].map((m) => m[1]));
const collections = JSON.parse(await fs.readFile(COLL_FILE, "utf-8"));

function collectionFor(name) {
  const f = name.toLowerCase();
  return collections.find((r) => r.match.some((m) => f.includes(m.toLowerCase()))) ?? null;
}

// filename → category when no collection/flag says otherwise
function heuristicLabel(name) {
  const f = name.toLowerCase();
  if (/dji|_d\.(jpe?g)$|drone|aere/.test(f)) return "Aéreo";
  if (/ew1/.test(f)) return "Corporativo";
  if (/conf|\d{2}[_-]\d{2}[_-]\d{4}/.test(f)) return "Conferência";
  return null;
}

// ── gather the files to add ─────────────────────────────────────────────────
async function readdirSafe(dir) {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

// Each item: { name, from } where `from` is the absolute current path (in
// _intake/ or already in imagens/) and `name` is the final basename.
let items = [];
if (opts.files.length) {
  for (const f of opts.files) {
    const base = path.basename(f);
    if (!isImg(base)) die(`not an image: ${f}`);
    const inIntake = path.join(INTAKE_DIR, base);
    const inImg = path.join(IMG_DIR, base);
    if (await exists(inIntake)) items.push({ name: base, from: inIntake });
    else if (await exists(inImg)) items.push({ name: base, from: inImg });
    else die(`file not found in _intake/ or imagens/: ${base}`);
  }
} else {
  const intake = (await readdirSafe(INTAKE_DIR)).filter(isImg).sort();
  items = intake.map((name) => ({ name, from: path.join(INTAKE_DIR, name) }));
}

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

if (!items.length) {
  console.log(
    "Nothing to add. Put new photos in public/imagens/_intake/ (or pass filenames), then re-run.",
  );
  // Still surface how many disk files aren't in the gallery, for context.
  const onDisk = (await readdirSafe(IMG_DIR)).filter(isImg);
  const unlisted = onDisk.filter((f) => !listed.has(`/imagens/${f}`)).length;
  if (unlisted) {
    console.log(
      `(FYI: ${unlisted} file(s) already in imagens/ aren't in the gallery — those are the intentionally-removed ones and are left alone.)`,
    );
  }
  process.exit(0);
}

// ── resolve label + collection per file ─────────────────────────────────────
// If --collection is given, ensure a rule exists so captions/alt work. Derive a
// match token from --match, else from the common prefix of the new filenames.
let newCollectionRule = null;
if (opts.collection) {
  const existing = collections.find((r) => r.name === opts.collection);
  if (existing) {
    // extend its matches with any new --match tokens
    for (const m of opts.match) if (!existing.match.includes(m)) existing.match.push(m);
  } else {
    let match = opts.match.slice();
    if (!match.length) {
      const token = commonToken(items.map((it) => it.name));
      if (!token || token.length < 4)
        die(
          `--collection "${opts.collection}" needs a --match token (couldn't infer one from the filenames)`,
        );
      match = [token];
      console.log(`ℹ inferred --match "${token}" for "${opts.collection}"`);
    }
    newCollectionRule = { name: opts.collection, label: opts.label ?? "Casamento", match };
    collections.push(newCollectionRule);
  }
}

const resolved = [];
const warnings = [];
for (const it of items) {
  const src = `/imagens/${it.name}`;
  if (listed.has(src)) {
    warnings.push(`${it.name}: already in the gallery — skipped`);
    continue;
  }
  const coll = collectionFor(it.name);
  const label = opts.label ?? coll?.label ?? heuristicLabel(it.name) ?? "Evento";
  if (label === "Evento" && !opts.label)
    warnings.push(`${it.name}: category not recognised → "Evento" (pass --label to set it)`);
  resolved.push({ ...it, src, label, collection: coll?.name ?? opts.collection ?? null });
}

// longest common lowercase alphanumeric-ish prefix, trimmed to a clean token
function commonToken(names) {
  if (!names.length) return "";
  const low = names.map((n) => n.toLowerCase().replace(/\.[^.]+$/, ""));
  let prefix = low[0];
  for (const n of low) {
    while (!n.startsWith(prefix)) prefix = prefix.slice(0, -1);
    if (!prefix) break;
  }
  return prefix.replace(/[^a-z0-9&_-]+$/, "").replace(/[-_ ]+$/, "");
}

// ── report ──────────────────────────────────────────────────────────────────
console.log(`\nGallery sync${opts.dry ? " (dry run)" : ""} — ${resolved.length} new photo(s):`);
for (const r of resolved)
  console.log(`  + ${r.name.padEnd(42)} ${r.label}${r.collection ? `  · ${r.collection}` : ""}`);
if (warnings.length) {
  console.log("\nNotes:");
  for (const w of warnings) console.log(`  ! ${w}`);
}
if (!resolved.length) {
  console.log("\nNo new entries to write.");
  process.exit(0);
}
if (opts.dry) {
  console.log("\nDry run — nothing written.");
  process.exit(0);
}

// ── apply: move files, write collections.json, append photos-data.ts ─────────
for (const r of resolved) {
  const dest = path.join(IMG_DIR, r.name);
  if (r.from !== dest) {
    if (await exists(dest)) die(`refusing to overwrite existing public/imagens/${r.name}`);
    await fs.rename(r.from, dest);
  }
}

if (opts.collection || opts.match.length) {
  await fs.writeFile(COLL_FILE, JSON.stringify(collections, null, 2) + "\n");
  console.log("\n✓ collections.json updated");
}

const block = resolved.map((r) => `  { src: "${r.src}", label: "${r.label}" },`).join("\n");
const marker = dataSrc.lastIndexOf("\n];");
if (marker === -1) die("couldn't find the end of the PHOTOS array in photos-data.ts");
const nextData = dataSrc.slice(0, marker) + "\n" + block + dataSrc.slice(marker);
await fs.writeFile(DATA_FILE, nextData);
console.log(
  `✓ photos-data.ts — appended ${resolved.length} entr${resolved.length === 1 ? "y" : "ies"}`,
);

// ── regenerate derived maps ──────────────────────────────────────────────────
console.log("\nRegenerating blur placeholders + dimensions…");
execFileSync("node", ["scripts/gen-blur.mjs"], { stdio: "inherit" });
execFileSync("node", ["scripts/gen-image-dims.mjs"], { stdio: "inherit" });

// tidy: drop _intake/ if we emptied it
const leftover = (await readdirSafe(INTAKE_DIR)).filter(isImg);
if (!leftover.length && (await exists(INTAKE_DIR))) {
  const all = await readdirSafe(INTAKE_DIR);
  if (all.every((f) => f === ".gitkeep")) console.log("\n_intake/ is empty again.");
}

console.log(
  `\n✓ Done. ${resolved.length} photo(s) added. Review the changes, then commit & push to publish.`,
);
