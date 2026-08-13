/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDE AS PÁGINAS NO BROWSER INTERNO DO INSTAGRAM E DO FACEBOOK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/medir-social.mjs [url-base] [--so-sociais] [--json ficheiro]
 *
 * ── O QUE ISTO MEDE MESMO, E O QUE NÃO MEDE ────────────────────────────────
 * Isto é Chromium. NÃO é o WKWebView do iPhone nem o WebView do Android, e
 * dizer o contrário seria mentir sobre a prova. O que se faz aqui é aproximar
 * o browser interno em CINCO eixos que se conseguem reproduzir com fidelidade,
 * e que são exactamente aqueles onde as páginas costumam partir:
 *
 *   1. AGENTE DE UTILIZADOR — a cadeia real do Instagram e do Facebook. Apanha
 *      qualquer código (nosso ou de terceiros) que fareje o UA e mude de
 *      comportamento. É o eixo mais fiel dos cinco.
 *   2. CPU E REDE — 4x de estrangulamento de CPU e um perfil de 4G lento. O
 *      browser interno corre dentro de uma app que já tem memória e CPU
 *      ocupadas com o feed; é mais lento do que o Safari na mesma máquina, e
 *      medir sem estrangular seria medir outra coisa.
 *   3. ARMAZENAMENTO BLOQUEADO — no perfil `sem-armazenamento` o
 *      localStorage e o sessionStorage LANÇAM em todos os acessos. É o que
 *      acontece de facto em contextos particionados e em modo privado, e é o
 *      caminho de código onde este sítio guarda o consentimento, o
 *      identificador do clique pago e a origem do lead.
 *   4. SEM SERVICE WORKER — o browser interno do iOS não os tem. O perfil
 *      `sem-sw` recusa o registo, para se ver o que é que a página perde.
 *   5. AUTOPLAY SEM GESTO — a política por omissão do Chromium é permissiva.
 *      Aqui liga-se `--autoplay-policy=document-user-activation-required`, que
 *      é a política restritiva, e verifica-se se o vídeo em ciclo arranca à
 *      mesma (tem de arrancar: `muted` + `playsinline` é o que a autoriza).
 *
 * O QUE FICA DE FORA, e é preciso dizê-lo: o WKWebView do iOS tem limites de
 * JIT e de memória próprios, e a app do Instagram desenha a sua própria barra
 * por cima da página. Nada disso se reproduz aqui. Os números são um piso
 * optimista; o telemóvel real é mais lento.
 *
 * ── PORQUE É QUE 2,5 s E NÃO 2 s ──────────────────────────────────────────
 * As páginas do Google Ads têm limite de 2 s (scripts/medir-lcp-landing.mjs)
 * porque o Índice de Qualidade da Google as avalia. A Meta não tem Índice de
 * Qualidade equivalente, e o alvo pedido para o browser interno foi 2,5 s.
 */

import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3123";
const SO_SOCIAIS = process.argv.includes("--so-sociais");
const JSON_OUT = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : "";
})();

/** Alvo pedido para o browser interno da Meta. */
const LIMITE_MS = 2500;

/**
 * Cadeias de agente reais. Copiadas da forma que estas apps emitem: o
 * Instagram acrescenta um bloco `Instagram <versão> (…)` ao fim da cadeia do
 * Safari; o Facebook acrescenta o bloco `[FBAN/FBIOS;…]`.
 */
const UA = {
  safari:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  instagram:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Mobile/15E148 Instagram 336.0.0.32.90 (iPhone14,3; iOS 17_5_1; " +
    "pt_PT; pt; scale=3.00; 1284x2778; 601334835)",
  facebook:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5_1 like Mac OS X) AppleWebKit/605.1.15 " +
    "(KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBDV/iPhone14,3;FBMD/iPhone;FBSN/iOS;" +
    "FBSV/17.5.1;FBSS/3;FBID/phone;FBLC/pt_PT;FBOP/5]",
  instagramAndroid:
    "Mozilla/5.0 (Linux; Android 14; SM-S918B Build/UP1A.231005.007; wv) " +
    "AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.0.0 Mobile Safari/537.36 " +
    "Instagram 336.0.0.32.90 Android (34/14; 480dpi; 1080x2176; samsung; SM-S918B; dm3q; " +
    "qcom; pt_PT; 601334835)",
};

/** Perfil de rede próximo de 4G lento — o mesmo que o Lighthouse mobile usa. */
const REDE_LENTA = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

/** 390x844 — o iPhone que a dona pediu como referência de desenho. */
const ECRA = { width: 390, height: 844 };

const PERFIS = [
  { id: "safari", ua: UA.safari, rotulo: "Safari iOS" },
  { id: "instagram", ua: UA.instagram, rotulo: "Instagram iOS" },
  { id: "facebook", ua: UA.facebook, rotulo: "Facebook iOS" },
  { id: "instagram-android", ua: UA.instagramAndroid, rotulo: "Instagram Android" },
  {
    id: "sem-armazenamento",
    ua: UA.instagram,
    rotulo: "Instagram, armazenamento bloqueado",
    bloquearArmazenamento: true,
  },
  { id: "sem-sw", ua: UA.instagram, rotulo: "Instagram, sem service worker", bloquearSW: true },
];

/**
 * Instalado ANTES de a navegação começar: um observador de LCP e outro de
 * tarefas longas. Se fosse instalado depois perdiam-se as entradas, que são
 * emitidas muito cedo.
 */
function sondas() {
  window.__lcp = 0;
  window.__lcpTag = "";
  window.__tarefasLongas = [];
  window.__erros = [];
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__lcp = e.startTime;
        const el = e.element;
        window.__lcpTag = el
          ? el.tagName.toLowerCase() +
            (el.tagName === "IMG"
              ? ` ${String(el.currentSrc || el.src)
                  .split("/")
                  .pop()}`
              : "")
          : "";
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  } catch {
    /* navegador sem o tipo de entrada — fica a zero e diz-se no relatório */
  }
  try {
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) window.__tarefasLongas.push(e.duration);
    }).observe({ type: "longtask", buffered: true });
  } catch {
    /* idem */
  }
  window.addEventListener("error", (e) => {
    window.__erros.push(String(e.message || e.type).slice(0, 200));
  });
}

/** Faz o localStorage e o sessionStorage lançarem, como num contexto particionado. */
function bloquearArmazenamento() {
  const explodir = () => {
    throw new DOMException("armazenamento bloqueado (simulado)", "SecurityError");
  };
  const falso = {
    getItem: explodir,
    setItem: explodir,
    removeItem: explodir,
    clear: explodir,
    key: explodir,
    get length() {
      return explodir();
    },
  };
  for (const nome of ["localStorage", "sessionStorage"]) {
    try {
      Object.defineProperty(window, nome, { get: () => falso, configurable: true });
    } catch {
      /* já não configurável — o teste desse eixo perde-se, e é dito */
    }
  }
}

/**
 * Remove os service workers, como no browser interno do iOS.
 *
 * APAGA a propriedade do protótipo em vez de a redefinir a `undefined`. A
 * diferença não é cosmética e custou uma medição errada: com um getter que
 * devolve `undefined`, a propriedade CONTINUA a existir, portanto a guarda
 * `"serviceWorker" in navigator` — que o ServiceWorkerRegister deste sítio faz,
 * e bem — passava, e a linha seguinte rebentava. O relatório dizia que o sítio
 * tinha um defeito no browser interno; o defeito era da simulação. O
 * WKWebView não tem lá a propriedade nenhuma, e é isso que isto reproduz.
 */
function bloquearServiceWorker() {
  try {
    delete Navigator.prototype.serviceWorker;
  } catch {
    /* não configurável — o eixo perde-se, e vê-se no `temSW` do relatório */
  }
}

async function medir(browser, caminho, perfil) {
  const contexto = await browser.newContext({
    viewport: ECRA,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent: perfil.ua,
    locale: "pt-PT",
  });

  await contexto.addInitScript(sondas);
  if (perfil.bloquearArmazenamento) await contexto.addInitScript(bloquearArmazenamento);
  if (perfil.bloquearSW) await contexto.addInitScript(bloquearServiceWorker);

  const pagina = await contexto.newPage();

  let bytes = 0;
  let pedidos = 0;
  const porTipo = { documento: 0, js: 0, css: 0, imagem: 0, tipografia: 0, outro: 0 };
  const falhados = [];
  pagina.on("response", (res) => {
    pedidos++;
    if (res.status() >= 400) falhados.push(`${res.status()} ${res.url().slice(0, 120)}`);
  });
  // Pedidos que nem chegaram a ter resposta. NOMEIA o URL: sem isso, um
  // "Failed to load resource" na consola não diz se caiu uma fotografia da
  // página ou um script de terceiros, e a diferença é tudo.
  const naoResolvidos = [];
  pagina.on("requestfailed", (req) => {
    naoResolvidos.push(`${req.failure()?.errorText ?? "?"} ${req.url().slice(0, 140)}`);
  });
  const consola = [];
  pagina.on("console", (m) => {
    if (m.type() === "error") consola.push(m.text().slice(0, 200));
  });
  pagina.on("pageerror", (e) => consola.push(`pageerror: ${String(e.message).slice(0, 200)}`));

  const cdp = await contexto.newCDPSession(pagina);
  await cdp.send("Network.enable");

  // ── Bytes na rede ──────────────────────────────────────────────────────
  // Contados pelo `encodedDataLength` do protocolo, e NÃO pelo cabeçalho
  // `Content-Length`. A primeira versão disto usava o cabeçalho e imprimiu
  // "0 KB de JS, 0 KB de CSS, 0 KB de HTML" em todas as páginas — porque o
  // Next serve o HTML e os pedaços de JS com `Transfer-Encoding: chunked`,
  // que não traz `Content-Length` nenhum. O número que saía não era pequeno,
  // era inventado. `encodedDataLength` é o que passou mesmo pelo fio, já
  // comprimido.
  // `dataReceived` chega por pedaço e `loadingFinished` traz o total do
  // mesmo recurso — somar os dois contaria tudo a dobrar. Guarda-se por
  // pedido e no fim fica-se com o MAIOR dos dois, que é o total real (há
  // recursos em que o `loadingFinished` vem a zero e só os pedaços contam).
  const porPedido = new Map();
  const anota = (id, campo, len) => {
    if (!Number.isFinite(len) || len <= 0) return;
    const r = porPedido.get(id) ?? { tipo: "outro", pedacos: 0, total: 0 };
    if (campo === "pedacos") r.pedacos += len;
    else r.total = Math.max(r.total, len);
    porPedido.set(id, r);
  };
  cdp.on("Network.responseReceived", (e) => {
    const r = porPedido.get(e.requestId) ?? { tipo: "outro", pedacos: 0, total: 0 };
    r.tipo = e.type;
    porPedido.set(e.requestId, r);
  });
  cdp.on("Network.dataReceived", (e) => anota(e.requestId, "pedacos", e.encodedDataLength));
  cdp.on("Network.loadingFinished", (e) => anota(e.requestId, "total", e.encodedDataLength));
  const fecharContas = () => {
    const BALDE = {
      Document: "documento",
      Script: "js",
      Stylesheet: "css",
      Image: "imagem",
      Font: "tipografia",
    };
    for (const r of porPedido.values()) {
      const len = Math.max(r.total, r.pedacos);
      if (len <= 0) continue;
      bytes += len;
      porTipo[BALDE[r.tipo] ?? "outro"] += len;
    }
  };
  await cdp.send("Network.emulateNetworkConditions", REDE_LENTA);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await pagina.goto(`${BASE}${caminho}`, { waitUntil: "load", timeout: 90000 });
  // O LCP só fica definitivo quando há interacção ou a página é escondida.
  // Espera-se para apanhar uma imagem que chegue depois do `load`.
  await pagina.waitForTimeout(2500);

  const r = await pagina.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    return {
      lcp: window.__lcp,
      lcpTag: window.__lcpTag,
      fcp: fcp ? fcp.startTime : 0,
      dcl: nav ? nav.domContentLoadedEventEnd : 0,
      // TBT aproximado: soma do excesso acima de 50 ms de cada tarefa longa
      // observada até aqui. Não é o TBT do Lighthouse (que corta no TTI), é
      // um limite superior — e é assim que deve ser lido.
      tbt: window.__tarefasLongas.reduce((s, d) => s + Math.max(0, d - 50), 0),
      tarefasLongas: window.__tarefasLongas.length,
      erros: window.__erros,
      // O que a página conseguiu mesmo fazer neste contexto.
      temSW: typeof navigator.serviceWorker !== "undefined",
      armazenamentoOk: (() => {
        try {
          localStorage.setItem("__t", "1");
          localStorage.removeItem("__t");
          return true;
        } catch {
          return false;
        }
      })(),
      // Tipografias: a página desenha com as faces certas ou com o recurso?
      fontesCarregadas: document.fonts ? document.fonts.size : -1,
      // Vídeos em ciclo: arrancaram sem gesto?
      videos: Array.from(document.querySelectorAll("video")).map((v) => ({
        pausado: v.paused,
        mudo: v.muted,
        inline: v.hasAttribute("playsinline"),
        prontidao: v.readyState,
      })),
      // Altura da primeira dobra desenhada — para confirmar que há conteúdo
      // no primeiro ecrã e não uma página em branco à espera de hidratar.
      textoNoPrimeiroEcra: (() => {
        let n = 0;
        for (const el of document.querySelectorAll("h1, h2, p, a, button")) {
          const c = el.getBoundingClientRect();
          if (c.top < window.innerHeight && c.bottom > 0 && el.textContent.trim()) n++;
        }
        return n;
      })(),
    };
  });

  fecharContas();
  await contexto.close();
  return { ...r, bytes, porTipo, pedidos, falhados, consola, naoResolvidos };
}

const PAGINAS_GOOGLE = [
  "/casamentos/alentejo",
  "/casamentos/comporta",
  "/casamentos/estilo/boho",
  "/casamentos/destination",
];

/**
 * As variantes sociais, lidas do catálogo para nunca ficarem desalinhadas.
 *
 * O `soEm` TEM de ser respeitado aqui. Sem isso, a primeira corrida deste
 * guião mediu `/s/portugal` em português — uma variante declarada `soEm:
 * "en"`, que responde 404 de propósito — e reportou "LCP 2284 ms, elemento
 * h2, três tipografias abortadas". Estava a medir a página de erro, com toda
 * a seriedade, e a chamar-lhe avaria.
 */
function paginasSociais() {
  try {
    const src = readFileSync(new URL("../src/lib/meta/variantes.ts", import.meta.url), "utf8");
    // Uma entrada por bloco de variante: apanha-se o slug e, dentro do mesmo
    // bloco (até ao slug seguinte), procura-se o `soEm`.
    const blocos = src.split(/^\s{4}slug:\s*"/m).slice(1);
    const paginas = [];
    for (const bloco of blocos) {
      const slug = /^([a-z0-9-]+)"/.exec(bloco)?.[1];
      if (!slug) continue;
      const soEm = /^\s{4}soEm:\s*"(pt|en)"/m.exec(bloco)?.[1];
      const prefixo = soEm === "en" ? "/en" : "";
      // Cada variante gera duas páginas: gancho A (slug) e gancho B (slug-b).
      paginas.push(`${prefixo}/s/${slug}`, `${prefixo}/s/${slug}-b`);
    }
    return paginas;
  } catch {
    return [];
  }
}

async function main() {
  // O ambiente traz o Chromium numa pasta própria; aponta-se ao executável em
  // vez de descarregar outro (`playwright install` está desligado).
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium",
    // A política restritiva: só há autoplay depois de o utilizador interagir
    // com o documento — excepto para vídeo mudo, que é o caso que usamos.
    args: ["--autoplay-policy=document-user-activation-required"],
  });

  const sociais = paginasSociais();
  const paginas = SO_SOCIAIS ? sociais : [...PAGINAS_GOOGLE, ...sociais];
  if (paginas.length === 0) {
    console.log("Nenhuma página para medir.");
    await browser.close();
    return;
  }

  const resultados = [];
  for (const caminho of paginas) {
    for (const perfil of PERFIS) {
      const r = await medir(browser, caminho, perfil);
      resultados.push({ caminho, perfil: perfil.id, rotulo: perfil.rotulo, ...r });
    }
  }
  await browser.close();

  const larg = Math.max(...resultados.map((r) => r.caminho.length), 8);
  const largP = Math.max(...PERFIS.map((p) => p.rotulo.length));
  console.log(
    `${"página".padEnd(larg)}  ${"perfil".padEnd(largP)}  ${"LCP".padStart(8)}  ${"TBT≤".padStart(8)}  ${"KB".padStart(7)}  ${"pedidos".padStart(7)}  elemento do LCP`,
  );
  for (const r of resultados) {
    console.log(
      `${r.caminho.padEnd(larg)}  ${r.rotulo.padEnd(largP)}  ` +
        `${(r.lcp.toFixed(0) + "ms").padStart(8)}  ${(r.tbt.toFixed(0) + "ms").padStart(8)}  ` +
        `${(r.bytes / 1024).toFixed(0).padStart(7)}  ${String(r.pedidos).padStart(7)}  ${r.lcpTag}`,
    );
  }

  // ── Repartição dos bytes, no perfil do Instagram em iOS ──
  console.log("");
  console.log("Bytes por tipo (perfil Instagram iOS), em KB:");
  console.log(
    `${"página".padEnd(larg)}  ${"HTML".padStart(6)}  ${"JS".padStart(6)}  ${"CSS".padStart(6)}  ` +
      `${"imagem".padStart(7)}  ${"fontes".padStart(7)}  ${"total".padStart(7)}`,
  );
  for (const r of resultados.filter((x) => x.perfil === "instagram")) {
    const k = (n) => (n / 1024).toFixed(0);
    console.log(
      `${r.caminho.padEnd(larg)}  ${k(r.porTipo.documento).padStart(6)}  ${k(r.porTipo.js).padStart(6)}  ` +
        `${k(r.porTipo.css).padStart(6)}  ${k(r.porTipo.imagem).padStart(7)}  ` +
        `${k(r.porTipo.tipografia).padStart(7)}  ${k(r.bytes).padStart(7)}`,
    );
  }

  // ── Avarias, que é a parte que interessa a sério ──
  console.log("");
  const avarias = [];
  for (const r of resultados) {
    const onde = `${r.caminho} [${r.rotulo}]`;
    if (r.lcp > LIMITE_MS) avarias.push(`${onde}: LCP ${r.lcp.toFixed(0)} ms > ${LIMITE_MS} ms`);
    if (r.falhados.length) avarias.push(`${onde}: respostas ≥400 → ${r.falhados.join(" | ")}`);
    // Um pedido que não resolve para um host EXTERNO é o ambiente de medição
    // (esta máquina não tem saída livre para a Internet), não um defeito da
    // página. Um pedido próprio que não resolve é um defeito. Separam-se.
    const proprios = r.naoResolvidos.filter((u) => u.includes("127.0.0.1") || u.includes(BASE));
    const alheios = r.naoResolvidos.filter((u) => !proprios.includes(u));
    if (proprios.length)
      avarias.push(`${onde}: pedidos PRÓPRIOS falhados → ${proprios.join(" | ")}`);
    if (alheios.length)
      console.log(`  nota ${onde}: terceiros inacessíveis daqui → ${alheios.join(" | ")}`);
    // "Failed to load resource" é o eco na consola do pedido já classificado
    // acima; contá-lo outra vez daria a mesma avaria duas vezes, uma delas sem
    // dizer de que URL se trata.
    const consolaReal = r.consola.filter((m) => !/Failed to load resource/.test(m));
    if (consolaReal.length) avarias.push(`${onde}: consola → ${consolaReal.join(" | ")}`);
    if (r.textoNoPrimeiroEcra === 0)
      avarias.push(`${onde}: primeiro ecrã sem texto desenhado (página em branco à espera de JS)`);
    for (const v of r.videos) {
      if (v.pausado) avarias.push(`${onde}: vídeo em ciclo NÃO arrancou (mudo=${v.mudo})`);
    }
  }
  if (avarias.length) {
    console.log("AVARIAS:");
    for (const a of avarias) console.log(`  ${a}`);
  } else {
    console.log(`OK: nada abaixo do padrão nos ${resultados.length} pares página × perfil.`);
  }

  if (JSON_OUT) {
    writeFileSync(JSON_OUT, JSON.stringify({ base: BASE, resultados, avarias }, null, 2));
    console.log(`\nJSON em ${JSON_OUT}`);
  }
  if (avarias.length) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
