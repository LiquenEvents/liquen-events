/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDE A PÁGINA DE ENTRADA DO BACK OFFICE — LCP, CONTRASTE E RETRATO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   npm run build && npx next start -p 3177
 *   node scripts/medir-entrada-admin.mjs --etiqueta=depois
 *
 * ATENÇÃO ao servidor: com `output: "standalone"` no next.config.ts o
 * `next start` recusa-se a arrancar («does not work with output: standalone») e
 * é preciso `node .next/standalone/server.js` — que, nessa forma, também
 * precisa que lhe copiem `.next/static` e `public/_img` para dentro, senão
 * responde 500 aos chunks e 404 às fotografias. Se o servidor não estiver bom,
 * isto NÃO imprime números a fingir: o `confirmarQueEAEntrada` rebenta.
 *
 * PORQUE EXISTE. A página de entrada passou a ter uma fotografia de casamento
 * em metade do ecrã. Uma fotografia grande numa página de entrada é a maneira
 * mais fácil de estragar duas coisas ao mesmo tempo: o tempo até a página
 * aparecer (LCP) e a legibilidade do texto branco que assenta por cima dela.
 * Nenhuma das duas se julga a olho, por isso mede-se aqui, com o mesmo método
 * do `scripts/medir-lcp-landing.mjs` (que já é o método da casa).
 *
 * O QUE MEDE
 *   1. LCP em secretária (1440x900, sem estrangulamento) e em telemóvel
 *      (390x844, DPR 3, CPU 4x, perfil de rede próximo de 4G lento), como
 *      MEDIANA de várias corridas, com o elemento responsável identificado e a
 *      repartição (ttfb / html / fcp / quando a imagem chegou) ao lado — sem
 *      ela não se sabe se a culpa é da fotografia ou do caminho de render.
 *   2. CONTRASTE do texto branco sobre CADA UMA das fotografias da rotação.
 *      Não pergunta ao CSS: tira uma captura do painel já composto (fotografia
 *      + tinta + véu) COM AS LETRAS ESCONDIDAS, e percorre os píxeis do fundo
 *      por baixo delas, ficando com o MAIS CLARO — o pior caso possível para
 *      texto branco. O rácio é o da WCAG 2.x: (L+0.05) do claro sobre (L+0.05)
 *      do escuro.
 *   3. Quanto do formulário cabe acima da dobra, que numa página de ENTRADA
 *      conta tanto como o LCP.
 *   4. Capturas de ecrã de secretária e de telemóvel, para se ver com os olhos.
 *
 * ANTES DE MEDIR, confirma que a página é mesmo a página de entrada. Já mediu
 * outra coisa sem dar por isso — ver `confirmarQueEAEntrada`.
 *
 * AS CONDIÇÕES, ditas à partida: Chromium local contra um servidor na mesma
 * máquina. Rede zero e servidor sem latência, ou seja o piso absoluto. É por
 * isso que a coluna estrangulada existe: é a que se parece com a vida real.
 */
import { chromium } from "playwright";
import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const args = process.argv.slice(2);
const opt = (nome, omissao) => {
  const a = args.find((x) => x.startsWith(`--${nome}=`));
  return a ? a.slice(nome.length + 3) : omissao;
};

const BASE = opt("url", "http://127.0.0.1:3177");
const ETIQUETA = opt("etiqueta", "medicao");
const CAMINHO = opt("caminho", "/orcamento/admin");
/**
 * Quantas vezes se mede cada cenário. UMA medição não é uma medição: em
 * corridas seguidas do MESMO build o LCP de secretária deu 260, 280, 472, 492 e
 * 532 ms — 2x de diferença sem uma linha de código mudar. Com a mediana de
 * várias, a comparação antes/depois passa a dizer alguma coisa.
 */
const REPETICOES = Number(opt("repeticoes", "5"));
/**
 * ── PORQUE É QUE ISTO NÃO ESCREVE EM `test-results/` ──────────────────────
 * Escrevia, e as capturas desapareciam. `test-results/` é a pasta de saída do
 * Playwright (`playwright.config.ts` não define `outputDir`, portanto é a de
 * omissão) e o Playwright APAGA-A INTEIRA no arranque de cada corrida. Ou seja:
 * bastava alguém correr `npm run test:e2e` — noutra frente, noutro terminal,
 * sem nada a ver com isto — para as capturas que se acabaram de tirar deixarem
 * de existir. Aconteceu duas vezes, e da segunda já depois de terem sido dadas
 * como entregues.
 *
 * Uma medição serve para se olhar para ela mais tarde; guardá-la na pasta de
 * rascunho de outra ferramenta é guardá-la em cima da mesa da cozinha. Estas
 * ficam em `medicoes/`, que é só desta família de scripts (e está no
 * .gitignore: são artefactos, não código).
 */
const SAIDA = path.join(process.cwd(), "medicoes", "entrada-admin");

/** Perfil de rede próximo de 4G lento, o mesmo que o Lighthouse mobile usa. */
const REDE_LENTA = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

/** As quatro fotografias da rotação, por chave de ficheiro pré-gerado. */
const FOTOS = ["20_10_2025_0244", "DaniGui_JantarFesta_39", "hd-edited", "ines-goncalo-282"];

// ── Luminância e contraste (WCAG 2.x) ──────────────────────────────────────
function canalLinear(v) {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminancia(r, g, b) {
  return 0.2126 * canalLinear(r) + 0.7152 * canalLinear(g) + 0.0722 * canalLinear(b);
}
/** Rácio de contraste entre uma luminância e o branco puro (L = 1). */
function contrasteComBranco(L) {
  return 1.05 / (L + 0.05);
}

/** Mediana (e não média): uma corrida lenta isolada não arrasta o resultado. */
function mediana(valores) {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

async function novoContexto(browser, { movel }) {
  const contexto = await browser.newContext({
    viewport: movel ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: movel ? 3 : 1,
    userAgent: movel
      ? "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"
      : undefined,
  });
  const pagina = await contexto.newPage();
  // O observador tem de estar instalado ANTES da navegação: a entrada de LCP é
  // emitida muito cedo e, instalado depois, perdia-se.
  await pagina.addInitScript(() => {
    window.__lcp = 0;
    window.__lcpEl = "";
    new PerformanceObserver((lista) => {
      for (const e of lista.getEntries()) {
        window.__lcp = e.startTime;
        /**
         * A IDENTIDADE DO ELEMENTO É GUARDADA AQUI, no momento em que a entrada
         * é emitida — e não lida depois com `getEntriesByType`.
         *
         * Estava a ser lida no fim, e vinha sempre vazia: as entradas de
         * `largest-contentful-paint` não ficam no buffer que o
         * `getEntriesByType` devolve, portanto `entradas[…]` era `undefined` e
         * a coluna do elemento saía em branco nas duas colunas da tabela. Sem
         * ela, uma medição de LCP não diz o que é preciso saber — QUAL é o
         * elemento a mandar no número — e é exactamente isso que decide se a
         * culpa é da fotografia ou do cartão.
         */
        const el = e.element;
        if (el) {
          const nome = el.tagName.toLowerCase();
          // Dizer se o elemento é (ou está dentro) do painel da fotografia é
          // metade da resposta: separa "a fotografia atrasou a página" de "a
          // página já era assim".
          const noPainel = el.closest?.("[data-painel-foto]") ? " (painel da foto)" : "";
          const detalhe =
            nome === "img" ? ` ${(el.currentSrc || el.src || "").split("/").pop()}` : "";
          window.__lcpEl = `${nome}${detalhe}${noPainel}`;
        }
      }
    }).observe({ type: "largest-contentful-paint", buffered: true });
  });
  return { contexto, pagina };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CONFIRMAR QUE A PÁGINA MEDIDA É A PÁGINA DE ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Esta medição correu, deu números com ar de bons, e não era a
 * página de entrada que estava a ser medida: outra pessoa tinha um `next build`
 * a correr na mesma árvore, o `.next` foi reescrito por baixo do `next start`
 * em pé, e o servidor passou a devolver uma página diferente — as capturas
 * saíram com uma fotografia de um casamento a ocupar o ecrã todo, sem cartão de
 * entrada nenhum, e a tabela do LCP continuou a imprimir-se como se nada fosse.
 *
 * Uma medição que não sabe dizer se mediu a coisa certa é pior do que nenhuma:
 * dá confiança a um número inventado. Isto falha alto em vez de imprimir.
 */
async function confirmarQueEAEntrada(pagina) {
  const marcas = await pagina.evaluate(() => ({
    titulo: !!document.querySelector("h1"),
    tituloTexto: document.querySelector("h1")?.textContent?.trim() ?? "",
    botao: !!document.querySelector('button[type="submit"]'),
    palavraPasse: !!document.querySelector('input[type="password"]'),
  }));
  if (!marcas.botao || !marcas.palavraPasse) {
    throw new Error(
      `medir-entrada-admin: ${CAMINHO} não é a página de entrada ` +
        `(h1="${marcas.tituloTexto}", botão=${marcas.botao}, palavra-passe=${marcas.palavraPasse}). ` +
        `A causa habitual é um \`next build\` a correr na mesma árvore enquanto o ` +
        `\`next start\` está em pé: reconstrói, arranca o servidor outra vez e repete.`,
    );
  }
}

async function medirLcp(browser, { movel, estrangular }) {
  const { contexto, pagina } = await novoContexto(browser, { movel });
  if (estrangular) {
    const cdp = await contexto.newCDPSession(pagina);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", REDE_LENTA);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });
  }
  await pagina.goto(`${BASE}${CAMINHO}`, { waitUntil: "load", timeout: 60000 });
  // O LCP só é definitivo quando há interacção ou a página é escondida. Espera
  // um pouco para apanhar uma imagem que chegue depois do `load`.
  await pagina.waitForTimeout(estrangular ? 2500 : 1200);
  await confirmarQueEAEntrada(pagina);
  const lcp = await pagina.evaluate(() => window.__lcp);
  const elemento = await pagina.evaluate(() => window.__lcpEl);
  /**
   * ── A REPARTIÇÃO, sem a qual o número do LCP não se sabe atacar ───────────
   * Um LCP de 1,3 s pode ser 1,2 s de caminho crítico (HTML + CSS + fonte, com
   * a imagem a chegar em cima da hora) ou 0,3 s de caminho e 1 s de bytes de
   * fotografia. São problemas diferentes e a cura de um não serve para o outro:
   * no primeiro caso encolher a fotografia não muda nada. Isto diz qual é.
   */
  const reparticao = await pagina.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const alvo = window.__lcpEl.split(" ")[1];
    const rec = alvo
      ? performance.getEntriesByType("resource").find((r) => r.name.includes(alvo))
      : null;
    return {
      ttfb: nav ? Math.round(nav.responseStart) : null,
      htmlPronto: nav ? Math.round(nav.responseEnd) : null,
      fcp: fcp ? Math.round(fcp.startTime) : null,
      imgInicio: rec ? Math.round(rec.startTime) : null,
      imgFim: rec ? Math.round(rec.responseEnd) : null,
      imgBytes: rec ? rec.encodedBodySize : null,
    };
  });
  await contexto.close();
  return { lcp, elemento, reparticao };
}

async function capturar(browser, { movel, nome }) {
  const { contexto, pagina } = await novoContexto(browser, { movel });
  await pagina.goto(`${BASE}${CAMINHO}`, { waitUntil: "load", timeout: 60000 });
  await pagina.waitForTimeout(1200);
  await confirmarQueEAEntrada(pagina);
  const ficheiro = path.join(SAIDA, `${ETIQUETA}-${nome}.png`);
  await pagina.screenshot({ path: ficheiro });
  // Quanto do formulário cabe acima da dobra: numa página de entrada isto é
  // tão importante como o LCP, e é a única coisa que a captura não diz.
  const dobra = await pagina.evaluate(() => {
    const botao = document.querySelector('button[type="submit"]');
    if (!botao) return null;
    const r = botao.getBoundingClientRect();
    return { fundoDoBotao: Math.round(r.bottom), altura: window.innerHeight };
  });
  await contexto.close();
  return { ficheiro, dobra };
}

/**
 * Contraste do texto branco sobre cada fotografia.
 *
 * Troca as fontes do `<picture>` à mão em vez de acrescentar um botão de
 * depuração ao código de produção: a rotação escolhe UMA fotografia por dia, e
 * medir só a de hoje não responde à pergunta ("as quatro estão legíveis?").
 *
 * ── O QUE SE MEDE, E O ERRO QUE ISTO JÁ TEVE ──────────────────────────────
 * Mede-se o FUNDO por baixo das letras: fotografia + tinta de coesão + véu,
 * composto pelo browser, sem as letras lá.
 *
 * A primeira versão fotografava a faixa de baixo do painel COM o texto branco
 * desenhado por cima e ficava com o pixel mais claro. O pixel mais claro era,
 * invariavelmente, uma LETRA — branco puro — e as quatro fotografias davam
 * 1,00:1. Não era o véu a falhar: era a régua a medir-se a si própria. Um
 * número que não pode variar não é uma medição.
 *
 * A correcção é esconder o texto com `visibility: hidden`, que o tira da
 * pintura mas LHE MANTÉM A CAIXA, e depois percorrer só os píxeis dentro dessa
 * caixa. É a definição do que a WCAG pede: a luminância contra a qual as letras
 * assentam.
 */
async function medirContraste(browser) {
  const { contexto, pagina } = await novoContexto(browser, { movel: false });
  await pagina.goto(`${BASE}${CAMINHO}`, { waitUntil: "load", timeout: 60000 });
  await confirmarQueEAEntrada(pagina);
  const painel = await pagina.$("[data-painel-foto]");
  if (!painel) {
    await contexto.close();
    return [];
  }
  /**
   * ── PORQUE É QUE OS ORIGINAIS SÃO GUARDADOS ANTES DA PRIMEIRA TROCA ───────
   * A troca era feita SOBRE o que estivesse no `srcset` naquele momento, com
   * uma expressão que apanhava a chave como "tudo até ao primeiro hífen"
   * (`[^-]+`). Duas das quatro fotografias TÊM hífen no nome — `hd-edited` e
   * `ines-goncalo-282` — portanto, assim que uma delas entrava, a expressão
   * deixava de encontrar seja o que fosse e as trocas seguintes não faziam
   * nada. O resultado era uma tabela que parecia boa e mentia: a linha do
   * `ines-goncalo-282` trazia, na verdade, os números do `hd-edited` (as duas
   * linhas saíam com valores idênticos — 10,88:1 e 17,68:1 — que foi o que deu
   * o erro a ver).
   *
   * Guardando os `srcset` originais UMA vez e derivando cada troca a partir
   * deles, o nome da chave deixa de ter de obedecer a uma forma qualquer.
   */
  const original = await pagina.evaluate(() => {
    const p = document.querySelector("[data-painel-foto] picture");
    const img = p.querySelector("img");
    const m = (img.getAttribute("src") || "").match(/\/_img\/g\/(.+)-\d+\.(?:avif|webp)$/);
    return {
      chave: m ? m[1] : null,
      fontes: [...p.querySelectorAll("source")].map((s) => s.srcset),
      src: img.getAttribute("src"),
    };
  });
  if (!original.chave) {
    await contexto.close();
    throw new Error("medir-entrada-admin: não consegui ler a chave da fotografia do painel");
  }

  const linhas = [];
  for (const chave of FOTOS) {
    await pagina.evaluate(
      ({ k, orig }) => {
        const p = document.querySelector("[data-painel-foto] picture");
        if (!p) return;
        const trocar = (s) => s.split(`/_img/g/${orig.chave}-`).join(`/_img/g/${k}-`);
        p.querySelectorAll("source").forEach((s, i) => {
          s.srcset = trocar(orig.fontes[i]);
        });
        const img = p.querySelector("img");
        if (img) img.src = trocar(orig.src);
      },
      { k: chave, orig: original },
    );
    // `complete && naturalWidth` não chega: quando a troca é para a fotografia
    // que JÁ lá estava, ambos são verdade no instante seguinte e a espera passa
    // sem que o browser tenha trocado nada. Confirma-se pelo `currentSrc`.
    await pagina.waitForFunction(
      (k) => {
        const img = document.querySelector("[data-painel-foto] picture img");
        return img && img.complete && img.naturalWidth > 0 && img.currentSrc.includes(`/${k}-`);
      },
      chave,
      { timeout: 20000 },
    );
    await pagina.waitForTimeout(250);

    /**
     * Esperar que a SAUDAÇÃO esteja escrita antes de medir. Ela só aparece
     * depois de hidratar (é assim que se evita o erro de hidratação — ver o
     * componente), e medir antes disso dava uma caixa de texto com a altura de
     * uma linha em branco, ou seja a janela errada.
     */
    await pagina
      .waitForFunction(
        () => {
          const p = document.querySelector("[data-painel-foto] p");
          return p && p.textContent.trim().length > 0;
        },
        { timeout: 10000 },
      )
      .catch(() => {});

    // A captura COM texto, que é a que se olha com os olhos.
    await pagina.screenshot({ path: path.join(SAIDA, `${ETIQUETA}-foto-${chave}.png`) });

    /**
     * Esconder as letras (sem lhes mexer na caixa) e devolver a caixa que elas
     * ocupam, em coordenadas do PAINEL. É essa a região a percorrer.
     */
    const caixaDoTexto = await pagina.evaluate(() => {
      const painelEl = document.querySelector("[data-painel-foto]");
      const textos = painelEl.querySelectorAll("p");
      if (!textos.length) return null;
      const rp = painelEl.getBoundingClientRect();
      let x0 = Infinity,
        y0 = Infinity,
        x1 = -Infinity,
        y1 = -Infinity;
      for (const t of textos) {
        const r = t.getBoundingClientRect();
        // Uma linha vazia (a saudação antes de hidratar) não conta.
        if (r.width < 1 || r.height < 1) continue;
        x0 = Math.min(x0, r.left - rp.left);
        y0 = Math.min(y0, r.top - rp.top);
        x1 = Math.max(x1, r.right - rp.left);
        y1 = Math.max(y1, r.bottom - rp.top);
        t.style.visibility = "hidden";
      }
      if (!Number.isFinite(x0)) return null;
      return { x: x0, y: y0, largura: x1 - x0, altura: y1 - y0 };
    });

    const caixa = await painel.boundingBox();
    const bruto = await painel.screenshot();
    await pagina.evaluate(() => {
      for (const t of document.querySelectorAll("[data-painel-foto] p")) t.style.visibility = "";
    });

    const { data, info } = await sharp(bruto).raw().toBuffer({ resolveWithObject: true });
    /**
     * A janela a percorrer. Sem caixa de texto (não devia acontecer) cai-se nos
     * 22% de baixo do painel, que é onde o véu está no seu patamar — é o mesmo
     * sítio, só que menos preciso.
     */
    const escala = caixa ? info.width / caixa.width : 1;
    const jan = caixaDoTexto
      ? {
          x0: Math.max(0, Math.floor(caixaDoTexto.x * escala)),
          y0: Math.max(0, Math.floor(caixaDoTexto.y * escala)),
          x1: Math.min(info.width, Math.ceil((caixaDoTexto.x + caixaDoTexto.largura) * escala)),
          y1: Math.min(info.height, Math.ceil((caixaDoTexto.y + caixaDoTexto.altura) * escala)),
        }
      : { x0: 0, y0: Math.floor(info.height * 0.78), x1: info.width, y1: info.height };

    // Guarda-se o pixel MAIS CLARO da janela, não a média: a média esconde
    // exactamente o pixel que faz a letra desaparecer.
    let pior = 0;
    let somaL = 0;
    let n = 0;
    for (let y = jan.y0; y < jan.y1; y++) {
      for (let x = jan.x0; x < jan.x1; x++) {
        const i = (y * info.width + x) * info.channels;
        const L = luminancia(data[i], data[i + 1], data[i + 2]);
        if (L > pior) pior = L;
        somaL += L;
        n++;
      }
    }
    linhas.push({
      chave,
      piorRacio: contrasteComBranco(pior),
      medioRacio: contrasteComBranco(somaL / n),
      caixa: caixa ? `${Math.round(caixa.width)}x${Math.round(caixa.height)}` : "",
    });
  }
  await contexto.close();
  return linhas;
}

async function main() {
  await fs.mkdir(SAIDA, { recursive: true });
  // O ambiente traz o Chromium numa pasta própria; aponta-se ao executável em
  // vez de descarregar outro (`playwright install` está desligado).
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });

  const repetir = async (opcoes) => {
    const corridas = [];
    for (let i = 0; i < REPETICOES; i++) corridas.push(await medirLcp(browser, opcoes));
    const lcps = corridas.map((c) => c.lcp);
    return {
      lcp: mediana(lcps),
      min: Math.min(...lcps),
      max: Math.max(...lcps),
      elemento: corridas[corridas.length - 1].elemento,
      reparticao: corridas[corridas.length - 1].reparticao,
      fcp: mediana(corridas.map((c) => c.reparticao.fcp ?? 0)),
    };
  };
  const secretaria = await repetir({ movel: false, estrangular: false });
  const telemovel = await repetir({ movel: true, estrangular: true });
  const capSec = await capturar(browser, { movel: false, nome: "secretaria" });
  const capTel = await capturar(browser, { movel: true, nome: "telemovel" });
  const contrastes = await medirContraste(browser);

  await browser.close();

  console.log(`\n── LCP (${ETIQUETA}) ─────────────────────────────────────────`);
  console.log(`mediana de ${REPETICOES} corridas; [min-max] ao lado\n`);
  for (const [nome, m] of [
    ["secretaria 1440x900         ", secretaria],
    ["telemovel 390x844 4G CPU 4x ", telemovel],
  ]) {
    console.log(
      `${nome} ${String(m.lcp.toFixed(0)).padStart(5)} ms  ` +
        `[${m.min.toFixed(0)}-${m.max.toFixed(0)}]  fcp ${String(m.fcp.toFixed(0)).padStart(5)} ms   ${m.elemento}`,
    );
  }

  console.log(`\n── Repartição do LCP ────────────────────────────────────────`);
  console.log(`${"".padEnd(12)}  ttfb  htmlFim   fcp   imgInicio  imgFim   bytes`);
  for (const [nome, m] of [
    ["secretaria", secretaria.reparticao],
    ["telemovel", telemovel.reparticao],
  ]) {
    const c = (v) => String(v ?? "-").padStart(6);
    console.log(
      `${nome.padEnd(12)}${c(m.ttfb)}${c(m.htmlPronto)}${c(m.fcp)}${c(m.imgInicio)}${c(m.imgFim)}` +
        `${String(m.imgBytes ?? "-").padStart(9)}`,
    );
  }

  console.log(`\n── Acima da dobra ───────────────────────────────────────────`);
  for (const [nome, c] of [
    ["secretaria", capSec],
    ["telemovel", capTel],
  ]) {
    if (c.dobra) {
      const ok = c.dobra.fundoDoBotao <= c.dobra.altura ? "cabe" : "NAO CABE";
      console.log(
        `${nome.padEnd(12)} botao Entrar acaba a ${c.dobra.fundoDoBotao}px de ${c.dobra.altura}px  ${ok}`,
      );
    }
  }

  if (contrastes.length) {
    console.log(`\n── Contraste do texto branco sobre a fotografia ─────────────`);
    console.log(`${"fotografia".padEnd(24)}  pior pixel   media    painel`);
    for (const l of contrastes) {
      const marca = l.piorRacio >= 4.5 ? "" : "   FALHA (< 4.5:1)";
      console.log(
        `${l.chave.padEnd(24)}  ${(l.piorRacio.toFixed(2) + ":1").padStart(9)}  ` +
          `${(l.medioRacio.toFixed(2) + ":1").padStart(8)}  ${l.caixa}${marca}`,
      );
    }
  }

  console.log(`\ncapturas: ${SAIDA}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
