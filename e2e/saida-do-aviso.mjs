/**
 * "COMO É QUE SE FECHA O ESPAÇO DE UM AVISO QUE SAI" — arnês de medição.
 *
 * A dívida do `Toast` dizia que animar a saída obrigava a animar a ALTURA, e
 * que altura é layout a cada fotograma. Havia uma terceira hipótese em cima da
 * mesa — colapsar por `grid-template-rows: 1fr → 0fr`, com a fama de "não ser
 * layout da mesma maneira". Fama não é medida. Isto é a medida.
 *
 * O QUE MEDE, e porque é que é o contador do browser e não um cronómetro:
 * o Chromium publica `LayoutCount` e `LayoutDuration` no `Performance.getMetrics`
 * do CDP. São os recálculos de layout que o motor REALMENTE fez. Um cronómetro
 * em JavaScript mediria o tempo da animação (que é 240 ms nas três, por
 * construção) e não diria nada sobre o custo.
 *
 * O CENÁRIO é o do defeito: uma página com 1500 linhas EM FLUXO — para se ver
 * se o colapso da pilha suja o documento — e por cima dela, `position: fixed`
 * no canto de baixo à direita, a pilha de quatro avisos com o `gap` e as
 * medidas reais do `Toast.tsx`. Sai sempre o mesmo (o último), para as três
 * variantes fazerem exactamente o mesmo trabalho.
 *
 * O QUE DEU, e não muda entre corridas (três repetições, ±2):
 *
 *     A · transicionar `height`               ~19 layouts   ~1,4 ms
 *     B · `grid-template-rows: 1fr → 0fr`     ~19 layouts   ~1,4 ms
 *     C · só `transform` nos irmãos (FLIP)     ~4 layouts   ~0,3 ms
 *
 * A LEITURA. B não é mais barato do que A: é o MESMO — um recálculo por
 * fotograma da transição, porque o browser interpola o tamanho da faixa e
 * volta a dispor a grelha e tudo o que ela contém. Os ~4 de C não são "por
 * fotograma": são as duas medições que o FLIP faz à mão (antes e depois de
 * tirar do fluxo) mais as leituras que as forçam. Ou seja, C é a única das
 * três que anima sem tocar em layout, e é a que está no `Toast.tsx`.
 *
 * A diferença que se costuma atribuir ao `grid-template-rows` é outra coisa:
 * o custo fica CONFINADO porque a pilha é `position: fixed` e portanto está
 * fora de fluxo — o que vale igualmente para a altura, e portanto não serve
 * para escolher entre as duas.
 *
 * USO
 *   node e2e/saida-do-aviso.mjs
 *
 * Não precisa de servidor nenhum: a página é montada com `setContent`. Fica
 * fora do `playwright.config.ts` de propósito — é um instrumento, não um
 * passeio, e não tem `expect`s de valor (a mesma razão que está escrita no
 * `playwright.medicao.config.ts`). O que ficou preso em teste está no
 * `Toast.saida.test.tsx`.
 */
import { chromium } from "playwright";

const CURVA = "cubic-bezier(0,0,0.2,1)";
const DUR = 240;

const PAGINA = `
<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px system-ui; }
  .linha { padding: 6px 12px; border-bottom: 1px solid #eee; display: flex; gap: 8px; }
  .linha span { flex: 1; }
  .pilha {
    position: fixed; right: 24px; bottom: 24px; z-index: 80;
    display: flex; flex-direction: column; gap: 8px; pointer-events: none;
  }
  .aviso {
    pointer-events: auto; display: flex; align-items: center; gap: 12px;
    min-width: 260px; max-width: 384px; background: #fff; border: 1px solid #ddd;
    border-radius: 12px; padding: 12px 12px 12px 16px; box-shadow: 0 8px 24px rgba(0,0,0,.12);
  }
  .env { display: grid; grid-template-rows: 1fr; }
  .env > .aviso { min-height: 0; }
</style></head><body>
  <main id="pagina"></main>
  <div class="pilha" id="pilha"></div>
<script>
const CURVA = "${CURVA}";
const DUR = ${DUR};
const pagina = document.getElementById("pagina");
for (let i = 0; i < 1500; i++) {
  const d = document.createElement("div");
  d.className = "linha";
  d.innerHTML = "<span>linha " + i + " com texto que ocupa largura</span><span>coluna dois</span>";
  pagina.appendChild(d);
}
const pilha = document.getElementById("pilha");
window.criar = (n) => {
  pilha.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const env = document.createElement("div");
    env.className = "env";
    env.innerHTML = '<div class="aviso"><span>aviso numero ' + i + ' com uma mensagem</span><button>x</button></div>';
    pilha.appendChild(env);
  }
  document.body.offsetHeight;
};

// A · a altura do envelope de h para zero.
window.sairAltura = () => new Promise((r) => {
  const env = pilha.children[3];
  env.style.height = env.getBoundingClientRect().height + "px";
  env.style.overflow = "hidden";
  env.offsetHeight;
  env.style.transition = "height " + DUR + "ms " + CURVA + ", opacity " + DUR + "ms " + CURVA;
  env.style.height = "0px";
  env.style.opacity = "0";
  setTimeout(() => { env.remove(); r(); }, DUR + 60);
});

// B · a faixa da grelha de 1fr para 0fr.
window.sairGrelha = () => new Promise((r) => {
  const env = pilha.children[3];
  env.style.overflow = "hidden";
  env.offsetHeight;
  env.style.transition = "grid-template-rows " + DUR + "ms " + CURVA + ", opacity " + DUR + "ms " + CURVA;
  env.style.gridTemplateRows = "0fr";
  env.style.opacity = "0";
  setTimeout(() => { env.remove(); r(); }, DUR + 60);
});

// C · o FLIP: quem sai vai para fora de fluxo, e os irmãos deslizam em
//     transform. É o que está no Toast.tsx.
window.sairTransform = () => new Promise((r) => {
  const env = pilha.children[3];
  const irmaos = [...pilha.children].filter((e) => e !== env);
  const antes = irmaos.map((e) => e.getBoundingClientRect().top);
  const caixa = env.getBoundingClientRect();
  const caixaPilha = pilha.getBoundingClientRect();
  pilha.style.minWidth = caixaPilha.width + "px";
  env.style.position = "absolute";
  env.style.top = (caixa.top - caixaPilha.top) + "px";
  env.style.right = "0px";
  env.style.width = caixa.width + "px";
  const depois = irmaos.map((e) => e.getBoundingClientRect().top);
  irmaos.forEach((e, i) => {
    e.style.transition = "none";
    e.style.transform = "translateY(" + (antes[i] - depois[i]) + "px)";
  });
  pilha.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    irmaos.forEach((e) => {
      e.style.transition = "transform " + DUR + "ms " + CURVA;
      e.style.transform = "translateY(0px)";
    });
    env.style.transition = "opacity " + DUR + "ms " + CURVA + ", transform " + DUR + "ms " + CURVA;
    env.style.opacity = "0";
    env.style.transform = "translateY(8px)";
  }));
  setTimeout(() => {
    env.remove();
    irmaos.forEach((e) => { e.style.transition = ""; e.style.transform = ""; });
    pilha.style.minWidth = "";
    r();
  }, DUR + 60);
});
</script></body></html>`;

const VARIANTES = [
  ["A · height", "sairAltura"],
  ["B · grid-template-rows", "sairGrelha"],
  ["C · so transform (FLIP)", "sairTransform"],
];

const metricas = async (cdp) => {
  const { metrics } = await cdp.send("Performance.getMetrics");
  const m = Object.fromEntries(metrics.map((x) => [x.name, x.value]));
  return {
    layouts: m.LayoutCount,
    layoutMs: m.LayoutDuration * 1000,
    estilos: m.RecalcStyleCount,
    estiloMs: m.RecalcStyleDuration * 1000,
  };
};

const REPETICOES = Number(process.env.REPETICOES ?? 3);
const browser = await chromium.launch();
console.log(`pilha de 4 avisos, 1500 linhas em fluxo, ${REPETICOES} repeticoes\n`);
for (const [nome, fn] of VARIANTES) {
  const somas = { layouts: 0, layoutMs: 0, estilos: 0, estiloMs: 0 };
  for (let i = 0; i < REPETICOES; i++) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.setContent(PAGINA);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    await page.evaluate(() => window.criar(4));
    await page.waitForTimeout(200);
    const a = await metricas(cdp);
    await page.evaluate((f) => window[f](), fn);
    const b = await metricas(cdp);
    for (const k of Object.keys(somas)) somas[k] += b[k] - a[k];
    await page.close();
  }
  const m = (k) => somas[k] / REPETICOES;
  console.log(
    nome.padEnd(26),
    "layouts:",
    m("layouts").toFixed(1).padStart(6),
    " layout ms:",
    m("layoutMs").toFixed(2).padStart(7),
    " recalc estilo:",
    m("estilos").toFixed(1).padStart(6),
    " estilo ms:",
    m("estiloMs").toFixed(2).padStart(7),
  );
}
/**
 * ── SEGUNDA PARTE: E O QUE SAI NÃO PODE SALTAR TAMBÉM ─────────────────────
 *
 * O FLIP tem uma armadilha que só se vê com a marcação REAL do `Toast` — a
 * pilha encostada ao fundo, e duas regiões (`role="alert"` e `role="status"`)
 * lá dentro. Quando o aviso passa a `position: absolute`, deixa de contar para
 * a altura do seu grupo; e como a pilha cresce para cima, o grupo encolhe PELO
 * TOPO e desce. Um `top` calculado com a caixa do grupo medida ANTES põe o
 * fantasma 42 a 50 px abaixo de onde estava: o aviso salta no primeiro
 * fotograma da saída, que é o defeito que isto existe para corrigir.
 *
 * Esta parte corre o FLIP nas duas ordens, nos quatro arranjos possíveis da
 * pilha, e imprime de quanto é que o fantasma saltou em cada uma. Com o grupo
 * medido DEPOIS — que é a ordem que está no `Toast.tsx` — dá zero nos quatro.
 */
const MARCACAO = `
<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box} body{margin:0;font:14px system-ui}
  .pilha{position:fixed;right:24px;bottom:24px;display:flex;flex-direction:column;gap:8px;pointer-events:none}
  .grupo{position:relative;display:flex;flex-direction:column;gap:8px}
  .aviso{pointer-events:auto;display:flex;align-items:center;gap:12px;min-width:260px;max-width:384px;
    background:#fff;border:1px solid #ddd;border-radius:12px;padding:12px 12px 12px 16px}
</style></head><body>
<div class="pilha" id="pilha">
  <div class="grupo" id="erros" role="alert"></div>
  <div class="grupo" id="infos" role="status"></div>
</div>
<script>
window.montar = (erros, infos) => {
  const faz = (g, pref, n) => {
    g.innerHTML = "";
    for (let i = 0; i < n; i++) {
      const d = document.createElement("div");
      d.className = "aviso"; d.id = pref + i;
      d.innerHTML = "<span>" + pref + " " + i + " mensagem</span>";
      g.appendChild(d);
    }
  };
  faz(document.getElementById("erros"), "erro", erros);
  faz(document.getElementById("infos"), "info", infos);
  document.body.offsetHeight;
};
window.flip = (alvoId, ordem) => {
  const pilha = document.getElementById("pilha");
  const alvo = document.getElementById(alvoId);
  const grupo = alvo.parentElement;
  const irmaos = [...document.querySelectorAll(".aviso")].filter((e) => e !== alvo);
  const antes = irmaos.map((e) => e.getBoundingClientRect().top);
  pilha.style.minWidth = pilha.getBoundingClientRect().width + "px";
  const caixa = alvo.getBoundingClientRect();
  if (ordem === "antes") {
    const g = grupo.getBoundingClientRect();
    alvo.style.position = "absolute";
    alvo.style.top = (caixa.top - g.top) + "px";
    alvo.style.right = "0px";
    alvo.style.width = caixa.width + "px";
  } else {
    alvo.style.position = "absolute";
    alvo.style.right = "0px";
    alvo.style.width = caixa.width + "px";
    const g = grupo.getBoundingClientRect();
    alvo.style.top = (caixa.top - g.top) + "px";
  }
  const depois = irmaos.map((e) => e.getBoundingClientRect().top);
  irmaos.forEach((e, i) => {
    const desvio = antes[i] - depois[i];
    e.style.transition = "none";
    e.style.transform = Math.abs(desvio) < 0.5 ? "" : "translateY(" + desvio + "px)";
  });
  pilha.offsetHeight;
  return {
    fantasma: +(alvo.getBoundingClientRect().top - caixa.top).toFixed(2),
    irmaosParados: irmaos.every((e, i) => Math.abs(e.getBoundingClientRect().top - antes[i]) < 0.5),
    deslocados: irmaos
      .map((e, i) => [e.id, +(depois[i] - antes[i]).toFixed(0)])
      .filter(([, d]) => d !== 0),
  };
};
</script></body></html>`;

const ARRANJOS = [
  { erros: 1, infos: 3, alvo: "info1", nome: "info do meio, com um erro por cima" },
  { erros: 1, infos: 3, alvo: "erro0", nome: "o erro do topo" },
  { erros: 1, infos: 3, alvo: "info2", nome: "o ultimo, encostado ao fundo" },
  { erros: 2, infos: 1, alvo: "erro1", nome: "erro de baixo, com um info por baixo" },
];

console.log("\ngeometria — de quanto e' que o aviso que sai SALTA no fotograma zero\n");
const pagina = await browser.newPage({ viewport: { width: 375, height: 667 } });
await pagina.setContent(MARCACAO);
for (const arranjo of ARRANJOS) {
  const linha = [];
  for (const ordem of ["antes", "depois"]) {
    await pagina.evaluate((c) => window.montar(c.erros, c.infos), arranjo);
    const r = await pagina.evaluate((a) => window.flip(a.alvo, a.ordem), {
      alvo: arranjo.alvo,
      ordem,
    });
    linha.push(`grupo medido ${ordem}: ${String(r.fantasma).padStart(6)} px`);
    if (ordem === "depois") {
      linha.push(`irmaos parados: ${r.irmaosParados}`);
      linha.push(
        `desliza: ${r.deslocados.map(([id, d]) => id + " " + d + "px").join(", ") || "ninguem"}`,
      );
    }
  }
  console.log(arranjo.nome.padEnd(38), linha.join("  |  "));
}
await pagina.close();

await browser.close();
