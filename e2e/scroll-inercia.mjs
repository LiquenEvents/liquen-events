/**
 * A/B EMPARELHADO DA INÉRCIA DE SCROLL — "pôr um scroll suave por JavaScript
 * melhora ou piora o que se sente, sobretudo no telemóvel?"
 *
 * PORQUE EXISTE, tendo já `e2e/scroll-emparelhado.mjs`. O arnês irmão aplica a
 * variante B injectando CSS (`--css-b`). Isso chega para afinações nativas, mas
 * NÃO chega para o que aqui se quer medir: a inércia por JavaScript é código a
 * correr, não uma regra de estilo. Este arnês herda o DESENHO do irmão (ABBA,
 * diferença dentro do par, mediana, MDE declarada) e troca a maneira de acender
 * a variante B: `--variante-b` escolhe um preparo que corre NA PÁGINA.
 *
 * TRÊS MÉTRICAS, e a terceira é a que decide.
 *
 *   `jankMs` — soma dos milissegundos acima do orçamento de 20 ms por quadro,
 *   medida na linha principal. É a métrica do arnês irmão e serve para comparar
 *   com o que já foi medido. MAS, sozinha, ENGANA neste teste em concreto: com
 *   scroll nativo em telemóvel a página anda no COMPOSITOR, portanto a linha
 *   principal pode ficar parada 200 ms e a página continua a deslizar a 60 fps
 *   debaixo do dedo. Com inércia por JavaScript a posição do scroll é escrita
 *   pela linha principal, quadro a quadro: a MESMA paragem de 200 ms passa a ser
 *   uma página congelada debaixo do dedo. O mesmo `jankMs` vale coisas muito
 *   diferentes nos dois braços.
 *
 *   `jankPor1000px` — o mesmo, a dividir pela distância REALMENTE percorrida.
 *   Sem isto a comparação é falsa, e foi medido que é: com `syncTouch`, o Lenis
 *   consome o mesmo dedo e devolve MENOS página (amortece o delta), por isso o
 *   braço nativo atravessa mais sítio, decodifica mais imagens e "ganha" jank
 *   por estar a trabalhar mais. Só normalizado é que a pergunta fica a ser
 *   "quanto custa cada pixel de página" em vez de "quem andou mais".
 *
 *   `maiorPausaMs` — a MAIOR pausa, dentro de um gesto e LONGE DOS EXTREMOS DA
 *   PÁGINA, entre dois instantes em que o `scrollY` mudou mesmo. É a medida de
 *   "a página parou debaixo do dedo", e é por esta que se decide.
 *
 *   O "LONGE DOS EXTREMOS" é a terceira correcção desta métrica, e a mais cara
 *   de descobrir. Com 10 gestos de 0,65 ecrãs a travessia percorre ~5450 px numa
 *   página cujo scroll máximo é 3850 (Pixel 7) — ou seja, ENCOSTA AO FUNDO e
 *   fica lá enquanto os gestos que sobram continuam a ser despachados. O
 *   `scrollY` não muda porque não HÁ para onde ir, e isso contava como página
 *   congelada: nas primeiras corridas o `yMax` medido era 3850, exactamente o
 *   máximo da página, o que é a assinatura de uma travessia saturada. Números
 *   tirados assim mediam o arnês a raspar no fim da página, não fluidez nenhuma.
 *   Agora as amostras encostadas a um extremo são descartadas, e a travessia usa
 *   menos gestos para nem lá chegar.
 *
 *   O "DENTRO DO GESTO" não é um detalhe: sem ele a métrica é uma fraude. Entre
 *   gestos há uma pausa de 150 ms em que o braço NATIVO está legitimamente
 *   parado (um toque sintetizado não produz o atirar do sistema operativo),
 *   enquanto o Lenis ainda está a deslizar por conta própria. Contar essas
 *   pausas dava ~700 ms de "congelado" ao nativo e 0 ao Lenis — medido, antes de
 *   a janela do gesto existir.
 *
 *   E porquê o MÁXIMO, e não a soma das pausas? Porque a soma foi tentada
 *   primeiro (`congeladoMs`, somar todo o tempo em que o `scrollY` não mexeu) e
 *   MEDIU UM ARTEFACTO. O toque sintetizado chega de 12 em 12 ms e o
 *   `requestAnimationFrame` amostra de ~16,7 em ~16,7 ms: o batimento entre os
 *   dois produz quadros em que não chegou toque novo e o `scrollY` fica igual —
 *   pausas de 16 a 32 ms que não são engasgo nenhum, são aliasing. O braço
 *   nativo move-se em DEGRAUS presos ao input e apanhava-as todas (140–230 ms
 *   por travessia); o braço com inércia interpola continuamente e dava sempre
 *   zero. A soma media a continuidade do movimento, não a fluidez.
 *   O MÁXIMO não sofre disso: o aliasing produz pausas de dezenas de ms, um
 *   engasgo a sério produz pausas de centenas. São escalas separadas.
 *
 * O GESTO é o mesmo do arnês irmão (e pela mesma razão): `Input.dispatchTouchEvent`
 * à mão, porque `Input.synthesizeScrollGesture` com toque NÃO mexe a página um
 * único pixel neste Chromium. Cada passagem reporta o `yMax` atingido como prova
 * de que houve scroll a sério.
 *
 * LIMITE HONESTO DESTE ARNÊS. Um toque sintetizado por CDP não produz o
 * "atirar" (fling) do sistema operativo depois de levantar o dedo. Portanto a
 * inércia NATIVA pós-gesto não está representada em nenhum dos braços — o que
 * se compara é o comportamento DURANTE o arrasto, mais o que cada braço faz nos
 * ~300 ms a seguir. Isto favorece ligeiramente o braço da inércia por JS (que
 * continua a deslizar por conta própria), por isso qualquer perda que ele mostre
 * é, se alguma coisa, um limite inferior da perda real.
 *
 * A PROVA DE QUE A VARIANTE B É MESMO A VARIANTE B. Montar o Lenis não é o mesmo
 * que ele estar a conduzir: se os eventos não lhe chegarem canceláveis, ele fica
 * lá montado a não fazer nada e o que se mediria era o braço A duas vezes, com
 * um gráfico bonito por cima. Por isso cada passagem B CONTA os eventos de
 * entrada que o Lenis impediu (`preventDefault`) e a corrida ABORTA se forem
 * zero.
 *
 * A sonda que conta tem de ser registada DEPOIS do Lenis E no MESMO alvo
 * (`window`). Isto custou duas conclusões erradas antes de estar certo: uma
 * sonda em `document`, ainda que registada depois, corre ANTES da do `window` na
 * fase de bolha (document borbulha para window), e vê `defaultPrevented=false`
 * mesmo quando o Lenis o vai pôr a seguir. Com a sonda mal posta a leitura era
 * "0 impedidos, o Lenis não pega no toque"; com a sonda bem posta é 12 em 12,
 * canceláveis e impedidos. O mesmo se passava na roda do rato.
 *
 * USO
 *   node e2e/scroll-inercia.mjs --url http://127.0.0.1:4320 --pares 16 \
 *        --variante-b lenis --lenis-js /caminho/lenis.min.js
 *
 *   --variante-b  nada | lenis | lenis-so-roda | proprio | css
 *   --lenis-js    ficheiro do Lenis a injectar (obrigatório com `lenis`)
 *   --proprio-js  o NOSSO motor (src/components/motion/inercia-roda.ts,
 *                 transpilado), para os números descreverem o que vai mesmo no
 *                 repositório e não só a biblioteca com que se comparou
 *   --css-b       CSS da variante B (usado com `--variante-b css`)
 *   --desktop     1440×900 com ponteiro fino e roda do rato, em vez do Pixel 7
 */
import { chromium, devices } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";

const args = process.argv.slice(2);
const arg = (n, d = null) => {
  const i = args.indexOf(`--${n}`);
  return i === -1 ? d : args[i + 1];
};
const flag = (n) => args.includes(`--${n}`);

const URL_BASE = arg("url", "http://127.0.0.1:4320");
const ROTA = arg("rota", "/");
const PARES = Number(arg("pares", 16));
const GESTOS = Number(arg("gestos", 12));
const VARIANTE_B = arg("variante-b", "lenis");
const LENIS_JS = arg("lenis-js", null);
const CSS_B = arg("css-b", "");
const NOME_B = arg("nome-b", VARIANTE_B);
const SUBIR = !flag("so-descer");
const CPU = Number(arg("cpu", 1));
const SAIDA = arg("saida", null);
const DESKTOP = flag("desktop");

/** Orçamento por quadro. Acima disto conta como atraso acumulado. */
const ORCAMENTO_MS = 20;

const PROPRIO_JS = arg("proprio-js", null);
const fonteLenis = LENIS_JS ? readFileSync(LENIS_JS, "utf8") : null;
const fontePropria = PROPRIO_JS ? readFileSync(PROPRIO_JS, "utf8") : null;

/**
 * A sonda regista, por quadro, o intervalo E o `scrollY`. Guardar os dois em
 * paralelo é o que permite separar "a linha principal engasgou mas a página
 * andou na mesma" (nativo, compositor) de "a linha principal engasgou e a
 * página parou" (inércia por JS).
 */
const SONDA = `
(() => {
  const M = { dts: [], ys: [], gestos: [], extremos: [], longtasks: [], yMax: 0, distancia: 0, gesto: 0, maximo: 0 };
  window.__M = M;
  try {
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) M.longtasks.push(Math.round(e.duration));
    }).observe({ type: "longtask", buffered: true });
  } catch {}
  // A JANELA DO GESTO, marcada DENTRO DA PÁGINA pelos próprios eventos de
  // entrada. A primeira versão marcava-a do lado do Node (um page.evaluate antes
  // e outro depois de cada gesto) e isso MEDIU A LATÊNCIA DO ARNÊS: a ida e
  // volta do CDP deixava a janela aberta centenas de ms depois do último evento,
  // tempo em que o braço nativo está legitimamente parado (não há fling
  // sintetizado). O braço nativo aparecia com "pausas" de ~317 ms que eram só a
  // sonda a fechar tarde. Marcada aqui, a janela é o gesto e mais nada.
  const ABRE = ${DESKTOP ? '"wheel"' : '"touchstart"'};
  const FECHA = ${DESKTOP ? "null" : '"touchend"'};
  // Na roda não há "levantar o dedo": fecha-se a janela um pouco depois do
  // último evento de roda, que é o que dura a rajada de uma passagem de roda.
  const RABO_MS = 80;
  let fecho = 0;
  addEventListener(ABRE, () => {
    M.gesto = 1;
    if (FECHA === null) {
      clearTimeout(fecho);
      fecho = setTimeout(() => (M.gesto = 0), RABO_MS);
    }
  }, { passive: true, capture: true });
  if (FECHA !== null) addEventListener(FECHA, () => (M.gesto = 0), { passive: true, capture: true });

  const arrancar = () => {
    let ultimo = performance.now();
    let ultimoY = scrollY;
    const tick = () => {
      const t = performance.now();
      // O scroll máximo é lido a cada quadro porque a página cresce enquanto as
      // imagens entram; um valor medido só no arranque estaria errado a meio.
      const maximo = document.documentElement.scrollHeight - innerHeight;
      M.maximo = maximo;
      // 1 = encostado ao topo ou ao fundo. Aí o scrollY não muda porque não há
      // para onde ir, e isso NÃO é a página a congelar.
      // (Sem crases neste comentário: isto vive dentro de um template literal.)
      M.extremos.push(scrollY <= 1 || scrollY >= maximo - 1 ? 1 : 0);
      M.dts.push(Math.round((t - ultimo) * 10) / 10);
      M.ys.push(Math.round(scrollY));
      // 1 enquanto o dedo/roda está a agir; é a janela em que a página TEM de
      // estar a andar, e a única em que "congelado" quer dizer alguma coisa.
      M.gestos.push(M.gesto);
      M.distancia += Math.abs(scrollY - ultimoY);
      ultimoY = scrollY;
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

/**
 * Acende o Lenis com a MESMA configuração que o sítio tinha antes de ser
 * removido (ver o commit 7d047fe), com uma só diferença deliberada:
 * `syncTouch` passa a ser um parâmetro. É essa a pergunta — a configuração
 * antiga tinha `syncTouch: false`, ou seja o telemóvel NUNCA teve inércia por
 * JavaScript, e portanto a remoção nunca lhe tocou.
 */
function preparoLenis(syncTouch) {
  return `
(() => {
  const l = new globalThis.Lenis({
    lerp: 0.1,
    wheelMultiplier: 1,
    smoothWheel: true,
    syncTouch: ${syncTouch ? "true" : "false"},
    anchors: { offset: -96 },
  });
  window.__lenis = l;
  const raf = (t) => { l.raf(t); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
})();
`;
}

async function gesto(cdp, page, vp, paraCima) {
  const x = Math.round(vp.width / 2);
  const dist = Math.round(vp.height * 0.65);
  const y0 = paraCima ? Math.round(vp.height * 0.18) : Math.round(vp.height * 0.82);
  const s = paraCima ? 1 : -1;
  if (DESKTOP) {
    for (let i = 0; i < 12; i++) {
      await cdp.send("Input.dispatchMouseEvent", {
        type: "mouseWheel",
        x,
        y: Math.round(vp.height / 2),
        deltaX: 0,
        deltaY: Math.round((-s * dist) / 12),
      });
      await page.waitForTimeout(12);
    }
    return;
  }
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

  let lenisVivo = null;
  const comLenis = VARIANTE_B === "lenis" || VARIANTE_B === "lenis-so-roda";
  if (variante === "B") {
    if (comLenis) {
      if (!fonteLenis) throw new Error("--variante-b lenis exige --lenis-js");
      await page.addScriptTag({ content: fonteLenis });
      // `lenis` = inércia também no toque (opção c). `lenis-so-roda` = a
      // configuração histórica, com o toque entregue ao nativo (opção b).
      await page.evaluate(preparoLenis(VARIANTE_B === "lenis"));
      lenisVivo = await page.evaluate(() => Boolean(window.__lenis));
      if (!lenisVivo) throw new Error("Lenis não arrancou — variante B seria falsa");
      // A sonda da prova: DEPOIS do Lenis e no MESMO alvo (window). Ver o
      // cabeçalho — em `document` a ordem de bolha mente.
      await page.evaluate(
        (tipo) => {
          window.__prova = { total: 0, impedido: 0 };
          window.addEventListener(
            tipo,
            (e) => {
              window.__prova.total++;
              if (e.defaultPrevented) window.__prova.impedido++;
            },
            { passive: true },
          );
        },
        DESKTOP ? "wheel" : "touchmove",
      );
    } else if (VARIANTE_B === "proprio") {
      if (!fontePropria) throw new Error("--variante-b proprio exige --proprio-js");
      await page.addScriptTag({ content: fontePropria });
      await page.evaluate(() => {
        if (typeof globalThis.ligarInerciaDaRoda !== "function") {
          throw new Error("o motor próprio não expôs ligarInerciaDaRoda");
        }
        window.__apagar = globalThis.ligarInerciaDaRoda(window);
      });
      // A mesma prova de que a variante B é mesmo a variante B.
      await page.evaluate(
        (tipo) => {
          window.__prova = { total: 0, impedido: 0 };
          window.addEventListener(
            tipo,
            (e) => {
              window.__prova.total++;
              if (e.defaultPrevented) window.__prova.impedido++;
            },
            { passive: true },
          );
        },
        DESKTOP ? "wheel" : "touchmove",
      );
    } else if (VARIANTE_B === "css" && CSS_B) {
      await page.addStyleTag({ content: CSS_B });
    }
  }

  await page.waitForTimeout(1400); // deixa assentar a hidratação
  await page.evaluate(() => {
    window.__M.dts.length = 0;
    window.__M.ys.length = 0;
    window.__M.gestos.length = 0;
    window.__M.extremos.length = 0;
    window.__M.longtasks.length = 0;
    window.__M.distancia = 0;
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
  const prova = await page.evaluate(() => window.__prova ?? null);
  await page.close();
  // Sem eventos impedidos, o Lenis está montado mas não está a conduzir: a
  // variante B seria o braço A outra vez. Vale mais parar do que publicar isso.
  // Só se exige a prova onde a variante TEM de interceptar: inércia no toque em
  // telemóvel, ou o nosso motor na roda em computador. O `lenis-so-roda` num
  // telemóvel não intercepta nada de propósito — é esse o seu ponto.
  const temDeInterceptar =
    (VARIANTE_B === "lenis" && !DESKTOP) ||
    (VARIANTE_B === "lenis" && DESKTOP) ||
    (VARIANTE_B === "proprio" && DESKTOP);
  if (variante === "B" && temDeInterceptar && (!prova || prova.impedido === 0)) {
    throw new Error(
      `variante B falsa: o Lenis não impediu nenhum evento de entrada (${JSON.stringify(prova)})`,
    );
  }

  // Corta a pausa de arranque (o mesmo filtro do arnês irmão), mantendo os três
  // vectores alinhados índice a índice.
  const dts = [];
  const ys = [];
  const gestos = [];
  const extremos = [];
  for (let i = 0; i < M.dts.length; i++) {
    if (M.dts[i] >= 4000) continue;
    dts.push(M.dts[i]);
    ys.push(M.ys[i]);
    gestos.push(M.gestos[i]);
    extremos.push(M.extremos[i]);
  }
  // Quanto da travessia foi passado encostado a um extremo. Acima de uns poucos
  // por cento, a travessia saturou e os números de pausa não valem nada — é o
  // aviso que faltava da primeira vez.
  const fraccaoNoExtremo = dts.length
    ? Math.round((extremos.filter((e) => e === 1).length / dts.length) * 1000) / 10
    : 0;
  const jankMs = Math.round(dts.reduce((a, d) => a + Math.max(0, d - ORCAMENTO_MS), 0));
  // A PÁGINA PAROU DEBAIXO DO DEDO. Acumula o tempo desde a última vez que o
  // `scrollY` mudou; a maior dessas pausas, DENTRO de um gesto, é a métrica.
  // Fora do gesto o acumulador é descartado (a pausa entre gestos é legítima).
  let pausa = 0;
  let maiorPausaMs = 0;
  let pausasLongas = 0; // pausas acima de 100 ms — engasgo a sério, não aliasing
  for (let i = 1; i < dts.length; i++) {
    // Fora do gesto, ou encostado ao topo/fundo: não conta, e o acumulador cai.
    if (gestos[i] !== 1 || extremos[i] === 1) {
      pausa = 0;
      continue;
    }
    if (ys[i] === ys[i - 1]) {
      pausa += dts[i];
      if (pausa > maiorPausaMs) maiorPausaMs = pausa;
    } else {
      if (pausa > 100) pausasLongas++;
      pausa = 0;
    }
  }
  if (pausa > 100) pausasLongas++;
  const distancia = Math.round(M.distancia);
  const ord = dts.slice().sort((a, b) => a - b);
  return {
    variante,
    carga: Math.round(carga * 100) / 100,
    frames: dts.length,
    jankMs,
    // Normalizado pela página REALMENTE percorrida — ver o cabeçalho. Sem isto
    // compara-se quem andou mais, não quem custou mais por pixel.
    jankPor1000px: distancia > 0 ? Math.round((jankMs / distancia) * 1000) : 0,
    maiorPausaMs: Math.round(maiorPausaMs),
    pausasLongas,
    distancia,
    acima50: dts.filter((d) => d > 50).length,
    p95: ord.length ? ord[Math.floor(ord.length * 0.95)] : 0,
    longtasks: M.longtasks.length,
    yMax: Math.round(M.yMax),
    scrollMaximo: Math.round(M.maximo),
    fraccaoNoExtremo,
    lenisVivo,
    // Quantos eventos de entrada o Lenis chegou mesmo a impedir nesta passagem.
    entradaImpedida: prova ? `${prova.impedido}/${prova.total}` : null,
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

/** Resumo emparelhado de uma métrica: mediana por braço, diferença e MDE. */
function emparelhar(corridas, campo) {
  const A = corridas.map((c) => c.A[campo]);
  const B = corridas.map((c) => c.B[campo]);
  const dif = corridas.map((c) => c.A[campo] - c.B[campo]);
  const s = desvio(dif);
  // MENOR DIFERENÇA DETECTÁVEL (MDE): teste t emparelhado, bilateral a 5% e 80%
  // de potência, ≈ 2,8 · s / √n. Abaixo disto o desenho não distingue o efeito
  // do ruído — e o resultado correcto é "não sei", nunca "não há diferença".
  const mde = corridas.length ? (2.8 * s) / Math.sqrt(corridas.length) : 0;
  return {
    A: { mediana: mediana(A), p25: quantil(A, 0.25), p75: quantil(A, 0.75) },
    B: { mediana: mediana(B), p25: quantil(B, 0.25), p75: quantil(B, 0.75) },
    diferencaEmparelhada: {
      mediana: mediana(dif),
      media: Math.round((dif.reduce((x, y) => x + y, 0) / dif.length) * 10) / 10,
      desvio: Math.round(s * 10) / 10,
      paresEmQueAEraPior: `${dif.filter((d) => d > 0).length}/${dif.length}`,
    },
    menorDiferencaDetectavelMs: Math.round(mde * 10) / 10,
    veredicto:
      // Sem variação nenhuma (todos os pares iguais) a MDE é 0 e a comparação
      // `|dif| < mde` daria "há efeito" para uma diferença de zero. Este caso
      // trata-se primeiro, ou o arnês afirma o contrário do que viu.
      mediana(dif) === 0 && s === 0
        ? "sem diferença observada (métrica constante nos dois braços)"
        : Math.abs(mediana(dif)) < mde
          ? "NÃO SEI (diferença abaixo da MDE deste desenho)"
          : mediana(dif) > 0
            ? "B melhor (A perde)"
            : "B pior (A ganha)",
  };
}

const navegador = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const contexto = await navegador.newContext(
  DESKTOP
    ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, serviceWorkers: "block" }
    : { ...devices["Pixel 7"], serviceWorkers: "block" },
);
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
    `par ${p}: A jank=${par.A.jankMs} pausa=${par.A.maiorPausaMs} dist=${par.A.distancia} | ` +
      `B jank=${par.B.jankMs} pausa=${par.B.maiorPausaMs} dist=${par.B.distancia} | carga=${par.A.carga}\n`,
  );
}
await navegador.close();

const resumo = {
  rota: ROTA,
  contexto: DESKTOP ? "computador 1440×900, roda do rato" : "Pixel 7, toque",
  variantes: { A: "como está (nativo)", B: NOME_B },
  pares: corridas.length,
  cpu: CPU,
  travessia: SUBIR ? `${GESTOS} gestos a descer + ${GESTOS} a subir` : `${GESTOS} gestos a descer`,
  yMaxMediano: {
    A: mediana(corridas.map((c) => c.A.yMax)),
    B: mediana(corridas.map((c) => c.B.yMax)),
  },
  scrollMaximo: mediana(corridas.map((c) => c.A.scrollMaximo)),
  // Se isto não for ~0, a travessia raspou no fim da página e as pausas mentem.
  fraccaoNoExtremoPct: {
    A: mediana(corridas.map((c) => c.A.fraccaoNoExtremo)),
    B: mediana(corridas.map((c) => c.B.fraccaoNoExtremo)),
  },
  distanciaMediana: {
    A: mediana(corridas.map((c) => c.A.distancia)),
    B: mediana(corridas.map((c) => c.B.distancia)),
  },
  jankMs: emparelhar(corridas, "jankMs"),
  jankPor1000px: emparelhar(corridas, "jankPor1000px"),
  maiorPausaMs: emparelhar(corridas, "maiorPausaMs"),
  pausasLongas: emparelhar(corridas, "pausasLongas"),
  cargaMediana: mediana(corridas.flatMap((c) => [c.A.carga, c.B.carga])),
  cargaMax: Math.max(...corridas.flatMap((c) => [c.A.carga, c.B.carga])),
};
console.log(JSON.stringify(resumo, null, 2));
if (SAIDA) writeFileSync(SAIDA, JSON.stringify({ resumo, corridas }, null, 2));
