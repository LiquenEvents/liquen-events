/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VIRTUALIZAÇÃO PAGA-SE? — A SONDA QUE RESPONDE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/custo-dom-galeria.mjs   (com um build de produção em :3000)
 *
 * O custo de percorrer a galeria CRESCE com o número de mosaicos montados?
 *
 * Se sim, a virtualização paga-se. Se o bloqueio por ecrã for plano, o que
 * custa é a fotografia a chegar — e arrancar mosaicos do DOM não compra nada,
 * só parte a navegação por teclado e o restauro de posição.
 *
 * A resposta em 2026-08, depois de o `will-change` sair do estado de repouso:
 * o bloqueio por bloco é ZERO em cinco dos seis blocos e 27 ms no sexto,
 * enquanto os mosaicos montados sobem de 16 para 88. Ou seja: não se paga.
 * Está registado em GALERIA-AFTER.md, com a tabela.
 *
 * Se algum dia esta sonda deixar de dar zeros, a decisão muda — e é para isso
 * que ela fica no repositório em vez de morrer num scratchpad.
 */
import { chromium, devices } from "playwright";
const b = await chromium.launch();
const ctx = await b.newContext({ ...devices["Pixel 7"], deviceScaleFactor: 3 });
const p = await ctx.newPage();
const cdp = await ctx.newCDPSession(p);
await cdp.send("Network.enable");
await cdp.send("Network.emulateNetworkConditions", {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
});
await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
await p.addInitScript(`
  window.__L = [];
  new PerformanceObserver((l)=>{for(const e of l.getEntries())
    window.__L.push({t:e.startTime, d:e.duration});}).observe({type:"longtask",buffered:true});
`);
await p.goto("http://127.0.0.1:3000/galeria", { waitUntil: "domcontentloaded" });
await p.waitForTimeout(4000);

const blocos = [];
for (let bloco = 0; bloco < 6; bloco++) {
  const antes = await p.evaluate(() => ({
    t: performance.now(),
    n: document.querySelectorAll("[data-tile-idx]").length,
  }));
  await p.evaluate(async () => {
    for (let i = 0; i < 8; i++) {
      window.scrollBy(0, window.innerHeight);
      await new Promise((r) => setTimeout(r, 350));
    }
  });
  const depois = await p.evaluate((t0) => {
    const t1 = performance.now();
    const bloqueio = window.__L
      .filter((e) => e.t >= t0 && e.t < t1)
      .reduce((s, e) => s + Math.max(0, e.d - 50), 0);
    return {
      t: t1,
      bloqueio: Math.round(bloqueio),
      n: document.querySelectorAll("[data-tile-idx]").length,
    };
  }, antes.t);
  blocos.push({
    bloco: bloco + 1,
    mosaicosNoInicio: antes.n,
    mosaicosNoFim: depois.n,
    bloqueioMs: depois.bloqueio,
    duracaoS: ((depois.t - antes.t) / 1000).toFixed(1),
  });
}
console.log("bloco | mosaicos (inicio->fim) | bloqueio no bloco | duracao");
for (const x of blocos) {
  console.log(
    String(x.bloco).padStart(5),
    (x.mosaicosNoInicio + "->" + x.mosaicosNoFim).padStart(22),
    (x.bloqueioMs + " ms").padStart(17),
    (x.duracaoS + " s").padStart(8),
  );
}
await b.close();
