/**
 * "A SUBIR, AS FOTOS TREMEM E FICAM BRANCAS" — arnês de reprodução.
 *
 * A queixa é VISUAL, por isso o instrumento também é: conduz um Chromium num
 * telemóvel emulado, desce a página com o dedo, SOBE, e FILMA o ecrã
 * (Page.screencast). Mede o sintoma em píxeis em vez de o inferir de eventos.
 *
 * TRÊS MEDIDAS, porque uma só engana:
 *   • BRANCURA GLOBAL — fracção de píxeis quase-brancos do ecrã. O corpo do
 *     sítio é #ffffff, portanto um painel de sangria inteira que não esteja
 *     pintado lê-se como branco.
 *   • BRANCURA POR BLOCO (20×20) — uma foto a apagar-se no meio de uma grelha
 *     de 22 logótipos move ~1% da média global e desapareceria no ruído. O
 *     máximo por bloco vê o que a média esconde.
 *   • DIFERENÇA ENTRE FRAMES COM A PÁGINA PARADA — o `scrollY` de cada frame
 *     vem dos metadados do próprio screencast (e não de um `page.evaluate`
 *     amostrado uma vez por gesto, que faria passar por "parados" frames a meio
 *     do scroll). Com o mesmo scrollY, qualquer píxel que mude é, por
 *     definição, a página a mexer-se sozinha: é isso, e só isso, o piscar.
 *
 * Em paralelo, e com carimbos de tempo comparáveis, regista o que distingue as
 * causas candidatas umas das outras: os eventos
 * `contentvisibilityautostatechange` de cada `.cv-panel`/`.g-tile` (saltou /
 * voltou a desenhar), o estado de cada `<img>` frame a frame (`naturalWidth`,
 * `complete`, opacidade), os pedidos de imagem, e os `transitionstart` /
 * `animationstart` (uma revelação a recomeçar).
 *
 * ARMADILHAS JÁ PAGAS, não as redescubra:
 *   • `Input.synthesizeScrollGesture` com toque NÃO mexe a página um pixel
 *     neste Chromium; o gesto é montado à mão com `Input.dispatchTouchEvent`.
 *   • Com o service worker activo, `page.route` nunca vê os pedidos de imagem —
 *     daí `serviceWorkers: "block"`.
 *   • Medir contra `next dev` não serve: o sintoma foi visto num build de
 *     produção. Aponte para um `next build` + `next start`.
 *
 * USO
 *   node e2e/piscar-subida.mjs --url http://127.0.0.1:4320 --rota / \
 *        --cpu 4 --frames /tmp/frames --saida /tmp/piscar.json
 *
 *   --falhar <texto>   falha SEMPRE as imagens cujo URL contenha este texto
 *                      (para pôr a escada de re-tentativas do SafeImage a correr)
 *   --espera-escada N  espera N ms antes de medir, para a escada se esgotar
 *   --sem-cv           desliga o content-visibility (a variante de controlo)
 *   --rapido           gesto de fling em vez de um arrastar tranquilo
 *   --frames <dir>     grava os frames mais brancos e uma folha de contacto da
 *                      subida, para se ver com os olhos
 */
import { chromium, devices } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import os from "node:os";
import sharp from "sharp";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const flag = (n) => args.includes(`--${n}`);
const URL_BASE = arg("url", "http://127.0.0.1:4320");
const ROTA = arg("rota", "/");
const DESCIDAS = Number(arg("descidas", 14));
const SUBIDAS = Number(arg("subidas", 14));
const SAIDA = arg("saida", null);
const DIR_FRAMES = arg("frames", null);
const SEM_CV = flag("sem-cv"); // desliga content-visibility (variante B)
const CPU = Number(arg("cpu", 1));
const MEM = flag("memoria"); // simula pressão de memória (descarte de decode)
const FALHAR = arg("falhar", null); // falha SEMPRE os URLs que contenham este texto
const ESPERA_ESCADA = Number(arg("espera-escada", 0));

const SONDA = `
(() => {
  const M = { cv: [], imgs: [], transicoes: [], marcos: [] };
  window.__M = M;
  const agora = () => Math.round(performance.now());
  const chave = (el) => (el.currentSrc || el.src || "").split("/").pop().slice(0, 60);

  const arrancar = () => {
    // 1. content-visibility: auto — saltou / voltou a desenhar
    const ligarCV = () => {
      for (const el of document.querySelectorAll(".cv-panel, .g-tile")) {
        if (el.__cvLigado) continue;
        el.__cvLigado = true;
        el.addEventListener("contentvisibilityautostatechange", (e) => {
          M.cv.push({ t: agora(), y: Math.round(scrollY), saltou: e.skipped,
                      alvo: (el.className || "").slice(0, 40) });
        });
      }
    };
    ligarCV();
    setInterval(ligarCV, 500);

    // 2. transições/animações a arrancar (revelações a recomeçar)
    for (const tipo of ["transitionstart", "animationstart"]) {
      document.addEventListener(tipo, (e) => {
        if (M.transicoes.length > 4000) return;
        const el = e.target;
        M.transicoes.push({ t: agora(), tipo, prop: e.propertyName || e.animationName,
                            no: (el.tagName || "?") + "." + String(el.className || "").slice(0, 30) });
      }, true);
    }

    // 3. estado de cada <img> por frame
    let ultimo = performance.now();
    const tick = () => {
      const t = performance.now();
      const estado = [];
      for (const im of document.images) {
        const r = im.getBoundingClientRect();
        // só o que está (ou quase) no ecrã
        if (r.bottom < -200 || r.top > innerHeight + 200 || r.width === 0) continue;
        estado.push({
          k: chave(im),
          nw: im.naturalWidth,
          c: im.complete ? 1 : 0,
          op: getComputedStyle(im).opacity,
          top: Math.round(r.top),
        });
      }
      M.imgs.push({ t: Math.round(t), dt: Math.round(t - ultimo), y: Math.round(scrollY), n: estado.length, e: estado });
      ultimo = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
`;

const RAPIDO = flag("rapido");

async function gesto(cdp, page, vp, paraCima) {
  const x = Math.round(vp.width / 2);
  // Um FLING: poucos movimentos, muito espaçados, quase sem pausa. O Chrome
  // calcula a velocidade pelos últimos toques, por isso isto sai a ~12 px/ms
  // (contra ~3,7 do gesto tranquilo) e a página continua a andar sozinha no
  // compositor durante ~1 s — é durante essa inércia que a linha principal pode
  // não chegar a tempo de desenhar uma secção que já entrou no ecrã.
  const dist = Math.round(vp.height * (RAPIDO ? 0.72 : 0.65));
  const y0 = paraCima
    ? Math.round(vp.height * (RAPIDO ? 0.12 : 0.18))
    : Math.round(vp.height * (RAPIDO ? 0.88 : 0.82));
  const sinal = paraCima ? 1 : -1;
  const passos = RAPIDO ? 4 : 12;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= passos; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: Math.round(y0 + (sinal * dist * i) / passos) }],
    });
    await page.waitForTimeout(RAPIDO ? 4 : 12);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await navegador.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
await contexto.addInitScript(SONDA);
const page = await contexto.newPage();

const pedidos = [];
page.on("request", (r) => {
  if (r.resourceType() === "image")
    pedidos.push({ t: Date.now(), url: r.url().split("/").pop().slice(0, 70) });
});
page.on("requestfailed", (r) => {
  if (r.resourceType() === "image")
    pedidos.push({ t: Date.now(), falhou: true, url: r.url().split("/").pop().slice(0, 70) });
});

if (FALHAR)
  await page.route(
    (u) => /\/_img\/|\/imagens\//.test(u.pathname),
    (r) =>
      decodeURIComponent(r.request().url()).includes(FALHAR) ? r.abort("failed") : r.continue(),
  );
const cdp = await page.context().newCDPSession(page);
if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
if (MEM) {
  // Faz o Chromium comportar-se como um telemóvel com pouca memória: é neste
  // regime que ele deita fora os bitmaps já descodificados das imagens fora do
  // ecrã — exactamente o que uma secção com content-visibility torna "fora do
  // ecrã" mais cedo.
  await cdp
    .send("Memory.setPressureNotificationsSuppressed", { suppressed: false })
    .catch(() => {});
  await cdp.send("Memory.simulatePressureNotification", { level: "critical" }).catch(() => {});
}
await page.goto(URL_BASE + ROTA, { waitUntil: "load", timeout: 60_000 });
if (SEM_CV)
  await page.addStyleTag({
    content: ".cv-panel, .g-tile { content-visibility: visible !important; }",
  });
await page.waitForTimeout(1800 + ESPERA_ESCADA);

const vp = page.viewportSize();
const frames = [];
cdp.on("Page.screencastFrame", async (f) => {
  // O scrollY REAL deste frame vem nos metadados do próprio screencast — não do
  // último `page.evaluate`, que só é amostrado uma vez por gesto e faria passar
  // por "parado" frames que estavam a meio do scroll.
  frames.push({
    t: Date.now(),
    fase: fase,
    y: Math.round(f.metadata?.scrollOffsetY ?? yAtual),
    data: f.data,
  });
  try {
    await cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId });
  } catch {}
});

let fase = "descida";
let yAtual = 0;
const carga = os.loadavg();
await cdp.send("Page.startScreencast", { format: "jpeg", quality: 80, everyNthFrame: 1 });
const tInicio = Date.now();

for (let i = 0; i < DESCIDAS; i++) {
  await gesto(cdp, page, vp, false);
  yAtual = await page.evaluate(() => Math.round(scrollY));
  await page.waitForTimeout(RAPIDO ? 900 : 170);
}
await page.waitForTimeout(500);
fase = "subida";
for (let i = 0; i < SUBIDAS; i++) {
  await gesto(cdp, page, vp, true);
  yAtual = await page.evaluate(() => Math.round(scrollY));
  await page.waitForTimeout(RAPIDO ? 900 : 170);
}
await page.waitForTimeout(400);
await cdp.send("Page.stopScreencast");

const M = await page.evaluate(() => window.__M);
const relogio = await page.evaluate(() => ({ origem: performance.timeOrigin }));
await navegador.close();

// ── Análise dos frames: fracção de píxeis quase-brancos ─────────────────────
if (DIR_FRAMES) mkdirSync(DIR_FRAMES, { recursive: true });
const analisados = [];
const L = 120,
  A = 260,
  BL = 20; // blocos de 20×20 na imagem reduzida
let anterior = null;
for (let i = 0; i < frames.length; i++) {
  const buf = Buffer.from(frames[i].data, "base64");
  const { data, info } = await sharp(buf)
    .resize(L, A, { fit: "fill" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const c = info.channels;
  let branco = 0,
    soma = 0;
  const px = L * A;
  // Brancura POR BLOCO: uma foto a apagar-se no meio de um ecrã cheio move
  // pouquíssimo a média global (numa grelha de 22 logótipos, ~1%). O máximo por
  // bloco vê o que a média esconde.
  const blocos = new Array(Math.ceil(L / BL) * Math.ceil(A / BL)).fill(0);
  const nblx = Math.ceil(L / BL);
  for (let y = 0; y < A; y++)
    for (let x = 0; x < L; x++) {
      const p = (y * L + x) * c;
      const r = data[p],
        g = data[p + 1],
        b = data[p + 2];
      soma += 0.299 * r + 0.587 * g + 0.114 * b;
      if (r > 242 && g > 242 && b > 242) {
        branco++;
        blocos[Math.floor(y / BL) * nblx + Math.floor(x / BL)]++;
      }
    }
  const porBloco = BL * BL;
  const blocoMax = Math.max(...blocos) / porBloco;
  // DIFERENÇA entre frames: só vale quando a página está PARADA (mesmo scrollY).
  // Aí qualquer píxel que mude é, por definição, a página a mexer-se sozinha.
  let dif = null;
  if (anterior && anterior.y === frames[i].y && anterior.data.length === data.length) {
    let s = 0;
    for (let p = 0; p < data.length; p += c) s += Math.abs(data[p] - anterior.data[p]);
    dif = Math.round((s / px) * 10) / 10;
  }
  anterior = { y: frames[i].y, data };
  analisados.push({
    i,
    t: frames[i].t - tInicio,
    fase: frames[i].fase,
    y: frames[i].y,
    branco: Math.round((branco / px) * 1000) / 10,
    blocoBranco: Math.round(blocoMax * 1000) / 10,
    lum: Math.round(soma / px),
    difParado: dif,
  });
}
if (DIR_FRAMES) {
  // guarda os frames mais brancos de cada fase, para se ver com os olhos
  const piores = ["descida", "subida"].flatMap((f) =>
    analisados
      .filter((a) => a.fase === f)
      .sort((a, b) => b.branco - a.branco)
      .slice(0, 4),
  );
  for (const p of piores)
    writeFileSync(
      `${DIR_FRAMES}/${p.fase}-${String(p.i).padStart(4, "0")}-branco${p.branco}.jpg`,
      Buffer.from(frames[p.i].data, "base64"),
    );

  // FOLHA DE CONTACTO da subida: frames consecutivos lado a lado. É a única
  // forma de ver um piscar com os olhos em vez de o inferir de um número.
  const subida = analisados.filter((a) => a.fase === "subida");
  const passo = Math.max(1, Math.floor(subida.length / 40));
  const escolhidos = subida.filter((_, i) => i % passo === 0).slice(0, 40);
  const LARG = 96,
    ALT = 208;
  const compos = [];
  for (let i = 0; i < escolhidos.length; i++) {
    const buf = await sharp(Buffer.from(frames[escolhidos[i].i].data, "base64"))
      .resize(LARG, ALT, { fit: "fill" })
      .toBuffer();
    compos.push({ input: buf, left: (i % 10) * LARG, top: Math.floor(i / 10) * ALT });
  }
  await sharp({
    create: {
      width: LARG * 10,
      height: ALT * Math.ceil(escolhidos.length / 10),
      channels: 3,
      background: "#ff00ff",
    },
  })
    .composite(compos)
    .jpeg({ quality: 88 })
    .toFile(`${DIR_FRAMES}/folha-subida.jpg`);
  console.log("[folha]", escolhidos.map((e) => `${e.i}:${e.branco}%`).join(" "));
}

const porFase = (f) => {
  const fs = analisados.filter((x) => x.fase === f);
  const a = fs.map((x) => x.branco);
  const bl = fs.map((x) => x.blocoBranco);
  const df = fs.map((x) => x.difParado).filter((v) => v !== null);
  const ord = a.slice().sort((x, y) => x - y);
  const ordD = df.slice().sort((x, y) => x - y);
  return {
    frames: a.length,
    brancoP50: ord.length ? ord[Math.floor(ord.length / 2)] : 0,
    brancoP90: ord.length ? ord[Math.floor(ord.length * 0.9)] : 0,
    brancoMax: ord.length ? ord[ord.length - 1] : 0,
    framesAcima50pc: a.filter((v) => v > 50).length,
    blocoBrancoMax: bl.length ? Math.max(...bl) : 0,
    blocosAcima90pc: bl.filter((v) => v > 90).length,
    paradoN: df.length,
    paradoDifP50: ordD.length ? ordD[Math.floor(ordD.length / 2)] : 0,
    paradoDifMax: ordD.length ? ordD[ordD.length - 1] : 0,
    paradoDifAcima2: df.filter((v) => v > 2).length,
  };
};

const saida = {
  rota: ROTA,
  semCV: SEM_CV,
  carga,
  duracaoMs: Date.now() - tInicio,
  descida: porFase("descida"),
  subida: porFase("subida"),
  cvEventos: M.cv.length,
  cvVoltaram: M.cv.filter((c) => !c.saltou).length,
  cvSaltaram: M.cv.filter((c) => c.saltou).length,
  transicoes: M.transicoes.length,
  pedidosImagem: pedidos.length,
  pedidosFalhados: pedidos.filter((p) => p.falhou).length,
  origemRelogio: relogio.origem,
  tInicio,
};
console.log(JSON.stringify(saida, null, 2));
writeFileSync(
  SAIDA,
  JSON.stringify(
    {
      ...saida,
      analisados,
      cv: M.cv,
      transicoes: M.transicoes.slice(0, 600),
      pedidos,
      imgs: M.imgs,
    },
    null,
    2,
  ),
);
console.log(`[saida] ${SAIDA}  frames=${analisados.length}`);
