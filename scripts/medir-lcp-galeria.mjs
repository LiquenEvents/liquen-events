/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUAL É O ELEMENTO DE LCP DA /galeria — e é uma fotografia?
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/medir-lcp-galeria.mjs [url-base]
 *
 * O `GALERIA-AFTER.md` §3 afirma que o LCP desta página NÃO é uma fotografia:
 * é o parágrafo do banner de cookies, que só existe depois da hidratação. Essa
 * afirmação decide se vale a pena continuar a optimizar imagens para mover o
 * LCP, por isso não se herda de um relatório — volta a medir-se.
 *
 * Mesmas condições do `medir-galeria.mjs`: 4G lento e CPU 4x. Sem travessia:
 * o LCP é uma métrica de carregamento e o scroll só a suja (qualquer scroll
 * congela o candidato a LCP no browser).
 */
import { chromium, devices } from "playwright";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3100";
const REDE_4G_LENTO = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

const PERFIS = [
  { nome: "telemovel", contexto: { ...devices["Pixel 7"], deviceScaleFactor: 3 } },
  {
    nome: "secretaria",
    contexto: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  },
];

const SONDA = `
(() => {
  window.__lcp = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      const el = e.element;
      window.__lcp.push({
        t: Math.round(e.startTime),
        tam: e.size,
        tag: el ? el.tagName : "(sem elemento)",
        // O identificador mais útil por tipo: o URL para as imagens, o início
        // do texto para os blocos de texto.
        id: el
          ? (el.tagName === "IMG"
              ? (el.currentSrc || el.src || "").split("/").pop()
              : (el.textContent || "").trim().slice(0, 70))
          : "",
        classe: el ? String(el.className || "").slice(0, 60) : "",
      });
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });

  window.__fcp = 0;
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") window.__fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });
})();
`;

const browser = await chromium.launch();
for (const perfil of PERFIS) {
  const ctx = await browser.newContext({ ...perfil.contexto });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", REDE_4G_LENTO);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  await page.addInitScript(SONDA);
  await page.goto(`${BASE}/galeria`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(12_000);
  const r = await page.evaluate(() => ({ lcp: window.__lcp, fcp: Math.round(window.__fcp) }));
  console.log(`\n═══ ${perfil.nome.toUpperCase()} ═══   FCP ${r.fcp} ms`);
  for (const c of r.lcp) {
    console.log(
      `  ${String(c.t).padStart(6)} ms  ${c.tag.padEnd(4)}  ${String(Math.round(c.tam)).padStart(8)} px²  ${c.id}`,
    );
  }
  const ultimo = r.lcp[r.lcp.length - 1];
  if (ultimo) {
    console.log(
      `  → LCP final: ${ultimo.t} ms, ${ultimo.tag} ` +
        `${ultimo.tag === "IMG" ? "(É uma fotografia)" : "(NÃO é uma fotografia)"}`,
    );
  }
  await ctx.close();
}
await browser.close();
