/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDE O LCP DAS LANDING PAGES DE CAMPANHA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/medir-lcp-landing.mjs [url-base]
 *
 * Foi pedido "LCP abaixo de 2s em todas estas páginas. Mede e prova." Isto é a
 * prova, e o número que ela vai ler não pode ser optimista sem o dizer.
 *
 * ── PORQUE É QUE O LCP IMPORTA NUMA PÁGINA PAGA ───────────────────────────
 * O Índice de Qualidade da Google inclui a experiência da página de destino. Um
 * Índice de Qualidade mais baixo faz subir o custo por clique de TODA a
 * campanha, não só o daquele anúncio. Numa conta de 50 €/mês, 20% a mais por
 * clique é um quinto dos cliques a menos — a diferença entre 83 e 66 visitas.
 *
 * ── AS CONDIÇÕES DA MEDIÇÃO, ditas à partida ──────────────────────────────
 * Corre em Chromium local contra `next start` na mesma máquina. Isso quer dizer
 * REDE ZERO e servidor sem latência: os números aqui são o melhor caso, o piso
 * absoluto do que a página consegue. Para o aproximar do telemóvel de um
 * visitante real aplica-se estrangulamento de CPU (4x) e de rede (perfil
 * próximo de 4G lento), que é o que o Lighthouse mobile faz.
 *
 * Os dois números são impressos. O primeiro diz se a página está bem
 * construída; o segundo é o que se parece com a vida real.
 */

import { chromium } from "playwright";

const BASE = process.argv[2] || "http://127.0.0.1:3123";

const PAGINAS = [
  "/casamentos/alentejo",
  "/casamentos/lisboa",
  "/casamentos/algarve",
  "/casamentos/porto-douro",
  "/casamentos/minho",
  "/casamentos/centro",
  "/casamentos/madeira",
  "/casamentos/acores",
  "/casamentos/estilo/minimalista",
  "/casamentos/estilo/boho",
  "/casamentos/estilo/campo",
  "/casamentos/destination",
  "/en/casamentos/destination",
  "/en/casamentos/alentejo",
];

/** Perfil de rede próximo de 4G lento, que é o que o Lighthouse mobile usa. */
const REDE_LENTA = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

async function medir(browser, caminho, { estrangular }) {
  const contexto = await browser.newContext({
    viewport: estrangular ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: estrangular ? 3 : 1,
    userAgent: estrangular
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const pagina = await contexto.newPage();

  // O observador tem de estar instalado ANTES de a navegação começar, senão
  // perde-se a entrada de LCP — que é emitida muito cedo.
  await pagina.addInitScript(() => {
    window.__lcp = 0;
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) window.__lcp = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });

  if (estrangular) {
    const cdp = await contexto.newCDPSession(pagina);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", REDE_LENTA);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }

  await pagina.goto(`${BASE}${caminho}`, { waitUntil: "load", timeout: 60000 });
  // O LCP só é definitivo quando o utilizador interage ou a página é escondida.
  // Espera-se um pouco para apanhar uma imagem que chegue depois do `load`.
  await pagina.waitForTimeout(estrangular ? 2500 : 1200);
  const lcp = await pagina.evaluate(() => window.__lcp);
  const elemento = await pagina.evaluate(() => {
    const entradas = performance.getEntriesByType("largest-contentful-paint");
    const ultima = entradas[entradas.length - 1];
    if (!ultima) return "";
    const el = ultima.element;
    return el
      ? `${el.tagName.toLowerCase()}${el.className ? "." + String(el.className).split(" ")[0] : ""}`
      : "";
  });

  await contexto.close();
  return { lcp, elemento };
}

const LIMITE_MS = 2000;

async function main() {
  // O ambiente traz o Chromium numa pasta própria e a versão empacotada com
  // este @playwright/test não é a que lá está. Aponta-se ao executável em vez
  // de descarregar outro — `playwright install` está desligado de propósito.
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const linhas = [];
  let piorRapido = 0;
  let piorLento = 0;

  for (const caminho of PAGINAS) {
    const rapido = await medir(browser, caminho, { estrangular: false });
    const lento = await medir(browser, caminho, { estrangular: true });
    piorRapido = Math.max(piorRapido, rapido.lcp);
    piorLento = Math.max(piorLento, lento.lcp);
    linhas.push({ caminho, rapido: rapido.lcp, lento: lento.lcp, elemento: rapido.elemento });
  }
  await browser.close();

  const larg = Math.max(...PAGINAS.map((p) => p.length));
  console.log(
    `${"página".padEnd(larg)}  ${"LCP desktop".padStart(12)}  ${"LCP 4G+CPU4x".padStart(13)}  elemento`,
  );
  for (const l of linhas) {
    console.log(
      `${l.caminho.padEnd(larg)}  ${(l.rapido.toFixed(0) + " ms").padStart(12)}  ` +
        `${(l.lento.toFixed(0) + " ms").padStart(13)}  ${l.elemento}`,
    );
  }
  console.log("");
  console.log(`pior caso desktop:      ${piorRapido.toFixed(0)} ms`);
  console.log(`pior caso 4G + CPU 4x:  ${piorLento.toFixed(0)} ms`);
  console.log(`limite pedido:          ${LIMITE_MS} ms`);

  if (piorLento > LIMITE_MS) {
    console.log("");
    console.log(
      "FALHA: alguma página passa dos 2 s na condição estrangulada. O Índice de " +
        "Qualidade da Google penaliza isto, e uma página de destino lenta faz subir " +
        "o custo por clique de toda a campanha.",
    );
    process.exit(1);
  }
  console.log("");
  console.log("OK: todas as páginas abaixo dos 2 s nas duas condições.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
