/**
 * "E QUANDO O QUE SAI FECHA ESPAÇO ATRÁS DE SI" — arnês de medição.
 *
 * Companheiro do `e2e/saida-do-aviso.mjs`, e a pergunta é a mesma com o
 * cenário trocado. Lá, a pilha de avisos é `position: fixed` — está FORA de
 * fluxo, e o que ela colapsa não sujava o documento. Aqui não: o painel de
 * «espreitar o dia» do `Calendario.tsx` está EM FLUXO, por baixo da grelha do
 * mês e dentro do cartão. Quando ele sai, o cartão encolhe, tudo o que vem a
 * seguir sobe e a altura do documento muda.
 *
 * As três hipóteses são as mesmas, e por isso o método é o mesmo: os
 * contadores `LayoutCount`/`LayoutDuration` do `Performance.getMetrics` do CDP
 * — os recálculos que o motor REALMENTE fez, e não um cronómetro que só mediria
 * os 200 ms que as três têm por construção.
 *
 * O CENÁRIO é o do defeito, com a marcação real: um cabeçalho `position:
 * sticky` (o back office tem um), o cartão do calendário com as 42 células do
 * mês, a legenda, o painel do dia com quatro linhas, e por baixo do cartão 600
 * linhas em fluxo — o resto da página de administração.
 *
 * O QUE DEU (três repetições, Chromium 375×667, ±2 entre corridas):
 *
 *     A · transicionar `height`               17,0 layouts   1,52 ms
 *     B · `grid-template-rows: 1fr → 0fr`     15,0 layouts   1,49 ms
 *     C · FLIP (o painel sai de fluxo)         4,0 layouts   0,82 ms
 *     D · sem animação (tirar e pronto)        1,0 layout    0,09 ms
 *
 * A LEITURA, e é a que decide:
 *
 * 1. A e B voltam a dar o MESMO, como no aviso — e agora mais caro, porque
 *    cada fotograma remede o documento inteiro e não uma pilha fora de fluxo.
 *
 * 2. C é barato em layouts, e é aí que a conversa costuma acabar. Não pode
 *    acabar aí. O FLIP do `Toast` translada os IRMÃOS do que sai — quatro
 *    caixas, todas dentro da mesma pilha `fixed`. Aqui os «irmãos» são o resto
 *    da página: para o buraco fechar suavemente é preciso um `transform` num
 *    invólucro que contém tudo o que vem depois do cartão. Um `transform`
 *    persistente num antepassado cria bloco de contenção e parte qualquer
 *    `position: fixed`/`sticky` lá dentro — e este back office tem os dois.
 *    A parte `sticky` disto mede-se aqui em baixo, na SEGUNDA PARTE, e dá a
 *    resposta em píxeis.
 *
 * 3. E há um custo que nenhum contador de layout mostra: no instante em que o
 *    painel sai de fluxo, a altura do documento encolhe. Com a página rolada
 *    perto do fundo, o browser trava o `scrollTop` e a página inteira SALTA no
 *    fotograma zero da saída — o defeito que a animação existia para evitar,
 *    multiplicado pelo ecrã todo. Também está medido em baixo.
 *
 * USO
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e/saida-do-espreitar-o-dia.mjs
 *
 * Como o irmão: não precisa de servidor, monta a página com `setContent`, fica
 * fora do `playwright.config.ts` de propósito (é um instrumento, não um
 * passeio) e não tem `expect`s de valor.
 */
import { chromium } from "playwright";

const CURVA = "cubic-bezier(0.4,0,1,1)";
const DUR = 200;

const PAGINA = `
<!doctype html><html><head><meta charset="utf-8"><style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 14px system-ui; background: #f7f6f2; }
  header { position: sticky; top: 0; z-index: 10; background: #1b2119; color: #fff;
           padding: 10px 16px; }
  .cartao { background: #fff; border: 1px solid #e5e3dc; border-radius: 16px;
            margin: 16px; padding: 16px; }
  .grelha { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .celula { aspect-ratio: 1; border: 1px solid #eee; border-radius: 6px;
            padding: 4px; font-size: 11px; }
  .legenda { display: flex; gap: 8px; margin-top: 12px; font-size: 10px; }
  .painel { margin-top: 20px; border: 1px solid #e5e3dc; border-radius: 12px;
            background: #fafaf7; overflow: hidden; }
  .painel .cab { display: flex; justify-content: space-between; padding: 12px 16px;
                 border-bottom: 1px solid #e5e3dc; }
  .painel .item { display: flex; gap: 12px; padding: 12px 16px;
                  border-top: 1px solid #eee; }
  .painel .item span { flex: 1; }
  .env { display: grid; grid-template-rows: 1fr; }
  .env > .painel { min-height: 0; }
  .linha { padding: 6px 16px; border-bottom: 1px solid #eee; display: flex; gap: 8px; }
  .linha span { flex: 1; }
</style></head><body>
  <header id="topo">Back office — sticky</header>
  <div class="cartao">
    <div class="grelha" id="grelha"></div>
    <div class="legenda"><span>evento</span><span>reunião</span><span>nota</span></div>
    <div class="env" id="env">
      <div class="painel" id="painel">
        <div class="cab"><b>quinta-feira, 12 de junho</b><span>Adicionar ×</span></div>
        <div class="item"><span>Casamento Marta &amp; João · 120 convidados</span><i>Abrir</i></div>
        <div class="item"><span>Reunião com fornecedor · 10:00</span><i>Remover</i></div>
        <div class="item"><span>Data fechada · quinta do Vale</span><i>Remover</i></div>
        <div class="item"><span>Nota · confirmar tenda</span><i>Remover</i></div>
      </div>
    </div>
  </div>
  <main id="resto"></main>
<script>
const CURVA = "${CURVA}";
const DUR = ${DUR};
const grelha = document.getElementById("grelha");
for (let i = 0; i < 42; i++) {
  const d = document.createElement("div");
  d.className = "celula";
  d.textContent = String((i % 31) + 1);
  grelha.appendChild(d);
}
const resto = document.getElementById("resto");
for (let i = 0; i < 600; i++) {
  const d = document.createElement("div");
  d.className = "linha";
  d.innerHTML = "<span>pedido " + i + " com nome, local e data</span><span>coluna dois</span>";
  resto.appendChild(d);
}
document.body.offsetHeight;

const env = () => document.getElementById("env");
const painel = () => document.getElementById("painel");

// A · a altura do envelope, de h para zero.
window.sairAltura = () => new Promise((r) => {
  const e = env();
  e.style.height = e.getBoundingClientRect().height + "px";
  e.style.overflow = "hidden";
  e.offsetHeight;
  e.style.transition = "height " + DUR + "ms " + CURVA + ", opacity " + DUR + "ms " + CURVA;
  e.style.height = "0px";
  e.style.opacity = "0";
  setTimeout(() => { e.remove(); r(); }, DUR + 60);
});

// B · a faixa da grelha, de 1fr para 0fr.
window.sairGrelha = () => new Promise((r) => {
  const e = env();
  e.style.overflow = "hidden";
  e.offsetHeight;
  e.style.transition = "grid-template-rows " + DUR + "ms " + CURVA + ", opacity " + DUR + "ms " + CURVA;
  e.style.gridTemplateRows = "0fr";
  e.style.opacity = "0";
  setTimeout(() => { e.remove(); r(); }, DUR + 60);
});

// C · o FLIP. O painel sai de fluxo e o que vem A SEGUIR desliza em transform
//     — e "o que vem a seguir", aqui, é o resto da página.
window.sairFlip = () => new Promise((r) => {
  const e = env();
  const p = painel();
  const caixa = p.getBoundingClientRect();
  const alturaEnv = e.getBoundingClientRect().height;
  const cartao = e.parentElement;
  const seguintes = [document.getElementById("resto")];
  e.style.height = "0px";
  e.style.overflow = "visible";
  p.style.position = "absolute";
  p.style.width = caixa.width + "px";
  p.style.top = "0px";
  p.style.left = (caixa.left - cartao.getBoundingClientRect().left) + "px";
  cartao.style.position = "relative";
  seguintes.forEach((s) => {
    s.style.transition = "none";
    s.style.transform = "translateY(" + alturaEnv + "px)";
  });
  document.body.offsetHeight;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    seguintes.forEach((s) => {
      s.style.transition = "transform " + DUR + "ms " + CURVA;
      s.style.transform = "translateY(0px)";
    });
    p.style.transition = "opacity " + DUR + "ms " + CURVA + ", transform " + DUR + "ms " + CURVA;
    p.style.opacity = "0";
    p.style.transform = "translateY(-4px)";
  }));
  setTimeout(() => {
    e.remove();
    seguintes.forEach((s) => { s.style.transition = ""; s.style.transform = ""; });
    r();
  }, DUR + 60);
});

// Encurta a página para a forma real desta vista — o cartão do mês mais uma
// lista curta de próximos, ou seja pouco mais de um ecrã. É nesta forma que o
// travao do scrollTop morde.
window.encurtar = (n) => {
  const r = document.getElementById("resto");
  while (r.children.length > n) r.lastElementChild.remove();
  document.body.offsetHeight;
};

// D · o controlo: tirar o painel e deixar a página fechar o espaço.
window.sairSeco = () => new Promise((r) => {
  env().remove();
  document.body.offsetHeight;
  setTimeout(r, DUR + 60);
});
</script></body></html>`;

const VARIANTES = [
  ["A · height", "sairAltura"],
  ["B · grid-template-rows", "sairGrelha"],
  ["C · FLIP (fora de fluxo)", "sairFlip"],
  ["D · sem animacao", "sairSeco"],
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
console.log(
  `painel em fluxo dentro do cartao do mes, 600 linhas por baixo, ${REPETICOES} repeticoes\n`,
);
for (const [nome, fn] of VARIANTES) {
  const somas = { layouts: 0, layoutMs: 0, estilos: 0, estiloMs: 0 };
  for (let i = 0; i < REPETICOES; i++) {
    const page = await browser.newPage({ viewport: { width: 375, height: 667 } });
    await page.setContent(PAGINA);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
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
 * ── SEGUNDA PARTE: O QUE O CONTADOR DE LAYOUTS NÃO MOSTRA ─────────────────
 *
 * Duas medições em píxeis, as duas sobre a variante C, que é a única barata:
 *
 *  1. **O `sticky` parte.** Põe-se o cabeçalho dentro de um invólucro com
 *     `transform` — que é a forma que uma página real tem quando o que se
 *     translada é «tudo o que vem a seguir». MEDIDO: deixa de estar a 0 px do
 *     topo e passa a 24 px, ou seja deixa de estar colado. Um `transform`
 *     persistente num antepassado cria bloco de contenção, e o `sticky` passa
 *     a colar-se a ele em vez de ao ecrã.
 *
 *  2. **A página salta.** Rolada perto do fundo, tirar o painel de fluxo
 *     encolhe o documento e o browser trava o `scrollTop`. MEDIDO, na forma
 *     real desta vista (cartão do mês mais uma lista curta): o painel tem
 *     291 px, o `scrollY` cai de 643 para 352, e a GRELHA DO MÊS — aquilo para
 *     onde a pessoa está a olhar quando fecha o dia — salta 291 px no
 *     fotograma ZERO da saída.
 *
 * ── A CONCLUSÃO, E ESTÁ ESCRITA NO `Calendario.tsx` ───────────────────────
 *
 * Não animar. Das quatro, a única que não custa layout (C) é a que parte o
 * `sticky` e faz saltar a grelha um ecrã inteiro; as que não saltam (A e B)
 * custam quinze a dezassete recálculos por saída, num telemóvel. E o que este
 * painel fecha é o painel dela própria — carregou no «×» de dentro dele, ou
 * noutro dia, ou noutro mês: sabe para onde foi. Não animar é 1 recálculo e
 * nenhum salto.
 */
console.log("\ngeometria — o que a variante C custa em pixeis\n");

const pagina = await browser.newPage({ viewport: { width: 375, height: 667 } });
await pagina.setContent(PAGINA);

const sticky = await pagina.evaluate(() => {
  const topo = document.getElementById("topo");
  window.scrollTo(0, 400);
  document.body.offsetHeight;
  const colado = topo.getBoundingClientRect().top;
  // A forma real: o que se translada é um invólucro com o cabeçalho lá dentro.
  const inv = document.createElement("div");
  document.body.insertBefore(inv, document.body.firstChild);
  while (document.body.children.length > 1) inv.appendChild(document.body.children[1]);
  inv.style.transform = "translateY(24px)";
  document.body.offsetHeight;
  const comTransform = topo.getBoundingClientRect().top;
  return { colado, comTransform };
});
console.log(
  "cabecalho sticky, rolado a 400px".padEnd(38),
  `sem transform no antepassado: ${sticky.colado.toFixed(0)}px do topo  |  com transform: ${sticky.comTransform.toFixed(0)}px`,
);

await pagina.close();
const pagina2 = await browser.newPage({ viewport: { width: 375, height: 667 } });
await pagina2.setContent(PAGINA);
await pagina2.waitForFunction(() => document.querySelectorAll("#resto .linha").length === 600);
const salto = await pagina2.evaluate(() => {
  // A forma REAL desta vista: o cartão do mês mais uma lista curta de
  // próximos. Pouco mais de um ecrã — e é aqui que o travão morde, porque o
  // painel do dia é uma fatia grande do que a página tem para rolar.
  window.encurtar(14);
  window.scrollTo(0, document.documentElement.scrollHeight);
  document.body.offsetHeight;
  const antesScroll = window.scrollY;
  // A testemunha é a GRELHA DO MÊS: está por CIMA do painel, está no ecrã, e é
  // para ela que a pessoa está a olhar quando fecha o dia.
  const alvo = document.getElementById("grelha");
  const antesTop = alvo.getBoundingClientRect().top;
  const env = document.getElementById("env");
  const painel = document.getElementById("painel");
  const h = env.getBoundingClientRect().height;
  // O primeiro gesto do FLIP, e só ele: o painel sai de fluxo.
  env.style.height = "0px";
  painel.style.position = "absolute";
  document.body.offsetHeight;
  return {
    alturaPainel: +h.toFixed(0),
    scrollAntes: antesScroll,
    scrollDepois: window.scrollY,
    saltoDaGrelha: +(alvo.getBoundingClientRect().top - antesTop).toFixed(0),
  };
});
console.log(
  "pagina curta rolada ao fundo, painel sai de fluxo".padEnd(38),
  `painel: ${salto.alturaPainel}px  |  scrollY ${salto.scrollAntes} -> ${salto.scrollDepois}  |  a grelha do mes salta ${salto.saltoDaGrelha}px no fotograma zero`,
);

await pagina2.close();
await browser.close();
