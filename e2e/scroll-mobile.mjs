/**
 * ARNÊS DE MEDIÇÃO DO SCROLL EM TELEMÓVEL — não corrige nada, só mede.
 *
 * A queixa: "ao fazer scroll no mobile … às vezes fica tudo travado e meio que
 * dá uma travada e vai um pouco para cima na página". São DUAS coisas:
 *   (a) TRAVAR  — a linha principal bloqueia, o scroll fica aos saltos;
 *   (b) RECUAR  — a posição do scroll DIMINUI sozinha.
 *
 * Este ficheiro conduz um Chromium real num viewport de telemóvel, com toque
 * verdadeiro (CDP Input.dispatchTouchEvent: touchStart + touchMove + touchEnd),
 * e mede as duas coisas separadamente, muitas passagens por página, para poder
 * responder a "às vezes" com uma frequência em vez de uma anedota.
 *
 * ATENÇÃO — `Input.synthesizeScrollGesture` NÃO SERVE AQUI. Com
 * `gestureSourceType: "touch"` não mexe a página um único pixel neste Chromium
 * (medido: scrollY 0 depois do gesto, contra 600 px com "default"). Um arnês
 * assente nele mede uma página parada e reporta "zero problemas" — o pior
 * falso negativo possível. Por isso o gesto é montado à mão, e por isso cada
 * passagem regista o `yMax` que alcançou: é a prova, em números, de que a
 * página se mexeu mesmo (ver o resumo — /sobre chega aos 3663 px, que é o fim
 * exacto da página; a galeria passa dos 16 000).
 *
 * O QUE MEDE
 *   • RECUOS: amostra `scrollY` em cada rAF. Como o arnês só manda descer,
 *     QUALQUER descida do valor é espontânea. Cada recuo guarda o contexto do
 *     mesmo instante (altura do documento antes/depois, shifts recentes,
 *     <img> montados/desmontados recentes, marcos que mudaram de sítio).
 *   • FRAMES LONGOS: delta entre rAFs (>50ms, >100ms) + PerformanceObserver
 *     de "longtask".
 *   • LAYOUT SHIFTS: PerformanceObserver de "layout-shift" COM `sources`, que
 *     dizem que elemento se mexeu (tag, classe, data-tile-idx, secção).
 *   • MARCOS (modo --forense): a posição ABSOLUTA de dezenas de elementos é
 *     lida a cada frame; quando um marco muda de sítio sem o utilizador mandar,
 *     é porque algo ACIMA dele mudou de altura — é este o sinal directo do (b).
 *
 * USO
 *   node e2e/scroll-mobile.mjs --url http://127.0.0.1:3000 \
 *        --rotas /galeria,/ --passagens 5 --gestos 40 --cpu 4 --forense \
 *        --saida /tmp/medicao.json --etiqueta HEAD
 *
 *   --rotas todas    lê o sitemap do próprio servidor
 *   --cpu N          estrangula o CPU N vezes (um telemóvel real não é isto)
 *   --rede lenta     4G fraco (1.6 Mbit/s, 150 ms RTT)
 *   --sem-cache      cada passagem com cache fria (o pior caso da dona)
 */

import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";

// ── Argumentos ──────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (nome, omissao = null) => {
  const i = args.indexOf(`--${nome}`);
  return i === -1 ? omissao : args[i + 1];
};
const flag = (nome) => args.includes(`--${nome}`);

const URL_BASE = arg("url", "http://127.0.0.1:3000");
const PASSAGENS = Number(arg("passagens", 5));
const GESTOS = Number(arg("gestos", 40));
const CPU = Number(arg("cpu", 1));
const REDE = arg("rede", "nenhuma");
const FORENSE = flag("forense");
const SEM_CACHE = flag("sem-cache");
const ETIQUETA = arg("etiqueta", "sem-etiqueta");
const SAIDA = arg("saida", null);
const DISPOSITIVO = arg("dispositivo", "Pixel 7");
/**
 * `--sem-ancora` desliga o SCROLL ANCHORING (overflow-anchor: none em tudo).
 *
 * Porquê medir isto e não só o Chrome tal e qual: o anchoring é a rede que
 * ESCONDE uma mudança de altura acima do ecrã — o browser corrige o scrollY
 * para o conteúdo visível ficar no sítio. O Safari do iPhone NÃO IMPLEMENTA
 * scroll anchoring (nenhuma versão), portanto no telemóvel de metade das
 * pessoas essa rede não existe e a mesma mudança de altura vê-se como um salto.
 * Com esta bandeira o Chromium comporta-se como o Safari nesse aspecto, e o
 * mesmo detector mede o sintoma em vez da causa.
 */
const SEM_ANCORA = flag("sem-ancora");
/** `--falhas N`: falha 1 em cada N pedidos a /_img/ (o caminho de re-tentativa
 *  do SafeImage/GalleryImage — desmontar/remontar o <img>). */
const FALHAS = Number(arg("falhas", 0));
/** `--falhar-padrao <regex>`: falha SEMPRE os pedidos cujo URL casa. Serve para
 *  isolar uma imagem concreta (ex.: "logo-liquen-branco", o logótipo do rodapé). */
const FALHAR_PADRAO = arg("falhar-padrao", null);
/** `--auto-teste`: prova de que o detector detecta (ver o uso, no meio da passagem). */
const AUTO_TESTE = flag("auto-teste");
/** Ritmo do dedo: pausa entre swipes (ms) e distância de cada um (fracção do
 *  ecrã). `--pausa 30 --distancia 0.9` é a rajada de quem varre uma galeria. */
const PAUSA = Number(arg("pausa", 170));
const DISTANCIA = Number(arg("distancia", 0.65));
/** Quanto se fica parado no fim da travessia, ainda a medir. Importa: as
 *  re-tentativas de imagem do sítio caem a 600/1800/5400 ms depois do erro, e é
 *  aí — já com o visitante parado no fundo da página — que o scroll recua. */
const ESPERA_FIM = Number(arg("espera-fim", 600));

// ── Instrumentação injectada em cada documento ──────────────────────────────
const SONDA = `
(() => {
  const M = {
    amostras: 0,
    frames: [],        // dt > 50ms
    longtasks: [],
    shifts: [],
    recuos: [],
    imgEventos: [],    // <img> montados/desmontados
    marcos: [],        // marcos que mudaram de posição absoluta
    yMax: 0,
    alturaInicial: 0,
    alturaFinal: 0,
  };
  window.__M = M;
  const FORENSE = ${FORENSE};

  const desc = (n) => {
    if (!n || n.nodeType !== 1) return String(n);
    const el = n;
    const cls = (el.getAttribute("class") || "").slice(0, 90);
    const idx = el.getAttribute("data-tile-idx");
    const sec = el.closest("section,[id]");
    return [
      el.tagName.toLowerCase(),
      el.id ? "#" + el.id : "",
      cls ? "." + cls.trim().split(/\\s+/).slice(0, 4).join(".") : "",
      idx !== null ? "[tile=" + idx + "]" : "",
      sec && sec !== el && sec.id ? "<" + sec.tagName.toLowerCase() + "#" + sec.id + ">" : "",
      el.currentSrc || el.getAttribute("src") ? " src=" + String(el.currentSrc || el.getAttribute("src")).split("/").pop() : "",
    ].join("");
  };

  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) M.longtasks.push({ t: Math.round(e.startTime), ms: Math.round(e.duration) });
    }).observe({ type: "longtask", buffered: true });
  } catch {}

  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) {
        M.shifts.push({
          t: Math.round(e.startTime),
          valor: Number(e.value.toFixed(5)),
          entrada: !!e.hadRecentInput,
          y: Math.round(scrollY),
          fontes: (e.sources || []).map((s) => ({
            no: desc(s.node),
            de: s.previousRect ? [Math.round(s.previousRect.x), Math.round(s.previousRect.y), Math.round(s.previousRect.width), Math.round(s.previousRect.height)] : null,
            para: s.currentRect ? [Math.round(s.currentRect.x), Math.round(s.currentRect.y), Math.round(s.currentRect.width), Math.round(s.currentRect.height)] : null,
          })),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  } catch {}

  // ── Transições de vista (View Transitions) ────────────────────────────
  // O scroll infinito da galeria aplica o lote seguinte dentro de um
  // startTransition, e a app tem componentes <ViewTransition> (o React chama
  // document.startViewTransition). Uma transição de documento TIRA UMA
  // FOTOGRAFIA da página inteira e cobre-a com ela enquanto anima: é candidata
  // directa ao "fica tudo travado". Aqui mede-se se acontecem, quando, e
  // quanto tempo demoram de ponta a ponta.
  M.vt = [];
  try {
    const orig = document.startViewTransition;
    if (typeof orig === "function") {
      document.startViewTransition = function (...a) {
        const reg = { t: Math.round(performance.now()), y: Math.round(scrollY), prontoMs: null, fimMs: null };
        M.vt.push(reg);
        const vt = orig.apply(this, a);
        const t0 = performance.now();
        vt.ready?.then(() => { reg.prontoMs = Math.round(performance.now() - t0); }, () => {});
        vt.finished?.then(() => { reg.fimMs = Math.round(performance.now() - t0); }, () => {});
        return vt;
      };
    }
  } catch {}

  // ── Tudo o que precisa do DOM ─────────────────────────────────────────
  // A sonda é injectada ANTES de existir <html> (addInitScript corre no
  // document-start), por isso o resto espera pelo DOMContentLoaded. Sem isto,
  // document.documentElement.scrollHeight atirava um TypeError e o laço de
  // rAF nunca chegava a arrancar — medido: 0 amostras em todas as passagens.
  const arrancar = () => {
  // <img> a entrar e a sair do DOM (o SafeImage/GalleryImage desmontam e
  // remontam o <img> a cada tentativa: key={bust}).
  try {
    new MutationObserver((muts) => {
      const t = Math.round(performance.now());
      for (const m of muts) {
        for (const n of m.removedNodes) {
          if (n.nodeType === 1 && n.tagName === "IMG")
            M.imgEventos.push({ t, tipo: "saiu", no: desc(n), y: Math.round(scrollY) });
        }
        for (const n of m.addedNodes) {
          if (n.nodeType === 1 && n.tagName === "IMG")
            M.imgEventos.push({ t, tipo: "entrou", no: desc(n), y: Math.round(scrollY) });
        }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  } catch {}

  // ── Marcos: posição ABSOLUTA de elementos de referência, frame a frame ──
  let marcos = [];
  const escolherMarcos = () => {
    const alvos = [
      ...document.querySelectorAll("main > *, main section, [data-medir-marco]"),
    ];
    const tiles = [...document.querySelectorAll(".g-reveal")];
    for (let i = 0; i < tiles.length; i += Math.max(1, Math.ceil(tiles.length / 40))) alvos.push(tiles[i]);
    marcos = alvos.slice(0, 80).map((el) => ({ el, y: null, h: null, d: desc(el) }));
  };
  /**
   * Posição de LAYOUT (não visual): soma da cadeia de offsetTop. Usa-se isto e
   * não getBoundingClientRect porque o rect inclui transforms — e a galeria
   * anima .g-reveal com translateY(20px), o que enchia o relatório de "marcos
   * que se mexeram" que são só a animação de revelação, não layout nenhum.
   */
  const topoAbs = (el) => {
    let t = 0, n = el;
    while (n) { t += n.offsetTop; n = n.offsetParent; }
    return Math.round(t);
  };
  if (FORENSE) escolherMarcos();
  let proximaEscolha = 0;

  let ultimoT = performance.now();
  let ultimoY = scrollY;
  let ultimaAltura = document.documentElement.scrollHeight;
  M.alturaInicial = ultimaAltura;

  const recentes = (arr, t, janela) => arr.filter((e) => Math.abs(e.t - t) <= janela).slice(-8);

  const tick = () => {
    const t = performance.now();
    const dt = t - ultimoT;
    const y = scrollY;
    const altura = document.documentElement.scrollHeight;
    M.amostras++;
    if (dt > 50) M.frames.push({ t: Math.round(t), ms: Math.round(dt), y: Math.round(y) });
    if (y > M.yMax) M.yMax = y;

    let marcosMudados = [];
    if (FORENSE) {
      if (t > proximaEscolha) { escolherMarcos(); proximaEscolha = t + 700; }
      for (const m of marcos) {
        if (!m.el.isConnected) continue;
        const abs = topoAbs(m.el);
        const alt = m.el.offsetHeight;
        // Uma MUDANÇA DE ALTURA só empurra o que o visitante está a ver se a
        // caixa que mudou estiver ACIMA do ecrã (o fundo dela acima do topo do
        // viewport). Abaixo do ecrã é inofensiva — cresce para dentro do que
        // ainda ninguém viu. É esta distinção que separa o scroll infinito
        // (inofensivo) do salto de que a dona se queixa.
        const fim = abs + (m.h === null ? alt : m.h);
        const pos = fim <= y ? "acima" : abs >= y + innerHeight ? "abaixo" : "no-ecra";
        if (m.y !== null && Math.abs(abs - m.y) >= 2)
          marcosMudados.push({ no: m.d, tipo: "moveu", de: m.y, para: abs, delta: abs - m.y, pos, acimaDoEcra: abs < y });
        if (m.h !== null && Math.abs(alt - m.h) >= 2)
          marcosMudados.push({ no: m.d, tipo: "mudou-de-altura", de: m.h, para: alt, delta: alt - m.h, pos, acimaDoEcra: pos === "acima" });
        m.y = abs; m.h = alt;
      }
      if (marcosMudados.length)
        M.marcos.push({
          t: Math.round(t),
          y: Math.round(y),
          // Quanto é que o scroll andou NESTE frame. É o que separa uma mudança
          // de altura acima do ecrã COMPENSADA pelo scroll anchoring (o browser
          // mexe o scrollY na mesma medida e o visitante não vê nada) de uma
          // NÃO compensada (o conteúdo salta debaixo do dedo).
          dy: Math.round(y - ultimoY),
          n: marcosMudados.length,
          acima: marcosMudados.filter((m) => m.pos === "acima").length,
          exemplos: marcosMudados.slice(0, 6),
        });
    }

    // RECUO: o arnês só manda descer, portanto qualquer descida é espontânea.
    if (y < ultimoY - 2) {
      M.recuos.push({
        t: Math.round(t),
        de: Math.round(ultimoY),
        para: Math.round(y),
        delta: Math.round(ultimoY - y),
        dtFrame: Math.round(dt),
        alturaAntes: ultimaAltura,
        alturaDepois: altura,
        deltaAltura: altura - ultimaAltura,
        shifts: recentes(M.shifts, t, 400),
        imgs: recentes(M.imgEventos, t, 400),
        marcos: marcosMudados.slice(0, 6),
      });
    }
    ultimoT = t; ultimoY = y; ultimaAltura = altura;
    M.alturaFinal = altura;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
`;

// ── Condução do scroll ──────────────────────────────────────────────────────
/**
 * UM SWIPE DE DEDO, a sério.
 *
 * `Input.synthesizeScrollGesture` com `gestureSourceType:"touch"` NÃO mexe nada
 * neste Chromium (medido: 0 px, contra 600 px em "default"), por isso o gesto é
 * montado à mão com `Input.dispatchTouchEvent` — touchStart, uma dúzia de
 * touchMove a ~16 ms e touchEnd. É o caminho que passa pelo mesmo código de
 * scroll (e de fling, que o Chrome calcula pela velocidade dos últimos moves)
 * que o dedo da dona do site.
 */
async function swipe(cdp, page, vp, dist) {
  const x = Math.round(vp.width / 2);
  const y0 = Math.round(vp.height * 0.82);
  const passos = 12;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= passos; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: Math.round(y0 - (dist * i) / passos) }],
    });
    await page.waitForTimeout(12);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function passagem(page, cdp, rota) {
  if (FALHAS > 0 || FALHAR_PADRAO) {
    let n = 0;
    const padrao = FALHAR_PADRAO ? new RegExp(FALHAR_PADRAO) : null;
    // Falha 1 em cada N pedidos de IMAGEM, seja qual for o caminho: `/_img/…`
    // (o carregador estático de hoje) ou `/_next/image?…` (o optimizador que
    // havia antes). Tem de apanhar os dois para a comparação HOJE/ANTES ser
    // justa — falhar só num dos caminhos mediria o arnês, não o site.
    await page.route(
      (u) => Boolean(padrao) || /\/_img\/|\/_next\/image/.test(u.pathname + u.search),
      (r) => {
        const u = decodeURIComponent(r.request().url());
        if (padrao) return padrao.test(u) ? r.abort("failed") : r.continue();
        return ++n % FALHAS === 0 ? r.abort("failed") : r.continue();
      },
    );
  }
  await page.goto(URL_BASE + rota, { waitUntil: "load", timeout: 60_000 });
  if (SEM_ANCORA)
    await page.addStyleTag({
      content: "*, *::before, *::after { overflow-anchor: none !important; }",
    });
  // Deixa assentar a hidratação antes de começar a medir o que o dedo causa.
  await page.waitForTimeout(1200);
  await page.evaluate(() => {
    const M = window.__M;
    M.frames.length = 0;
    M.longtasks.length = 0;
    M.shifts.length = 0;
    M.recuos.length = 0;
    M.imgEventos.length = 0;
    M.marcos.length = 0;
    M.vt.length = 0;
  });

  const vp = page.viewportSize();
  let gestos = 0;
  for (let i = 0; i < GESTOS; i++) {
    const antes = await page.evaluate(() => scrollY);
    // Um swipe de dedo: ~65% do ecrã, à velocidade de uma pessoa apressada.
    await swipe(cdp, page, vp, Math.round(vp.height * DISTANCIA));
    gestos++;
    // AUTO-TESTE DO INSTRUMENTO: a meio da passagem encolhe-se, à força, um
    // elemento que está ACIMA do ecrã. É a causa exacta do sintoma (b), e o
    // detector TEM de a apanhar. Um arnês que nunca acusa nada é indistinguível
    // de um arnês partido — isto é o que os separa.
    if (AUTO_TESTE && i === 10) {
      await page.evaluate(() => {
        const y = scrollY;
        for (const el of document.querySelectorAll("section, main > div > *")) {
          const t = el.getBoundingClientRect().top + y;
          if (t < y - 200 && el.getBoundingClientRect().height > 200) {
            el.style.height = el.getBoundingClientRect().height - 150 + "px";
            el.setAttribute("data-auto-teste", "1");
            return;
          }
        }
      });
    }
    await page.waitForTimeout(PAUSA);
    const depois = await page.evaluate(() => scrollY);
    const fim = await page.evaluate(
      () => scrollY + innerHeight >= document.documentElement.scrollHeight - 4,
    );
    if (fim && depois - antes < 5) break;
  }
  await page.waitForTimeout(ESPERA_FIM);
  const m = await page.evaluate(() => window.__M);
  return { ...m, gestos };
}

// ── Resumo ──────────────────────────────────────────────────────────────────
function resumir(rota, corridas) {
  const comRecuo = corridas.filter((c) => c.recuos.length > 0).length;
  const recuos = corridas.flatMap((c) => c.recuos);
  const frames = corridas.flatMap((c) => c.frames);
  const lts = corridas.flatMap((c) => c.longtasks);
  const shifts = corridas.flatMap((c) => c.shifts);
  const px = recuos.map((r) => r.delta);
  // Marcos ACIMA do ecrã que mudaram de sítio: é a CAUSA directa do sintoma
  // (b). Guarda-se à parte quantos foram compensados pelo scroll (anchoring do
  // Chrome, que o Safari não tem) e quantos não foram.
  const marcos = corridas
    .flatMap((c) => c.marcos)
    .filter((m) => m.exemplos.some((e) => e.pos === "acima"));
  const naoCompensados = marcos.filter((m) => {
    const d = m.exemplos.find((e) => e.acimaDoEcra && e.tipo === "moveu");
    return d && Math.abs(d.delta - m.dy) > 2;
  });
  return {
    rota,
    passagens: corridas.length,
    passagensComRecuo: comRecuo,
    freqRecuo: `${comRecuo}/${corridas.length}`,
    recuosTotal: recuos.length,
    recuoPxMax: px.length ? Math.max(...px) : 0,
    recuoPxMediana: px.length ? px.slice().sort((a, b) => a - b)[Math.floor(px.length / 2)] : 0,
    recuoPxSoma: px.reduce((a, b) => a + b, 0),
    frames50: frames.length,
    frames100: frames.filter((f) => f.ms > 100).length,
    frameMaxMs: frames.length ? Math.max(...frames.map((f) => f.ms)) : 0,
    longtasks: lts.length,
    longtaskMaxMs: lts.length ? Math.max(...lts.map((l) => l.ms)) : 0,
    marcosAcimaFrames: marcos.length,
    marcosAcimaPassagens: corridas.filter((c) =>
      c.marcos.some((m) => m.exemplos.some((e) => e.pos === "acima")),
    ).length,
    marcosAcimaNaoCompensados: naoCompensados.length,
    marcosAcimaPxMax: marcos.length
      ? Math.max(
          ...marcos.map((m) =>
            Math.max(
              ...m.exemplos.filter((e) => e.pos === "acima").map((e) => Math.abs(e.delta)),
              0,
            ),
          ),
        )
      : 0,
    transicoesDeVista: corridas.reduce((a, c) => a + (c.vt ? c.vt.length : 0), 0),
    transicaoMaisLongaMs: Math.max(
      0,
      ...corridas.flatMap((c) => (c.vt || []).map((v) => v.fimMs || 0)),
    ),
    shifts: shifts.length,
    shiftSoma: Number(shifts.reduce((a, s) => a + s.valor, 0).toFixed(4)),
    shiftSemInput: Number(
      shifts
        .filter((s) => !s.entrada)
        .reduce((a, s) => a + s.valor, 0)
        .toFixed(4),
    ),
    alturaCresceu: corridas.map((c) => c.alturaFinal - c.alturaInicial),
  };
}

// ── Principal ───────────────────────────────────────────────────────────────
const rotasArg = arg("rotas", "/galeria");
let ROTAS;
if (rotasArg === "todas") {
  const xml = await (await fetch(URL_BASE + "/sitemap.xml")).text();
  ROTAS = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => new URL(m[1]).pathname)
    .filter((p, i, a) => a.indexOf(p) === i)
    .sort();
} else {
  ROTAS = rotasArg.split(",");
}

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const semSW = FALHAS > 0 || FALHAR_PADRAO ? { serviceWorkers: "block" } : {};
const contexto = await navegador.newContext({
  ...devices[DISPOSITIVO],
  ...semSW,
  ...(arg("largura")
    ? { viewport: { width: Number(arg("largura")), height: Number(arg("altura", 667)) } }
    : {}),
});
await contexto.addInitScript(SONDA);

const resultados = [];
const bruto = [];
for (const rota of ROTAS) {
  const corridas = [];
  for (let p = 0; p < PASSAGENS; p++) {
    const page = SEM_CACHE
      ? await (await navegador.newContext({ ...devices[DISPOSITIVO], ...semSW })).newPage()
      : await contexto.newPage();
    if (SEM_CACHE) await page.addInitScript(SONDA);
    const cdp = await page.context().newCDPSession(page);
    if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
    if (REDE === "lenta") {
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", {
        offline: false,
        latency: 150,
        downloadThroughput: (1.6 * 1024 * 1024) / 8,
        uploadThroughput: (750 * 1024) / 8,
      });
    }
    try {
      const m = await passagem(page, cdp, rota);
      corridas.push(m);
      bruto.push({ rota, passagem: p, ...m });
    } catch (e) {
      console.error(`[erro] ${rota} passagem ${p}: ${e.message}`);
    }
    const ctx = page.context();
    await page.close();
    if (SEM_CACHE) await ctx.close();
  }
  const r = resumir(rota, corridas);
  resultados.push(r);
  console.log(JSON.stringify({ etiqueta: ETIQUETA, cpu: CPU, rede: REDE, ...r }));
}
await navegador.close();

if (SAIDA) {
  writeFileSync(
    SAIDA,
    JSON.stringify(
      {
        etiqueta: ETIQUETA,
        url: URL_BASE,
        cpu: CPU,
        rede: REDE,
        dispositivo: DISPOSITIVO,
        gestos: GESTOS,
        passagens: PASSAGENS,
        resumo: resultados,
        bruto,
      },
      null,
      2,
    ),
  );
  console.log(`[saida] ${SAIDA}`);
}
