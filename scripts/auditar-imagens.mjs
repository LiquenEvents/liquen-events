/**
 * AUDITORIA DE IMAGENS DO BACK OFFICE — Fase 0.
 *
 * O que é MEDIDO no browser: pedidos, ordem, bytes, formato, tempo até à
 * primeira imagem, tempo até à grelha completa, CLS, custo de reabrir.
 *
 * O que é MODELADO (e está declarado no relatório): a latência do Supabase
 * Storage, porque este ambiente não alcança o Supabase dela. Os valores são os
 * que o próprio código documenta em `theme-storage.ts` — `list` 120 ms,
 * assinatura 90 ms — multiplicados pelas idas que o código faz de facto.
 *
 * Os BYTES não são modelados: as fixtures são fotos reais reencodadas com as
 * definições exactas do pipeline dela (400px q72 / 2200px q90).
 */
import { chromium } from "@playwright/test";
import { createServer } from "node:http";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const FX =
  "/tmp/claude-0/-home-user-liquen-events/74d09af5-5a21-52ee-9b68-e35984f7054b/scratchpad/fx";
const PORTA_FX = 4599;
const APP = "http://localhost:3000";

// Latências do Storage documentadas no próprio código (theme-storage.ts).
const LAT_LIST = 120;
const LAT_SIGN = 90;

const nomes = readdirSync(join(FX, "thumb")).sort();
const TEMAS = [
  { id: "bouquets-branco-amarelo", nome: "Bouquets Branco e Amarelo", n: 14 },
  { id: "bouquets-branco-verde", nome: "Bouquets Branco e Verde", n: 16 },
  { id: "italia", nome: "Itália", n: 21 },
  { id: "seating-plans", nome: "Seating Plans", n: 19 },
  { id: "simples-colorido", nome: "Simples mas colorido", n: 17 },
  { id: "terracotta", nome: "Terracotta", n: 17 },
];

// ── Servidor das fixtures (faz de Storage) ────────────────────────────────
const fx = createServer((req, res) => {
  const m = /^\/(thumb|orig)\/([\w.]+)/.exec(req.url ?? "");
  if (!m) return res.writeHead(404).end();
  try {
    const p = join(FX, m[1], m[2]);
    const bytes = readFileSync(p);
    res.writeHead(200, {
      "content-type": "image/jpeg",
      "content-length": bytes.length,
      // O QUE O SUPABASE SERVE HOJE: o upload não passa `cacheControl`, logo
      // fica no default do Storage — `max-age=3600`. A cache do browser ACERTA
      // enquanto o URL for o mesmo; o que a invalida não é o cabeçalho, é o
      // TOKEN, que muda a cada assinatura. Modelar isto com `no-store` seria
      // exagerar o problema; modelar sem token seria escondê-lo.
      "cache-control": "max-age=3600",
    });
    res.end(bytes);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => fx.listen(PORTA_FX, r));

const fotosDoTema = (t) => {
  const base = TEMAS.findIndex((x) => x.id === t.id) * 20;
  return Array.from({ length: t.n }, (_, i) => {
    const nome = nomes[(base + i) % nomes.length];
    const tok = Math.random().toString(36).slice(2, 10); // token de assinatura
    return {
      path: `${t.id}/${nome.replace(".jpg", "")}.jpg`,
      url: `${APP}/__fx/orig/${nome}?token=${tok}`,
      thumbUrl: `${APP}/__fx/thumb/${nome}?token=${tok}`,
    };
  });
};

const espera = (ms) => new Promise((r) => setTimeout(r, ms));

async function medir({ rotulo, aparelho, accao }) {
  const b = await chromium.launch();
  const ctx = await b.newContext(aparelho);
  const page = await ctx.newPage();

  // O estrangulamento entra DEPOIS do login: o que se está a medir é o
  // pipeline de imagens, não o formulário de entrada.
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  const estrangular = async () => {
    await cdp.send("Network.emulateNetworkConditions", {
      offline: false,
      downloadThroughput: (1.6 * 1024 * 1024) / 8,
      uploadThroughput: (750 * 1024) / 8,
      latency: 150,
    });
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  };

  const pedidos = [];
  page.on("requestfinished", async (r) => {
    const u = r.url();
    if (!/__fx\/|\/api\/temas/.test(u)) return;
    let bytes = 0;
    try {
      const h = await r.response().then((x) => x?.headerValue("content-length"));
      bytes = Number(h ?? 0);
    } catch {
      /* ignora */
    }
    pedidos.push({ url: u, bytes, t: Date.now() });
  });

  // As duas rotas JSON, com a latência do Storage modelada.
  await page.route("**/api/temas", async (route) => {
    await espera(LAT_LIST + LAT_SIGN); // count por tema (paralelo) + assinar capas
    // A forma REAL do `ThemeSummary` (theme-types.ts): imageCount, coverUrl e
    // previewUrls. Errar a forma dava uma grelha vazia e uma auditoria a medir
    // um ecrã que não é o dela.
    const capas = TEMAS.map((t) => {
      const fs = fotosDoTema(t);
      return {
        id: t.id,
        name: t.nome,
        kind: "pasta",
        imageCount: t.n,
        coverUrl: fs[0]?.thumbUrl ?? "",
        previewUrls: fs.slice(1, 4).map((f) => f.thumbUrl),
      };
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(capas),
    });
  });
  await page.route("**/api/temas/*/imagens*", async (route) => {
    await espera(LAT_LIST + LAT_SIGN); // 1 list + assinar (orig e thumb em paralelo)
    const id = /\/api\/temas\/([^/]+)\/imagens/.exec(route.request().url())?.[1] ?? "";
    const t = TEMAS.find((x) => x.id === id) ?? TEMAS[0];
    const imgs = fotosDoTema(t);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, images: imgs, total: t.n, truncated: false }),
    });
  });

  await page.goto(`${APP}/orcamento/admin`);
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ timeout: 30000 });
  await estrangular();

  // A partir daqui é que se conta.
  pedidos.length = 0;
  await page.evaluate(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
    window.__t0 = performance.now();
    window.__primeira = null;
    const obs = new MutationObserver(() => {
      for (const img of document.images) {
        if (!/__fx\//.test(img.currentSrc)) continue;
        if (!img.__w && img.complete && img.naturalWidth > 0 && img.getClientRects().length) {
          img.__w = true;
          if (window.__primeira === null) window.__primeira = performance.now() - window.__t0;
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
    document.addEventListener(
      "load",
      (e) => {
        const el = e.target;
        if (
          el instanceof HTMLImageElement &&
          window.__primeira === null &&
          /__fx\//.test(el.currentSrc) &&
          el.getClientRects().length
        )
          window.__primeira = performance.now() - window.__t0;
      },
      true,
    );
  });

  // Espera até `n` imagens da biblioteca estarem MESMO pintadas, e devolve
  // quanto tempo levou desde `marcar()`. Um `waitForTimeout` fixo media a
  // paciência de quem escreveu o teste, não a grelha.
  page.marcar = () =>
    page.evaluate(() => {
      window.__m = performance.now();
      window.__t0 = performance.now();
      window.__primeira = null;
    });
  page.esperarGrelha = async (n, limite = 30000) => {
    try {
      await page.waitForFunction(
        (n) =>
          [...document.images].filter(
            (i) => /__fx\//.test(i.currentSrc) && i.naturalWidth > 0 && i.getClientRects().length,
          ).length >= n,
        n,
        { timeout: limite },
      );
    } catch {
      /* devolve o que houver — um limite atingido é um dado, não um erro */
    }
    return page.evaluate(() => ({
      ms: Math.round(performance.now() - window.__m),
      pintadas: [...document.images].filter(
        (i) => /__fx\//.test(i.currentSrc) && i.naturalWidth > 0 && i.getClientRects().length,
      ).length,
    }));
  };

  page.contarPedidos = () => pedidos.length;

  const r = await accao(page);

  const dados = await page.evaluate(() => {
    const vis = [...document.images].filter((i) => i.getClientRects().length && i.naturalWidth > 0);
    return {
      cls: window.__cls ?? 0,
      primeira: window.__primeira,
      imagens: vis.map((i) => ({
        natural: `${i.naturalWidth}x${i.naturalHeight}`,
        exibida: `${Math.round(i.getBoundingClientRect().width)}x${Math.round(i.getBoundingClientRect().height)}`,
        excesso: +(i.naturalWidth / Math.max(1, i.getBoundingClientRect().width)).toFixed(2),
        src: i.currentSrc.replace(/\?.*/, "").split("/").slice(-2).join("/"),
      })),
    };
  });

  await b.close();
  const imgs = pedidos.filter((p) => /__fx\//.test(p.url));
  return {
    rotulo,
    ...r,
    pedidosJson: pedidos.filter((p) => /\/api\//.test(p.url)).length,
    pedidosImagem: imgs.length,
    bytesImagem: imgs.reduce((a, p) => a + p.bytes, 0),
    cls: +dados.cls.toFixed(4),
    primeiraImagemMs: dados.primeira === null ? null : Math.round(dados.primeira),
    imagens: dados.imagens,
  };
}

const TELEMOVEL = {
  viewport: { width: 375, height: 667 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
};
const COMPUTADOR = { viewport: { width: 1440, height: 900 } };

const resultados = [];

// ── ECRÃ 1 — a vista Temas (grelha de cartões dos 6 temas) ────────────────
for (const [nome, ap] of [
  ["Temas (computador)", COMPUTADOR],
  ["Temas (telemóvel)", TELEMOVEL],
]) {
  resultados.push(
    await medir({
      rotulo: nome,
      aparelho: ap,
      accao: async (page) => {
        const t0 = Date.now();
        if (ap === TELEMOVEL) {
          await page.getByRole("button", { name: /Mais destinos/i }).click();
        }
        const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
        const item = nav.getByRole("button", { name: "Temas", exact: true });
        if ((await item.count()) === 0)
          await nav.getByRole("button", { name: "Mais", exact: true }).click();
        void t0;
        await page.marcar();
        await item.first().click();
        await page.getByRole("heading", { level: 1, name: /^Temas$/ }).waitFor();
        const g = await page.esperarGrelha(24);
        return { grelhaMs: g.ms, pintadas: g.pintadas, esperadas: 24 };
      },
    }),
  );
}

// ── ECRÃ 2 — o seletor de temas dentro do estúdio (modal) ─────────────────
resultados.push(
  await medir({
    rotulo: "Seletor de temas (modal, 1.ª abertura)",
    aparelho: COMPUTADOR,
    accao: async (page) => {
      await page
        .getByRole("navigation", { name: /Navegação do back office/i })
        .getByRole("button", { name: "Fazer proposta", exact: true })
        .click();
      await page.waitForTimeout(3000);
      const estudio = page.getByText(/Estúdio de propostas/i).first();
      if ((await estudio.count()) === 0)
        await page.locator("main li button:visible").first().click();
      await estudio.waitFor({ state: "attached" });
      await page.waitForTimeout(1500);

      const botao = page.getByRole("button", { name: /Da biblioteca de temas/i }).first();
      await botao.scrollIntoViewIfNeeded();

      // 1.ª abertura — o caso frio.
      await page.marcar();
      await botao.click();
      const g1 = await page.esperarGrelha(14);

      // Fechar e REABRIR: é o gesto real entre dois mood boards.
      // A Resource Timing distingue o que ATRAVESSOU a rede do que veio da
      // cache (`transferSize === 0`). O contador de pedidos do Playwright não:
      // um acerto de cache continua a ser um "request", e contá-lo como rede
      // faria a tabela dizer o contrário do que se passa.
      await page.evaluate(() => {
        window.__marcaRT = performance.now();
      });
      const antes = page.contarPedidos();
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      await page.marcar();
      await botao.click();
      const g2 = await page.esperarGrelha(14, 15000);
      const pedidosNaReabertura = page.contarPedidos() - antes;
      const rede = await page.evaluate(() => {
        const rs = performance
          .getEntriesByType("resource")
          .filter((e) => /__fx\//.test(e.name) && e.startTime >= window.__marcaRT);
        return {
          total: rs.length,
          daRede: rs.filter((e) => e.transferSize > 0).length,
          bytesDaRede: rs.reduce((a, e) => a + (e.transferSize || 0), 0),
        };
      });

      return {
        grelhaMs: g1.ms,
        pintadas: g1.pintadas,
        esperadas: 14,
        reaberturaMs: g2.ms,
        pedidosNaReabertura,
        reaberturaRede: rede,
      };
    },
  }),
);

console.log(JSON.stringify(resultados, null, 2));
fx.close();
