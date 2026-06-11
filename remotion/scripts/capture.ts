import { chromium, type Browser, type Page } from "playwright";
import fs from "fs";
import path from "path";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3001";
const SCREENSHOTS_DIR = path.join(__dirname, "../public/screenshots");

const PAGES = [
  { id: "home", path: "/", waitMs: 2500 },
  { id: "sobre", path: "/sobre", waitMs: 2500 },
  { id: "servicos", path: "/servicos", waitMs: 2500 },
  { id: "galeria", path: "/galeria", waitMs: 3500 },
  { id: "orcamento", path: "/orcamento", waitMs: 2000 },
];

/** Desktop pass feeds the 16:9 browser mockup; mobile feeds the 9:16 phone. */
const VARIANTS = [
  {
    suffix: "",
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    isMobile: false,
  },
  {
    suffix: "-mobile",
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
  },
] as const;

async function autoScroll(page: Page) {
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      const dist = 300;
      let scrolled = 0;
      const id = setInterval(() => {
        window.scrollBy(0, dist);
        scrolled += dist;
        if (scrolled >= document.body.scrollHeight) {
          clearInterval(id);
          resolve();
        }
      }, 60);
    });
  });
}

/** Wait until every <img> in the document has finished loading. */
async function waitForImages(page: Page) {
  await page.evaluate(async () => {
    const imgs = Array.from(document.querySelectorAll("img"));
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
              // Safety: never hang forever on a broken image
              setTimeout(resolve, 8000);
            }),
      ),
    );
    // Web fonts too (Playfair Display etc.)
    await document.fonts.ready;
  });
}

async function captureVariant(
  browser: Browser,
  variant: (typeof VARIANTS)[number],
  manifest: Record<string, { height: number; capturedAt: string }>,
) {
  const context = await browser.newContext({
    viewport: variant.viewport,
    deviceScaleFactor: variant.deviceScaleFactor,
    isMobile: variant.isMobile,
    hasTouch: variant.isMobile,
    // AnimateIn reveals everything immediately under reduced motion, so
    // full-page screenshots don't catch sections stuck at opacity 0.
    reducedMotion: "reduce",
  });

  for (const def of PAGES) {
    const id = `${def.id}${variant.suffix}`;
    console.log(`📷  Capturing ${id} (${variant.viewport.width}px) ...`);

    const page = await context.newPage();

    await page.goto(`${BASE_URL}${def.path}`, {
      waitUntil: "networkidle",
      timeout: 60_000,
    });

    // content-visibility:auto skips painting offscreen sections in full-page
    // screenshots (galeria masonry uses .cv-auto) — force everything visible.
    await page.addStyleTag({
      content: `* { content-visibility: visible !important; }`,
    });

    // Let the page settle
    await page.waitForTimeout(def.waitMs);

    // Scroll through so lazy images start loading, then wait for them
    await autoScroll(page);
    await waitForImages(page);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(800);

    const screenshotPath = path.join(SCREENSHOTS_DIR, `${id}.png`);
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // CSS-pixel height (device scale factor doesn't change this)
    const height = await page.evaluate(() => document.documentElement.scrollHeight);

    manifest[id] = { height, capturedAt: new Date().toISOString() };
    console.log(`   ✓ ${id}.png — height ${height}px (css)`);

    await page.close();
  }

  await context.close();
}

async function main() {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const manifest: Record<string, { height: number; capturedAt: string }> = {};

  for (const variant of VARIANTS) {
    await captureVariant(browser, variant, manifest);
  }

  const manifestPath = path.join(SCREENSHOTS_DIR, "manifest.json");
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log("\n✅ Done. Manifest written to", manifestPath);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
