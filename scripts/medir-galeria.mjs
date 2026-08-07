/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDE A GALERIA — O QUE O VISITANTE SENTE, EM NÚMEROS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/medir-galeria.mjs [url-base] [--json ficheiro] [--perfil telemovel|secretaria]
 *
 * A queixa é "ao fazer scroll, as fotos de baixo ainda estão a carregar". Esse
 * sintoma tem um número por trás, e é o mais importante deste ficheiro:
 *
 *   ANTECIPAÇÃO = quantos píxeis ANTES de a foto entrar no ecrã é que o pedido
 *   dela partiu.
 *
 * Positivo e grande = o pedido saiu com o mosaico ainda longe, e há tempo de a
 * foto chegar. Zero ou negativo = o pedido só sai quando o mosaico JÁ está à
 * vista, e nesse caso não há rede que chegue: o visitante vê o buraco. Mede-se
 * cruzando o instante de cada pedido (PerformanceObserver de recursos) com a
 * posição do scroll nesse instante e com a posição do mosaico no documento.
 *
 * ── O QUE ISTO MEDE, E COMO ────────────────────────────────────────────────
 *  1. LCP, FCP, CLS, INP e TBT — PerformanceObserver, com a página a ser
 *     percorrida como um visitante a percorre.
 *  2. Peso — `transferSize` por recurso, separando imagens do resto.
 *  3. Por imagem — bytes, píxeis servidos (naturalWidth), píxeis de exibição
 *     (getBoundingClientRect × DPR), formato (pelo content-type) e o RÁCIO
 *     entre servido e exibido, que é onde os bytes se desperdiçam.
 *  4. Eager vs lazy, e a antecipação descrita acima.
 *  5. Descodificação — sonda própria: volta a descodificar uma amostra das
 *     imagens servidas com `createImageBitmap`, na mesma thread e com o mesmo
 *     estrangulamento de CPU. Não é o que o browser gastou (isso vive no
 *     rasterizador), é o custo de descodificar aquele ficheiro naquela
 *     máquina — que é o número que decide se a descodificação trava o scroll.
 *  6. Frames perdidos — deltas de `requestAnimationFrame` durante uma
 *     travessia programática, contra o orçamento de 16,7 ms.
 *  7. Placeholders — quantos mosaicos têm blur, quantos só têm cor, quantos
 *     não têm nada.
 *
 * ── O QUE NÃO MEDE ────────────────────────────────────────────────────────
 * É Chromium com estrangulamento, não um telemóvel de gama média a sério. Os
 * números são um PISO optimista: o aparelho real é mais lento. E `transferSize`
 * é zero para respostas vindas da cache do browser — por isso cada corrida
 * abre um contexto novo, sem cache.
 */

import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3123";
const JSON_OUT = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : "";
})();
const SO_PERFIL = (() => {
  const i = process.argv.indexOf("--perfil");
  return i >= 0 ? process.argv[i + 1] : "";
})();

/**
 * 4G lento, os números do painel do Chrome: 1,6 Mbit/s a descer, 750 kbit/s a
 * subir, 150 ms de latência. O CDP quer bytes por segundo.
 */
const REDE_4G_LENTO = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};
const CPU_THROTTLE = 4;

const PERFIS = [
  {
    nome: "telemovel",
    contexto: { ...devices["Pixel 7"], deviceScaleFactor: 3 },
  },
  {
    nome: "secretaria",
    contexto: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  },
];

/**
 * Instalado ANTES de qualquer script da página: os observadores têm de existir
 * antes do primeiro pedido, senão perdem-se as entradas que interessam (o FCP
 * e o LCP acontecem cedo demais para se apanharem depois do `goto`).
 */
const SONDA = `
(() => {
  const M = (window.__medida = {
    lcp: 0, fcp: 0, cls: 0, inp: 0, tbt: 0,
    recursos: [],            // {url, inicio, tipo, bytes, corpo, dur}
    scrollPorInstante: [],   // {t, y}
    longas: [],              // {inicio, dur}
  });

  // O buffer de recursos do browser pára nas 250 entradas por omissão, e esta
  // galeria pede mais de 430. Sem isto, getEntriesByType("resource") devolve um
  // recorte silencioso e os bytes ficavam subcontados. O observador abaixo
  // apanha tudo à medida que chega; subir o tecto mantém as duas fontes de
  // acordo.
  try { performance.setResourceTimingBufferSize(8000); } catch (e) {}

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) M.lcp = Math.max(M.lcp, e.startTime);
  }).observe({ type: "largest-contentful-paint", buffered: true });

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") M.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) M.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });

  // INP: a pior interação da sessão (é assim que a métrica é definida).
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.interactionId) M.inp = Math.max(M.inp, e.duration);
    }
  }).observe({ type: "event", buffered: true, durationThreshold: 16 });

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      M.longas.push({ inicio: e.startTime, dur: e.duration });
    }
  }).observe({ type: "longtask", buffered: true });

  // Cada recurso com o INSTANTE em que o pedido partiu. É metade da conta da
  // antecipação; a outra metade é a posição do scroll nesse instante.
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      M.recursos.push({
        url: e.name,
        inicio: e.startTime,
        tipo: e.initiatorType,
        bytes: e.transferSize || 0,
        corpo: e.encodedBodySize || 0,
        dur: e.duration,
      });
    }
  }).observe({ type: "resource", buffered: true });

  // Amostra do scroll a cada frame: dá-nos y(t) para cruzar com os pedidos.
  const amostra = () => {
    M.scrollPorInstante.push({ t: performance.now(), y: window.scrollY });
    requestAnimationFrame(amostra);
  };
  requestAnimationFrame(amostra);

  /**
   * PLACEHOLDERS, contados ANTES de as fotos chegarem.
   *
   * Tem de ser aqui: o next/image APAGA o background do placeholder assim que
   * a foto carrega, portanto contar no fim da sessão dá sempre perto de zero e
   * não distingue "tinha blur" de "nunca teve nada". O que interessa é o que o
   * visitante vê enquanto espera.
   */
  M.primeiraPintura = null;
  const contar = () => {
    const tiles = [...document.querySelectorAll("[data-tile-idx]")];
    let blur = 0, cor = 0, nada = 0;
    for (const t of tiles) {
      const im = t.querySelector("img");
      const temBlur = im && /data:image/.test(im.style.backgroundImage || "");
      const temCor = /rgb|#/.test(t.style.backgroundColor || "");
      if (temBlur) blur++;
      else if (temCor) cor++;
      else nada++;
    }
    M.primeiraPintura = {
      mosaicos: tiles.length,
      blur, cor, nada,
      pedidosAteAqui: M.recursos.length,
    };
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(contar, 0));
  } else setTimeout(contar, 0);
})();
`;

/** Percorre a página toda a uma velocidade humana, contando frames perdidos. */
const TRAVESSIA = `
(async () => {
  const PASSO = 900;          // px por salto
  const ESPERA = 260;         // ms entre saltos (~3,4 ecrãs por segundo)
  const frames = [];
  let parar = false;
  const rAF = () => {
    frames.push(performance.now());
    if (!parar) requestAnimationFrame(rAF);
  };
  requestAnimationFrame(rAF);

  let anterior = -1;
  for (let i = 0; i < 400; i++) {
    window.scrollBy(0, PASSO);
    await new Promise((r) => setTimeout(r, ESPERA));
    const y = window.scrollY;
    const fim = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
    if (fim && y === anterior) break;
    anterior = y;
  }
  parar = true;
  await new Promise((r) => setTimeout(r, 400));

  // Frames perdidos: cada intervalo acima de 1,5 frames conta o que falta.
  let perdidos = 0, piorMs = 0;
  for (let i = 1; i < frames.length; i++) {
    const d = frames[i] - frames[i - 1];
    piorMs = Math.max(piorMs, d);
    if (d > 16.7 * 1.5) perdidos += Math.round(d / 16.7) - 1;
  }
  return { frames: frames.length, perdidos, piorMs: Math.round(piorMs) };
})()
`;

/** O estado final: cada imagem com bytes, píxeis servidos e píxeis de exibição. */
const INVENTARIO = `
(() => {
  const dpr = window.devicePixelRatio || 1;
  // A lista do OBSERVADOR, não a de getEntriesByType: é a única completa (ver
  // a nota sobre o tecto de 250 na sonda).
  const recursos = window.__medida.recursos;
  // A PRIMEIRA entrada de cada URL, não a última. Um ficheiro com
  // Cache-Control immutable pedido uma segunda vez produz uma entrada NOVA com
  // transferSize 0 (veio da cache) — guardar a última fazia 361 de 362 fotos
  // aparecerem com zero bytes e o peso da página parecer 20x menor do que é.
  const porUrl = new Map();
  for (const e of recursos) {
    const ja = porUrl.get(e.url);
    if (!ja || (!ja.bytes && e.bytes)) porUrl.set(e.url, e);
  }

  const imgs = [...document.querySelectorAll("img")].map((im) => {
    const r = im.getBoundingClientRect();
    const t = porUrl.get(im.currentSrc) || {};
    const topoNoDoc = r.top + window.scrollY;
    /**
     * A LARGURA SERVIDA VEM DO NOME DO FICHEIRO, NÃO DE naturalWidth.
     *
     * Com um srcset de descritores w, a especificação manda o browser
     * devolver o tamanho intrínseco DIVIDIDO pela densidade que ele próprio
     * calculou (descritor ÷ largura de exibição). Medido: um ficheiro de
     * 1280 px desenhado numa caixa de 412 CSS px devolve naturalWidth = 412 —
     * ou seja, exactamente a largura de exibição, sempre, para qualquer foto.
     * Usar naturalWidth aqui dava um rácio servido/exibido de 1,00 em todo o
     * lado e escondia por completo o desperdício que este ficheiro existe para
     * encontrar.
     *
     * As derivadas chamam-se <chave>-<largura>.webp, portanto a largura real
     * está no nome. Sem nome utilizável, cai-se no naturalWidth (que pelo menos
     * não inventa).
     */
    const m = /-(\\d+)\\.(webp|avif)(\\?|$)/.exec(im.currentSrc || "");
    const servidoW = m ? Number(m[1]) : im.naturalWidth;
    return {
      url: im.currentSrc,
      alt: im.alt || "",
      loading: im.loading,
      fetchPriority: im.fetchPriority,
      decoding: im.decoding,
      servidoW,
      exibidoW: Math.round(r.width),
      exibidoH: Math.round(r.height),
      exibidoWfis: Math.round(r.width * dpr),
      // A regra é em CSS px ("nunca acima de 2x o tamanho de exibição").
      racio: r.width > 0 ? +(servidoW / r.width).toFixed(2) : 0,
      // E o mesmo contra os píxeis FÍSICOS, que é o que decide a nitidez.
      racioFisico: r.width > 0 ? +(servidoW / (r.width * dpr)).toFixed(2) : 0,
      bytes: t.bytes || 0,
      corpo: t.corpo || 0,
      inicio: t.inicio || 0,
      topoNoDoc: Math.round(topoNoDoc),
    };
  });

  let bytesTotais = 0, bytesImagem = 0, pedidos = 0;
  for (const e of recursos) {
    bytesTotais += e.bytes || 0;
    pedidos++;
    if (/\\.(webp|avif|jpe?g|png)(\\?|$)/i.test(e.url) || e.tipo === "img") {
      bytesImagem += e.bytes || 0;
    }
  }
  const nav = performance.getEntriesByType("navigation")[0];
  bytesTotais += (nav && nav.transferSize) || 0;

  return {
    dpr,
    alturaDoc: document.documentElement.scrollHeight,
    imgs,
    bytesTotais,
    bytesImagem,
    pedidos,
    medida: window.__medida,
  };
})()
`;

/**
 * SONDA DE DESCODIFICAÇÃO. Volta a descodificar uma amostra dos ficheiros já
 * servidos, com o CPU estrangulado, e cronometra. createImageBitmap sobre um
 * blob mede a descodificação sozinha, sem rede e sem layout.
 */
const DECODE = `
(async (urls) => {
  const out = [];
  for (const u of urls) {
    try {
      const blob = await (await fetch(u, { cache: "force-cache" })).blob();
      const t0 = performance.now();
      const bm = await createImageBitmap(blob);
      const ms = performance.now() - t0;
      out.push({ url: u, ms: +ms.toFixed(1), w: bm.width, h: bm.height, bytes: blob.size });
      bm.close && bm.close();
    } catch (e) {
      out.push({ url: u, erro: String(e && e.message) });
    }
  }
  return out;
})
`;

/**
 * Antecipação: px entre o pedido de cada foto e a entrada dela no ecrã.
 *
 * E, mais útil do que os píxeis, o TEMPO que esses píxeis compram à velocidade
 * a que se estava a percorrer a página. 1200 px de antecipação parecem
 * generosos até se dividir por 3 400 px/s de scroll: dá 350 ms, e uma foto de
 * 130 KB a 200 KB/s demora 650 ms a chegar. É essa subtracção que produz o
 * buraco cinzento — não a falta de margem.
 */
function calcularAntecipacao(inv, alturaViewport) {
  const y = inv.medida.scrollPorInstante;
  if (!y.length) return [];
  const yEm = (t) => {
    // procura binária pela amostra mais próxima
    let lo = 0,
      hi = y.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (y[m].t < t) lo = m + 1;
      else hi = m;
    }
    return y[lo].y;
  };
  const out = [];
  for (const im of inv.imgs) {
    if (!im.inicio || !im.topoNoDoc) continue;
    const yPedido = yEm(im.inicio);
    // Quando o pedido saiu, o fundo do ecrã estava em yPedido + altura.
    // A distância que faltava até o mosaico assomar é a antecipação.
    out.push({
      url: im.url,
      px: Math.round(im.topoNoDoc - (yPedido + alturaViewport)),
    });
  }
  return out;
}

/** Velocidade média do scroll durante a travessia, em px/s. */
function velocidadeDoScroll(inv) {
  const y = inv.medida.scrollPorInstante;
  if (y.length < 2) return 0;
  let percorrido = 0;
  for (let i = 1; i < y.length; i++) percorrido += Math.abs(y[i].y - y[i - 1].y);
  const segundos = (y[y.length - 1].t - y[0].t) / 1000;
  return segundos > 0 ? Math.round(percorrido / segundos) : 0;
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const kb = (b) => +(b / 1024).toFixed(1);

async function medirPerfil(browser, perfil, url) {
  const ctx = await browser.newContext({ ...perfil.contexto });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", REDE_4G_LENTO);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  // Content-type por URL: é a única forma honesta de dizer o FORMATO servido
  // (a extensão mente quando há negociação de conteúdo).
  const tipos = new Map();
  page.on("response", (r) => {
    const ct = r.headers()["content-type"];
    if (ct) tipos.set(r.url(), ct.split(";")[0]);
  });

  await page.addInitScript(SONDA);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(3500);

  // Uma interação a sério, para o INP ter o que medir.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const alvo = await page.$('[data-tile-idx="1"], .g-tile, main button');
  if (alvo) {
    await alvo.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
  }

  const scroll = await page.evaluate(TRAVESSIA);
  const inv = await page.evaluate(INVENTARIO);

  // TBT: o que passa dos 50 ms em cada tarefa longa, até ao fim do carregamento.
  const tbt = inv.medida.longas.reduce((s, t) => s + Math.max(0, t.dur - 50), 0);

  const alturaViewport = perfil.contexto.viewport?.height ?? 852;
  const antecip = calcularAntecipacao(inv, alturaViewport);

  // Descodificação: 12 ficheiros distintos, dos maiores servidos.
  const amostra = [...new Set(inv.imgs.map((i) => i.url).filter(Boolean))].slice(0, 12);
  const decode = await page.evaluate(`(${DECODE})(${JSON.stringify(amostra)})`);

  for (const im of inv.imgs) im.formato = tipos.get(im.url) || "?";

  await ctx.close();

  const comBytes = inv.imgs.filter((i) => i.bytes > 0);
  const racios = inv.imgs.filter((i) => i.racio > 0).map((i) => i.racio);
  const decodeMs = decode.filter((d) => d.ms).map((d) => d.ms);
  const antecipPx = antecip.map((a) => a.px);
  const velocidade = velocidadeDoScroll(inv);
  const antecipMs = velocidade > 0 ? Math.round((pct(antecipPx, 50) / velocidade) * 1000) : 0;

  return {
    perfil: perfil.nome,
    lcp: Math.round(inv.medida.lcp),
    fcp: Math.round(inv.medida.fcp),
    cls: +inv.medida.cls.toFixed(4),
    inp: Math.round(inv.medida.inp),
    tbt: Math.round(tbt),
    pedidos: inv.pedidos,
    bytesTotais: inv.bytesTotais,
    bytesImagem: inv.bytesImagem,
    imagensNoDom: inv.imgs.length,
    imagensComBytes: comBytes.length,
    eager: inv.imgs.filter((i) => i.loading === "eager").length,
    lazy: inv.imgs.filter((i) => i.loading === "lazy").length,
    formatos: inv.imgs.reduce((m, i) => ((m[i.formato] = (m[i.formato] || 0) + 1), m), {}),
    larguraServida: inv.imgs.reduce((m, i) => ((m[i.servidoW] = (m[i.servidoW] || 0) + 1), m), {}),
    racioMediano: pct(racios, 50),
    racioP95: pct(racios, 95),
    acimaDe2x: inv.imgs.filter((i) => i.racio > 2).length,
    kbMedianoPorFoto: kb(
      pct(
        comBytes.map((i) => i.bytes),
        50,
      ),
    ),
    kbP95PorFoto: kb(
      pct(
        comBytes.map((i) => i.bytes),
        95,
      ),
    ),
    acimaDe120kb: comBytes.filter((i) => i.bytes > 120 * 1024).length,
    decodeMedianoMs: pct(decodeMs, 50),
    decodeP95Ms: pct(decodeMs, 95),
    decode,
    antecipacaoMedianaPx: pct(antecipPx, 50),
    antecipacaoP10Px: pct(antecipPx, 10),
    antecipacaoNegativas: antecipPx.filter((p) => p < 0).length,
    antecipacaoTotal: antecipPx.length,
    velocidadeScrollPxS: velocidade,
    antecipacaoMedianaMs: antecipMs,
    primeiraPintura: inv.medida.primeiraPintura,
    scroll,
    alturaDoc: inv.alturaDoc,
    imgs: inv.imgs,
  };
}

const browser = await chromium.launch();
// O português é o idioma por omissão e vive SEM prefixo: `/pt/galeria`
// responde 308 para `/galeria`. Medir a partir do redireccionamento juntava o
// custo dele a todos os números.
const url = `${BASE}/galeria`;
const resultados = [];
for (const perfil of PERFIS) {
  if (SO_PERFIL && perfil.nome !== SO_PERFIL) continue;
  process.stderr.write(`\n▶ ${perfil.nome} — ${url}\n`);
  resultados.push(await medirPerfil(browser, perfil, url));
}
await browser.close();

for (const r of resultados) {
  console.log(`\n═══ ${r.perfil.toUpperCase()} ═══`);
  console.log(
    `LCP ${r.lcp} ms · FCP ${r.fcp} ms · CLS ${r.cls} · INP ${r.inp} ms · TBT ${r.tbt} ms`,
  );
  console.log(
    `Peso ${kb(r.bytesTotais)} KB (imagens ${kb(r.bytesImagem)} KB) em ${r.pedidos} pedidos`,
  );
  console.log(`Imagens no DOM ${r.imagensNoDom} · eager ${r.eager} · lazy ${r.lazy}`);
  if (r.primeiraPintura) {
    const p = r.primeiraPintura;
    console.log(
      `Primeira pintura: ${p.mosaicos} mosaicos · blur ${p.blur} · só cor ${p.cor} · ` +
        `nada ${p.nada} · ${p.pedidosAteAqui} pedidos já feitos`,
    );
  }
  console.log(`Formatos: ${JSON.stringify(r.formatos)}`);
  console.log(
    `Rácio servido/exibido: mediana ${r.racioMediano}× · p95 ${r.racioP95}× · acima de 2×: ${r.acimaDe2x}`,
  );
  console.log(
    `KB por foto: mediana ${r.kbMedianoPorFoto} · p95 ${r.kbP95PorFoto} · acima de 120 KB: ${r.acimaDe120kb}`,
  );
  console.log(`Descodificação: mediana ${r.decodeMedianoMs} ms · p95 ${r.decodeP95Ms} ms`);
  console.log(
    `ANTECIPAÇÃO: mediana ${r.antecipacaoMedianaPx} px (= ${r.antecipacaoMedianaMs} ms a ` +
      `${r.velocidadeScrollPxS} px/s) · p10 ${r.antecipacaoP10Px} px · ` +
      `negativas ${r.antecipacaoNegativas}/${r.antecipacaoTotal}`,
  );
  console.log(
    `Scroll: ${r.scroll.perdidos} frames perdidos em ${r.scroll.frames} · pior intervalo ${r.scroll.piorMs} ms`,
  );
  console.log(`Documento: ${r.alturaDoc} px`);
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(resultados, null, 1));
  process.stderr.write(`\n→ ${JSON_OUT}\n`);
}
