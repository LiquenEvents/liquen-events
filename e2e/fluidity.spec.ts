import { test, expect } from "@playwright/test";

/**
 * Runtime fluidity harness — measures the jank the OWNER actually feels, which
 * a Lighthouse lab load (see lighthouserc*.json) can't capture: main-thread
 * long tasks and layout shift DURING interaction (scrolling, opening a gallery
 * photo, navigating between pages).
 *
 * It installs PerformanceObservers before each document loads, drives a real
 * interaction, then reads back the accumulated metrics and prints a summary.
 * Budgets are deliberately generous — shared CI runners are slow and this job
 * is informational (continue-on-error), so the goal is a regression tripwire
 * and a repeatable number to watch, not a hard gate.
 *
 * Run just this file with `npm run measure:fluidity`.
 */

// Installed into every document: accumulate long tasks + layout shift so we can
// read the totals after an interaction. `buffered: true` captures entries that
// fired before the observer attached (e.g. shifts during initial paint).
const OBSERVER = `
  window.__fluid = { longtasks: [], cls: 0 };
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__fluid.longtasks.push(e.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const s = e;
        if (!s.hadRecentInput) window.__fluid.cls += s.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}
`;

type Fluid = { longtasks: number[]; cls: number };
type Page = import("@playwright/test").Page;

async function readFluid(page: Page): Promise<Fluid> {
  return page.evaluate(() => (window as unknown as { __fluid: Fluid }).__fluid);
}

/**
 * The long-task count already recorded — captured AFTER load so the numbers
 * reported for an interaction exclude the one-off hydration burst and reflect
 * only the jank the interaction itself caused. CLS stays cumulative (buffered),
 * which is what we want: layout must not shift, at load or during interaction.
 */
async function baseline(page: Page): Promise<number> {
  return page.evaluate(() => (window as unknown as { __fluid: Fluid }).__fluid.longtasks.length);
}

function summarize(label: string, f: Fluid, since: number, extra: Record<string, number> = {}) {
  const during = f.longtasks.slice(since);
  const total = during.reduce((a, b) => a + b, 0);
  const max = during.length ? Math.max(...during) : 0;
  const row = {
    scenario: label,
    longTasks: during.length,
    longTaskTotalMs: Math.round(total),
    longTaskMaxMs: Math.round(max),
    cls: Number(f.cls.toFixed(4)),
    ...Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, Math.round(v)])),
  };
  // Printed to the Playwright "list" reporter so the numbers land in CI logs.
  console.log(`[fluidity] ${JSON.stringify(row)}`);
  return { total, max };
}

test.describe("Fluidity (runtime jank)", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(OBSERVER);
  });

  test("home: scrolling stays smooth", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const since = await baseline(page);
    await page.mouse.move(640, 360);
    // Drive a realistic multi-step scroll through the long homepage.
    for (let i = 0; i < 12; i++) {
      await page.mouse.wheel(0, 700);
      await page.waitForTimeout(110);
    }
    const f = await readFluid(page);
    const { max } = summarize("home-scroll", f, since);
    // No single frame-blocking task over ~1s, and layout stays put after load.
    expect(max).toBeLessThan(1000);
    expect(f.cls).toBeLessThan(0.1);
  });

  test("gallery: opening a photo is responsive", async ({ page }) => {
    await page.goto("/galeria");
    await page.waitForLoadState("networkidle");
    const tile = page.locator(".g-tile").first();
    await tile.waitFor({ state: "visible" });
    const since = await baseline(page);
    const t0 = Date.now();
    await tile.click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor({ state: "visible" });
    // Wait for the full-resolution lightbox photo to actually paint.
    await dialog.locator("img").first().waitFor({ state: "visible" });
    const openMs = Date.now() - t0;
    const f = await readFluid(page);
    const { max } = summarize("gallery-open", f, since, { openMs });
    expect(max).toBeLessThan(1000);
    // Opening the lightbox shouldn't shove the underlying grid around.
    expect(f.cls).toBeLessThan(0.1);
  });

  test("navigation: page transition is quick", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const since = await baseline(page);
    const link = page.getByRole("link", { name: "Serviços" }).first();
    const t0 = Date.now();
    await link.click();
    await page.waitForURL(/\/servicos/);
    await page.getByRole("heading", { level: 1 }).first().waitFor({ state: "visible" });
    const navMs = Date.now() - t0;
    const f = await readFluid(page);
    summarize("nav-home-to-servicos", f, since, { navMs });
    // Client transition to a prefetched static route should be well under a
    // second on any reasonable machine (generous ceiling for slow CI runners).
    expect(navMs).toBeLessThan(4000);
  });
});
