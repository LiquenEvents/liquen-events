/**
 * A/B EMPARELHADO DO SCROLL — para responder "esta mudança melhora ou piora?"
 * numa máquina que está ocupada com outra coisa qualquer.
 *
 * PORQUÊ ESTE FICHEIRO EXISTE. Duas tentativas anteriores de atribuir a
 * "travada" falharam pela mesma razão, e não por falta de ideias: o ruído entre
 * execuções da MESMA página (2 a 9 tarefas longas) era maior do que qualquer
 * efeito procurado. Medir A durante uns minutos e B a seguir não resolve isso —
 * mede-se a máquina, não o sítio. O que resolve é DESENHO:
 *
 *   1. ALTERNAR dentro da mesma janela de tempo, nunca em blocos. Cada par corre
 *      A e B seguidos (e o par seguinte inverte a ordem, B e A), por isso uma
 *      subida de carga a meio da sessão cai igualmente em cima dos dois braços.
 *   2. Comparar DENTRO do par (a diferença A−B de cada par) e não as médias
 *      globais. É a diferença emparelhada que remove a variação de fundo.
 *   3. Muitas repetições, e reportar MEDIANA e dispersão — uma passagem
 *      anómala não pode mandar na conclusão.
 *   4. Registar `os.loadavg()` ao lado de cada número, para se poder ver se um
 *      resultado saiu de um momento anormal.
 *   5. Dizer QUAL É A MENOR DIFERENÇA QUE ESTE DESENHO CONSEGUE VER (a MDE, mais
 *      abaixo). Se o efeito procurado for menor do que isso, o resultado honesto
 *      é "não sei", e não "não há efeito".
 *
 * A MÉTRICA é contínua, não uma contagem. Contar tarefas longas dá uma dúzia de
 * números por passagem e quase nenhum poder estatístico; somar os milissegundos
 * ACIMA DO ORÇAMENTO DE 20 ms em cada frame (`jankMs`) usa as ~600 amostras de
 * uma travessia inteira e distingue "muitos frames um pouco lentos" de "poucos
 * frames muito lentos".
 *
 * O gesto é o mesmo do e2e/scroll-mobile.mjs — `Input.dispatchTouchEvent` à mão,
 * porque `Input.synthesizeScrollGesture` com toque NÃO mexe a página um único
 * pixel neste Chromium. Cada passagem reporta o `yMax` que atingiu: é a prova de
 * que houve scroll a sério e não uma página parada a dar "zero problemas".
 *
 * USO
 *   node e2e/scroll-emparelhado.mjs --url http://127.0.0.1:4320 --rota / \
 *        --pares 20 --css-b ".cv-panel,.g-tile{content-visibility:visible!important}"
 *
 *   --css-b   o CSS que define a variante B (A é o sítio tal e qual)
 *   --nome-b  etiqueta para o relatório
 *   --subir   a travessia desce E sobe (a subida tem custos próprios: nada é
 *             pré-carregado para cima)
 */
import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";
import os from "node:os";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const flag = (n) => args.includes(`--${n}`);

const URL_BASE = arg("url", "http://127.0.0.1:4320");
const ROTA = arg("rota", "/");
const PARES = Number(arg("pares", 20));
const GESTOS = Number(arg("gestos", 12));
const CSS_B = arg("css-b", ".cv-panel,.g-tile{content-visibility:visible!important}");
const NOME_B = arg("nome-b", "sem-content-visibility");
const SUBIR = !flag("so-descer");
const CPU = Number(arg("cpu", 1));
const SAIDA = arg("saida", null);

/** Orçamento por frame. Acima disto conta como atraso acumulado. */
const ORCAMENTO_MS = 20;

const SONDA = `
(() => {
  const M = { dts: [], longtasks: [], yMax: 0 };
  window.__M = M;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) M.longtasks.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  const arrancar = () => {
    let ultimo = performance.now();
    const tick = () => {
      const t = performance.now();
      M.dts.push(Math.round((t - ultimo) * 10) / 10);
      if (scrollY > M.yMax) M.yMax = scrollY;
      ultimo = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", arrancar);
  else arrancar();
})();
`;

async function gesto(cdp, page, vp, paraCima) {
  const x = Math.round(vp.width / 2);
  const dist = Math.round(vp.height * 0.65);
  const y0 = paraCima ? Math.round(vp.height * 0.18) : Math.round(vp.height * 0.82);
  const s = paraCima ? 1 : -1;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: Math.round(y0 + (s * dist * i) / 12) }],
    });
    await page.waitForTimeout(12);
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

async function passagem(contexto, variante) {
  const page = await contexto.newPage();
  const cdp = await page.context().newCDPSession(page);
  if (CPU > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });
  await page.goto(URL_BASE + ROTA, { waitUntil: "load", timeout: 60_000 });
  if (variante === "B" && CSS_B) await page.addStyleTag({ content: CSS_B });
  await page.waitForTimeout(1400); // deixa assentar a hidratação
  await page.evaluate(() => {
    window.__M.dts.length = 0;
    window.__M.longtasks.length = 0;
  });
  const vp = page.viewportSize();
  const carga = os.loadavg()[0];
  for (let i = 0; i < GESTOS; i++) {
    await gesto(cdp, page, vp, false);
    await page.waitForTimeout(150);
  }
  if (SUBIR)
    for (let i = 0; i < GESTOS; i++) {
      await gesto(cdp, page, vp, true);
      await page.waitForTimeout(150);
    }
  await page.waitForTimeout(300);
  const M = await page.evaluate(() => window.__M);
  await page.close();
  const dts = M.dts.filter((d) => d < 4000); // corta a pausa de arranque
  const jankMs = Math.round(dts.reduce((a, d) => a + Math.max(0, d - ORCAMENTO_MS), 0));
  const ord = dts.slice().sort((a, b) => a - b);
  return {
    variante,
    carga: Math.round(carga * 100) / 100,
    frames: dts.length,
    jankMs,
    acima50: dts.filter((d) => d > 50).length,
    p95: ord.length ? ord[Math.floor(ord.length * 0.95)] : 0,
    longtasks: M.longtasks.length,
    yMax: Math.round(M.yMax),
  };
}

const mediana = (a) => {
  if (!a.length) return 0;
  const o = a.slice().sort((x, y) => x - y);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
};
const quantil = (a, q) => {
  if (!a.length) return 0;
  const o = a.slice().sort((x, y) => x - y);
  return o[Math.min(o.length - 1, Math.floor(o.length * q))];
};
const desvio = (a) => {
  if (a.length < 2) return 0;
  const m = a.reduce((x, y) => x + y, 0) / a.length;
  return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1));
};

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await navegador.newContext({ ...devices["Pixel 7"], serviceWorkers: "block" });
await contexto.addInitScript(SONDA);

const corridas = [];
for (let p = 0; p < PARES; p++) {
  // ABBA: o par ímpar inverte a ordem, para que uma deriva lenta ao longo da
  // sessão (cache a aquecer, carga a subir) não fique sistematicamente a favor
  // de um dos braços.
  const ordem = p % 2 === 0 ? ["A", "B"] : ["B", "A"];
  const par = {};
  for (const v of ordem) par[v] = await passagem(contexto, v);
  corridas.push({ par: p, ...par });
  process.stderr.write(
    `par ${p}: A jank=${par.A.jankMs}ms carga=${par.A.carga} | B jank=${par.B.jankMs}ms carga=${par.B.carga}\n`,
  );
}
await navegador.close();

const A = corridas.map((c) => c.A.jankMs);
const B = corridas.map((c) => c.B.jankMs);
const dif = corridas.map((c) => c.A.jankMs - c.B.jankMs);
const positivos = dif.filter((d) => d > 0).length;
const s = desvio(dif);
// MENOR DIFERENÇA DETECTÁVEL (MDE) do desenho: para um teste t emparelhado,
// bilateral a 5% e 80% de potência, ≈ 2,8 · s / √n. Abaixo disto o desenho não
// distingue o efeito do ruído — e o resultado correcto é "não sei".
const mde = corridas.length ? (2.8 * s) / Math.sqrt(corridas.length) : 0;

const resumo = {
  rota: ROTA,
  variantes: { A: "como está", B: NOME_B },
  pares: corridas.length,
  cpu: CPU,
  travessia: SUBIR ? `${GESTOS} gestos a descer + ${GESTOS} a subir` : `${GESTOS} gestos a descer`,
  yMaxMediano: mediana(corridas.map((c) => c.A.yMax)),
  jankA: { mediana: mediana(A), p25: quantil(A, 0.25), p75: quantil(A, 0.75) },
  jankB: { mediana: mediana(B), p25: quantil(B, 0.25), p75: quantil(B, 0.75) },
  diferencaEmparelhada: {
    mediana: mediana(dif),
    media: Math.round((dif.reduce((x, y) => x + y, 0) / dif.length) * 10) / 10,
    desvio: Math.round(s * 10) / 10,
    p25: quantil(dif, 0.25),
    p75: quantil(dif, 0.75),
    paresEmQueAEraPior: `${positivos}/${dif.length}`,
  },
  menorDiferencaDetectavelMs: Math.round(mde * 10) / 10,
  cargaMediana: mediana(corridas.flatMap((c) => [c.A.carga, c.B.carga])),
  cargaMax: Math.max(...corridas.flatMap((c) => [c.A.carga, c.B.carga])),
};
console.log(JSON.stringify(resumo, null, 2));
if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ resumo, corridas }, null, 2));
