/**
 * Bundle size guard — fails CI if the total production JS chunks exceed the
 * budget or if any single chunk is unexpectedly large.
 *
 * Run after `npm run build`. Reads .next/static/chunks/ to measure the
 * minified (but uncompressed) sizes; gzip savings are roughly 70%, so a
 * 2 MB budget here is ~600 KB over the wire.
 *
 * Adjust the budgets below as the app grows — the goal is to catch
 * unintentional regressions, not to be overly restrictive.
 */

import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const BUDGET = {
  totalKb: 2_000, // Total JS chunks (uncompressed)
  singleKb: 600, // Single chunk — catches one massive imported library
};

const chunksDir = join(process.cwd(), ".next/static/chunks");

let totalKb = 0;
let failed = false;
const oversized = [];

let files;
try {
  files = readdirSync(chunksDir).filter((f) => f.endsWith(".js"));
} catch {
  console.error("✗  .next/static/chunks/ not found — run `npm run build` first.");
  process.exit(1);
}

for (const file of files) {
  const bytes = statSync(join(chunksDir, file)).size;
  const kb = Math.round(bytes / 1024);
  totalKb += kb;
  if (kb > BUDGET.singleKb) {
    oversized.push({ file, kb });
    failed = true;
  }
}

if (oversized.length) {
  for (const { file, kb } of oversized) {
    console.error(`✗  ${file}: ${kb} KB  (limit: ${BUDGET.singleKb} KB per chunk)`);
  }
}

const sign = totalKb > BUDGET.totalKb ? "✗" : "✓";
console.log(`${sign}  Total JS chunks: ${totalKb} KB  (limit: ${BUDGET.totalKb} KB)`);

if (totalKb > BUDGET.totalKb) failed = true;

if (failed) {
  console.error(
    "\nBundle budget exceeded. Either reduce the bundle or raise the budgets in",
    "scripts/check-bundle-size.mjs with a justification comment.",
  );
  process.exit(1);
}
