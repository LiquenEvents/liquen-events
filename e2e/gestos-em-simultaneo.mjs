/**
 * "QUANTOS GESTOS FAZ O ECRÃ QUANDO DUAS COISAS MUDAM AO MESMO TEMPO" — arnês
 * de medição.
 *
 * ── O QUE ISTO EXISTE PARA RESPONDER ───────────────────────────────────────
 *
 * Cada animação deste back office foi desenhada SOZINHA, e cada uma tem a sua
 * medição escrita ao lado (a `.bo-entrada` na paleta de comandos, a `.view-in`
 * ao trocar de Pedidos para Propostas, a `.bo-cena` na gaveta de nove blocos,
 * o FLIP da saída do aviso em `e2e/saida-do-aviso.mjs`). Nenhuma foi vista a
 * correr AO MESMO TEMPO QUE OUTRA — e é aí que o movimento passa de fluido a
 * agitado.
 *
 * ── PORQUE É QUE MEDE COM `getAnimations()` E NÃO COM UM CRONÓMETRO ────────
 *
 * `document.getAnimations()` devolve TODA a animação que o motor está a correr
 * naquele instante — animações de `@keyframes` e transições de CSS, as duas —,
 * cada uma com o seu `effect.getTiming()` (duração, atraso, curva declaradas),
 * o seu `playState` e o seu alvo. É a lista do próprio browser, não uma
 * reconstrução a partir do que se julga estar escrito no CSS: apanha o que
 * corre mesmo, incluindo o que ninguém pediu.
 *
 * A cada fotograma, o gravador aqui em baixo:
 *   · pergunta ao browser que animações estão vivas;
 *   · lê, uma vez por alvo, o `transform`/`translate` e a `opacity` COMPOSTOS,
 *     que é o que se vê;
 *   · guarda o instante.
 *
 * Daí saem as três respostas que o trabalho pede, e nenhuma delas é opinião:
 *   1. **quantos gestos correm ao mesmo tempo** — a concorrência máxima, e o
 *      instante em que acontece;
 *   2. **quanto tempo se sobrepõem** — os milissegundos em que cada par está
 *      os dois a mexer;
 *   3. **se algum anda contra o outro** — o sinal do `dy` de cada um. Dois
 *      gestos na mesma faixa do ecrã em que um SOBE e o outro DESCE saem
 *      marcados com `⟂ SENTIDOS OPOSTOS`.
 *
 * As transições de ESTADO (120 ms: cor, contorno, sombra do que está debaixo
 * do dedo) contam-se e mostram-se, mas ficam separadas dos gestos que
 * DESLOCAM: uma cor a mudar não disputa a atenção com uma caixa a entrar. A
 * conta que interessa — a que a regra da casa julga — é a dos gestos que
 * movem alguma coisa.
 *
 * ── O QUE NÃO SE CONTA ─────────────────────────────────────────────────────
 *
 * Animações INFINITAS (o `bo-shimmer` de um esqueleto, o `marquee`) são
 * ambiente: estão sempre lá e não pertencem a encontro nenhum. Aparecem na
 * lista com `AMBIENTE=1` e ficam fora da concorrência.
 *
 * USO
 *   node e2e/gestos-em-simultaneo.mjs                 (todos os encontros)
 *   node e2e/gestos-em-simultaneo.mjs 3 4             (só o 3 e o 4)
 *   CALMO=1 node e2e/gestos-em-simultaneo.mjs         (prefers-reduced-motion)
 *   BASE=http://localhost:3218 node e2e/…             (outro servidor)
 *   TUDO=1 node e2e/…                                 (lista também as
 *                                                      transições de estado)
 *   MARCAS=1 node e2e/…                               (a cronologia inteira do
 *                                                      MutationObserver)
 *
 * E O CHROMIUM ESTÁ EM `/opt/pw-browsers`, não em `~/.cache/ms-playwright`
 * (que está vazio nesta máquina e já enganou quem veio antes):
 *
 *   PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers node e2e/gestos-em-simultaneo.mjs
 *
 * PRECISA DE UM SERVIDOR QUE GRAVE. É o mesmo requisito do
 * `playwright.dados.config.ts`, e pela mesma razão escrita lá: o encontro do
 * painel e o dos avisos precisam de um pedido na lista, e um build de produção
 * sem Supabase recusa toda a escrita (`assertWritableInProd`). Arranca-se
 * assim, e este arnês aponta para lá:
 *
 *   SESSION_SECRET=… ADMIN_PASSWORD_HASH=… npm run dev -- --port 3217
 *
 * ── O QUE ISTO DEIXA ESCRITO NO ARMAZÉM, E O QUE NÃO ─────────────────────
 *
 * NÃO apaga nada. Os encontros 1 e 2 precisam de uma acção destrutiva para
 * fazer nascer o aviso, e por isso o `DELETE` é respondido DENTRO da página
 * (ver o `FINGIR_APAGAR_OK`): o servidor nunca é chamado e a lista dela fica
 * como estava.
 *
 * O encontro 5 ESCREVE, e é bom sabê-lo: abrir uma linha da lista de Pedidos
 * leva ao estúdio de propostas, que grava um rascunho sozinho. Fica uma
 * entrada no `activity` e um `lastUpdated` novo no pedido que estava em cima
 * — sempre o mesmo, o primeiro da ordem em que a lista estiver. Corre-se com
 * `node e2e/gestos-em-simultaneo.mjs 0 1 2 3 4 8` para não tocar em nada.
 *
 * Fica FORA do `playwright.config.ts` de propósito — é um instrumento, não um
 * passeio, e não tem `expect`s de valor. É a mesma razão que está escrita no
 * `e2e/saida-do-aviso.mjs` e no `playwright.medicao.config.ts`.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.BASE ?? "http://localhost:3217";
const CALMO = !!process.env.CALMO;
const SO = process.argv
  .slice(2)
  .filter((a) => /^\d+$/.test(a))
  .map(Number);

/* ═══════════════════════════════════════════════════════════════════════════
   O GRAVADOR — vive na página, e é o único sítio onde se mede
   ═══════════════════════════════════════════════════════════════════════════ */
const GRAVADOR = () => {
  const ids = new WeakMap();
  let n = 0;
  const idDe = (a) => {
    if (!ids.has(a)) ids.set(a, ++n);
    return ids.get(a);
  };

  /** Um nome legível para o alvo. As classes do Tailwind são o que o identifica. */
  const desc = (el) => {
    if (!el || !el.tagName) return "(sem alvo)";
    const cls = (typeof el.className === "string" ? el.className : "")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 6)
      .join(".");
    const papel = el.getAttribute && el.getAttribute("role");
    return (
      el.tagName.toLowerCase() +
      (el.id ? "#" + el.id : "") +
      (cls ? "." + cls : "") +
      (papel ? "[role=" + papel + "]" : "")
    );
  };

  /**
   * A DESLOCAÇÃO COMPOSTA, em píxeis, NOS DOIS EIXOS.
   *
   * Soma as duas maneiras de a escrever, porque nesta casa existem as duas: a
   * propriedade AUTÓNOMA `translate` (é o que as classes `translate-*` do
   * Tailwind v4 emitem — ver o `ui/movimento.ts`) e a matriz do `transform`
   * (é o que as `@keyframes` da `.bo-entrada`, da `.view-in` e da `.bo-cena`
   * escrevem). Ler só uma delas perdia metade dos gestos desta casa.
   *
   * E os DOIS EIXOS, não só o vertical: a gaveta do telemóvel entra e sai
   * pela ESQUERDA (`-translate-x-full`). Uma primeira versão deste gravador
   * só media o `y` e classificou os 300 ms da gaveta como uma transição de
   * cor — ou seja, perdeu exactamente o gesto do encontro 3.
   */
  const desloc = (cs) => {
    let dx = 0;
    let dy = 0;
    const tl = cs.translate;
    if (tl && tl !== "none") {
      const p = tl.split(/\s+/);
      dx += parseFloat(p[0]) || 0;
      if (p.length >= 2) dy += parseFloat(p[1]) || 0;
    }
    const tr = cs.transform;
    if (tr && tr !== "none") {
      const m = tr.match(/matrix\(([^)]+)\)/);
      if (m) {
        const v = m[1].split(",");
        dx += parseFloat(v[4]) || 0;
        dy += parseFloat(v[5]) || 0;
      }
      const m3 = tr.match(/matrix3d\(([^)]+)\)/);
      if (m3) {
        const v = m3[1].split(",");
        dx += parseFloat(v[12]) || 0;
        dy += parseFloat(v[13]) || 0;
      }
    }
    return { dx: +dx.toFixed(2), dy: +dy.toFixed(2) };
  };

  let correr = false;
  let t0 = 0;
  let registo = new Map();
  let quadros = 0;
  /**
   * ── A VIGIA — o que se MEXE SEM ANIMAÇÃO NENHUMA ─────────────────────────
   *
   * O `getAnimations()` só conhece o que o motor está a animar. Um elemento
   * que SALTA de um sítio para o outro entre dois fotogramas não anima nada, e
   * portanto é invisível para a lista — que é exactamente o defeito do
   * encontro 2 («a entrada de um aviso novo faz saltar os que já lá estão»).
   *
   * A vigia é a outra metade: um selector cujos elementos são medidos à régua
   * (`getBoundingClientRect`) a cada fotograma. Daí sai o SALTO — a maior
   * diferença de posição entre dois fotogramas seguidos — e o PERCURSO
   * composto, que é o que o olho vê depois de somados todos os `transform`
   * dos antepassados. Um bloco com 12 px de `.bo-cena` dentro de um invólucro
   * com 8 px de `.view-in` percorre 20, e é a régua que o diz.
   */
  let vigia = null;
  let vistos = new Map();

  /**
   * ── A CRONOLOGIA DAS MARCAS — o que foi PEDIDO, tenha sido pintado ou não ─
   *
   * O `getAnimations()` só conhece o que existe nos fotogramas em que se
   * olhou. Se o fio principal ficar preso, uma saída de 200 ms pode nascer e
   * morrer no buraco e não aparecer em lista nenhuma — e aí o gravador diria,
   * erradamente, «não houve gesto».
   *
   * Um `MutationObserver` nas CLASSES não depende de fotograma nenhum: regista
   * o instante em que a `.bo-saida` foi posta e o instante em que o nó foi
   * arrancado, aconteça o que acontecer ao ecrã pelo meio. É com as duas
   * leituras lado a lado que se percebe a diferença entre «este gesto não
   * existe» e «este gesto foi pedido e ninguém o viu».
   */
  let marcas = [];
  const INTERESSA = /\b(bo-entrada|bo-saida|bo-cena|view-in)\b/;
  const observador = new MutationObserver((mutacoes) => {
    if (!correr) return;
    const t = +(performance.now() - t0).toFixed(1);
    for (const m of mutacoes) {
      if (m.type === "attributes") {
        const cls = String(m.target.className || "");
        const antes = String(m.oldValue || "");
        for (const nome of cls.match(INTERESSA) || []) {
          if (!antes.includes(nome)) marcas.push({ t, o: "posta", nome, alvo: desc(m.target) });
        }
        for (const nome of antes.match(INTERESSA) || []) {
          if (!cls.includes(nome)) marcas.push({ t, o: "tirada", nome, alvo: desc(m.target) });
        }
      } else {
        for (const nd of m.addedNodes) {
          if (nd.nodeType === 1 && INTERESSA.test(String(nd.className || ""))) {
            marcas.push({
              t,
              o: "montada",
              nome: String(nd.className).match(INTERESSA)[0],
              alvo: desc(nd),
            });
          }
        }
        for (const nd of m.removedNodes) {
          if (nd.nodeType === 1 && INTERESSA.test(String(nd.className || ""))) {
            marcas.push({
              t,
              o: "desmontada",
              nome: String(nd.className).match(INTERESSA)[0],
              alvo: desc(nd),
            });
          }
        }
      }
    }
  });

  function amostra() {
    if (!correr) return;
    const t = +(performance.now() - t0).toFixed(1);
    quadros += 1;
    const vivos = document.getAnimations();
    // UMA leitura de estilo por ALVO e por fotograma. Sem esta desduplicação,
    // dez animações no mesmo nó custavam dez recálculos forçados — o
    // instrumento passava a ser parte do que mede.
    const estilos = new Map();
    for (const a of vivos) {
      const alvo = a.effect && a.effect.target;
      if (alvo && !estilos.has(alvo)) estilos.set(alvo, getComputedStyle(alvo));
    }
    for (const a of vivos) {
      const ef = a.effect;
      if (!ef || !ef.target) continue;
      const id = idDe(a);
      let r = registo.get(id);
      if (!r) {
        const tm = ef.getTiming();
        r = {
          tipo: a.constructor.name,
          // Uma animação de `@keyframes` diz o nome; uma transição diz a
          // PROPRIEDADE que está a transicionar, que é o que a identifica.
          nome: a.animationName || a.transitionProperty || "(web-animation)",
          alvo: desc(ef.target),
          duracao: tm.duration,
          atraso: tm.delay,
          curva: tm.easing,
          iteracoes: tm.iterations,
          quadros: [],
        };
        registo.set(id, r);
      }
      const cs = estilos.get(ef.target);
      const d = desloc(cs);
      r.quadros.push({
        t,
        estado: a.playState,
        dx: d.dx,
        dy: d.dy,
        op: +parseFloat(cs.opacity).toFixed(3),
      });
    }
    if (vigia) {
      const nos = document.querySelectorAll(vigia);
      let i = 0;
      for (const el of nos) {
        const chave = (el.id || el.className || "no") + "#" + i;
        i += 1;
        const r = el.getBoundingClientRect();
        if (!vistos.has(chave)) vistos.set(chave, { chave, alvo: desc(el), pontos: [] });
        vistos.get(chave).pontos.push({
          t,
          top: +r.top.toFixed(2),
          op: +parseFloat(getComputedStyle(el).opacity).toFixed(3),
        });
      }
    }
    requestAnimationFrame(amostra);
  }

  window.__gestos = {
    vigiar(selector) {
      vigia = selector;
    },
    arrancar() {
      registo = new Map();
      vistos = new Map();
      marcas = [];
      quadros = 0;
      t0 = performance.now();
      correr = true;
      observador.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class"],
        attributeOldValue: true,
      });
      requestAnimationFrame(amostra);
    },
    parar() {
      correr = false;
      observador.disconnect();
      return {
        quadros,
        gestos: [...registo.values()],
        vigiados: [...vistos.values()],
        marcas,
      };
    },
  };
};

/* ═══════════════════════════════════════════════════════════════════════════
   A LEITURA
   ═══════════════════════════════════════════════════════════════════════════ */

/** As propriedades que só REPINTAM. Contam-se, mas não disputam a atenção. */
const SO_PINTA = /^(background-color|color|border-color|box-shadow|fill|stroke|outline)/;

/**
 * As propriedades que REMEDEM. Uma transição nestas move tudo o que está à
 * volta e obriga o browser a dispor a página outra vez a cada fotograma — é a
 * regra «só `transform` e `opacity`» a ser quebrada, e por isso contam como
 * gesto mesmo quando o elemento em si não translada nada.
 */
const REMEDE = /^(padding|margin|width|height|font-size|top|left|right|bottom|gap|inset|flex|grid)/;

function analisar(bruto) {
  const gestos = [];
  /**
   * ── OS GESTOS QUE NUNCA FORAM APANHADOS A CORRER ──────────────────────────
   *
   * Uma animação só é amostrada nos fotogramas em que o browser PINTA. Se o
   * fio principal ficar preso mais tempo do que ela dura, ela nasce e morre
   * dentro do buraco: quando o gravador volta a olhar, o `playState` já é
   * `finished`. Isso não é um defeito do gravador — é a prova de que aquele
   * gesto NÃO FOI VISTO POR NINGUÉM, porque nenhum fotograma o mostrou.
   *
   * Ficam aqui, à parte, em vez de serem deitados fora em silêncio: uma saída
   * de 200 ms que se perde inteira dentro de um recálculo é exactamente o
   * defeito que este arnês existe para encontrar.
   */
  const perdidos = [];
  for (const g of bruto.gestos) {
    const corridos = g.quadros.filter((q) => q.estado === "running");
    if (corridos.length === 0) {
      if (g.duracao > 0 && isFinite(g.iteracoes)) {
        perdidos.push({ nome: g.nome, alvo: g.alvo, declarada: g.duracao, visto: g.quadros[0].t });
      }
      continue;
    }
    const infinito = g.iteracoes === null || !isFinite(g.iteracoes);
    const dys = corridos.map((q) => q.dy);
    const dxs = corridos.map((q) => q.dx);
    const dy0 = dys[0];
    const dy1 = dys[dys.length - 1];
    const dx0 = dxs[0];
    const dx1 = dxs[dxs.length - 1];
    const ampY = Math.max(...dys) - Math.min(...dys);
    const ampX = Math.max(...dxs) - Math.min(...dxs);
    // O eixo em que ele anda MAIS é o eixo do gesto. Um gesto que anda nos
    // dois (não há nenhum nesta casa) leria pelo maior, que é o que se vê.
    const eixo = ampX > ampY ? "x" : "y";
    const de = eixo === "x" ? dx0 : dy0;
    const ate = eixo === "x" ? dx1 : dy1;
    const ops = corridos.map((q) => q.op);
    gestos.push({
      nome: g.nome,
      tipo: g.tipo,
      alvo: g.alvo,
      declarada: g.duracao,
      atraso: g.atraso,
      curva: g.curva,
      ambiente: infinito,
      // «Desloca» quer dizer que alguma coisa ANDOU no ecrã, ou que a opacidade
      // varreu o intervalo todo. É este o conjunto que a regra da casa julga.
      remede: REMEDE.test(g.nome),
      desloca:
        !infinito &&
        (ampY > 0.5 ||
          ampX > 0.5 ||
          REMEDE.test(g.nome) ||
          (Math.max(...ops) - Math.min(...ops) > 0.2 && !SO_PINTA.test(g.nome))),
      inicio: corridos[0].t,
      fim: corridos[corridos.length - 1].t,
      observada: +(corridos[corridos.length - 1].t - corridos[0].t).toFixed(1),
      eixo,
      de,
      ate,
      sentido:
        eixo === "x"
          ? dx1 - dx0 > 0.5
            ? "→"
            : dx1 - dx0 < -0.5
              ? "←"
              : "—"
          : dy1 - dy0 > 0.5
            ? "desce"
            : dy1 - dy0 < -0.5
              ? "sobe"
              : "—",
      op0: ops[0],
      op1: ops[ops.length - 1],
    });
  }
  gestos.sort((a, b) => a.inicio - b.inicio || a.fim - b.fim);

  const desloca = gestos.filter((g) => g.desloca);
  const estados = gestos.filter((g) => !g.desloca && !g.ambiente);

  // A concorrência: quantos gestos que DESLOCAM correm no mesmo instante.
  const eventos = [];
  for (const g of desloca) eventos.push([g.inicio, 1], [g.fim, -1]);
  eventos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0;
  let max = 0;
  let tMax = 0;
  for (const [t, d] of eventos) {
    n += d;
    if (n > max) {
      max = n;
      tMax = t;
    }
  }

  const pares = [];
  for (let i = 0; i < desloca.length; i++) {
    for (let j = i + 1; j < desloca.length; j++) {
      const a = desloca[i];
      const b = desloca[j];
      const ov = Math.min(a.fim, b.fim) - Math.max(a.inicio, b.inicio);
      if (ov > 0) {
        pares.push({
          a,
          b,
          ov: +ov.toFixed(1),
          // Contrários só quando andam NO MESMO EIXO em sentidos diferentes.
          // Um a subir e outro a ir para a esquerda são dois gestos, não uma
          // contradição.
          contra:
            a.eixo === b.eixo && a.sentido !== "—" && b.sentido !== "—" && a.sentido !== b.sentido,
        });
      }
    }
  }
  pares.sort((x, y) => y.ov - x.ov);

  // O MAIOR BURACO ENTRE DOIS FOTOGRAMAS. Um gravador que corre em `rAF` só
  // é amostrado quando o browser pinta: se o fio principal parar, o buraco
  // aparece aqui. É a leitura que diz se alguma coisa ATRASOU a tarefa —
  // a regra da casa que nenhuma animação pode quebrar.
  let maiorBuraco = 0;
  const instantes = [...new Set(bruto.gestos.flatMap((g) => g.quadros.map((q) => q.t)))].sort(
    (a, b) => a - b,
  );
  for (let i = 1; i < instantes.length; i++) {
    maiorBuraco = Math.max(maiorBuraco, instantes[i] - instantes[i - 1]);
  }

  const t0 = desloca.length ? Math.min(...desloca.map((g) => g.inicio)) : 0;
  const t1 = desloca.length ? Math.max(...desloca.map((g) => g.fim)) : 0;

  // A VIGIA: percurso composto (o que o olho vê) e SALTO (o que se mexeu de um
  // fotograma para o outro sem ninguém a animá-lo).
  const vigiados = [];
  for (const v of bruto.vigiados ?? []) {
    // O PERCURSO conta todos os fotogramas em que o elemento existiu: é
    // preciso apanhar o primeiro, aquele em que ele ainda está a `opacity: 0`
    // e já está deslocado — é lá que começa o caminho que o olho vê.
    //
    // O SALTO conta só os fotogramas em que ele estava VISÍVEL: um aviso a
    // nascer com `opacity: 0` ainda não é nada, e a sua primeira posição não
    // é um salto de coisa nenhuma.
    if (v.pontos.length < 2) continue;
    const tops = v.pontos.map((x) => x.top);
    const p = v.pontos.filter((x) => x.op > 0.02);
    let salto = 0;
    let quando = 0;
    for (let i = 1; i < p.length; i++) {
      const d = Math.abs(p[i].top - p[i - 1].top);
      if (d > salto) {
        salto = d;
        quando = p[i].t;
      }
    }
    vigiados.push({
      alvo: v.alvo,
      percurso: +(Math.max(...tops) - Math.min(...tops)).toFixed(2),
      de: +tops[0].toFixed(1),
      ate: +tops[tops.length - 1].toFixed(1),
      salto: +salto.toFixed(2),
      quando: +quando.toFixed(0),
      quadros: v.pontos.length,
    });
  }

  return {
    gestos,
    desloca,
    estados,
    max,
    tMax,
    pares,
    vigiados,
    perdidos,
    marcas: bruto.marcas ?? [],
    maiorBuraco: +maiorBuraco.toFixed(0),
    emMovimento: +(t1 - t0).toFixed(0),
    quadros: bruto.quadros,
  };
}

function imprimir(titulo, r) {
  console.log("\n" + "═".repeat(100));
  console.log(titulo);
  console.log("═".repeat(100));
  console.log(
    `  gestos que DESLOCAM: ${r.desloca.length}` +
      `   ·   máximo em simultâneo: ${r.max} (aos ${r.tMax.toFixed(0)} ms)` +
      `   ·   ecrã em movimento: ${r.emMovimento} ms` +
      `   ·   transições de estado a acompanhar: ${r.estados.length}`,
  );
  console.log(
    `  fotogramas amostrados: ${r.quadros}   ·   maior buraco entre dois: ${r.maiorBuraco} ms` +
      (r.maiorBuraco > 60 ? "   ← o fio principal parou aqui" : ""),
  );
  if (r.desloca.length === 0) {
    console.log("  (nenhum gesto de deslocação — o ecrã ficou quieto)");
    return;
  }
  console.log("");
  console.log(
    "    início     fim  " +
      "gesto".padEnd(20) +
      "decl".padStart(6) +
      "obs".padStart(6) +
      "  " +
      "deslocação".padEnd(19) +
      "opacidade".padEnd(14) +
      "alvo",
  );
  for (const g of process.env.TUDO ? r.gestos : r.desloca) {
    console.log(
      "  " +
        g.inicio.toFixed(0).padStart(8) +
        g.fim.toFixed(0).padStart(8) +
        "  " +
        (g.nome.slice(0, 17) + (g.remede ? " ⚑" : "")).padEnd(20) +
        String(g.declarada).padStart(6) +
        g.observada.toFixed(0).padStart(6) +
        "  " +
        `${g.de}→${g.ate}${g.eixo} ${g.sentido}`.padEnd(19) +
        `${g.op0}→${g.op1}`.padEnd(14) +
        g.alvo.slice(0, 58),
    );
  }
  const comContra = r.pares.filter((p) => p.contra);
  if (r.pares.length) {
    console.log("\n  sobreposições — milissegundos em que os DOIS estão a mexer:");
    for (const p of r.pares.slice(0, 10)) {
      console.log(
        `    ${String(p.ov).padStart(6)} ms   ` +
          `${p.a.nome.slice(0, 18).padEnd(19)} × ${p.b.nome.slice(0, 18).padEnd(19)}` +
          (p.contra ? "   ⟂ SENTIDOS OPOSTOS" : ""),
      );
    }
    if (r.pares.length > 10) console.log(`    … e mais ${r.pares.length - 10} pares`);
  }
  if (comContra.length) {
    console.log(`\n  ⟂ ${comContra.length} par(es) a andar em sentidos contrários.`);
  }
  const remedem = r.desloca.filter((g) => g.remede);
  if (remedem.length) {
    console.log(
      `\n  ⚑ ${remedem.length} gesto(s) em propriedades que REMEDEM a página` +
        ` (${[...new Set(remedem.map((g) => g.nome))].join(", ")}) — a regra da casa é só \`transform\` e \`opacity\`.`,
    );
  }
  if (r.perdidos && r.perdidos.length) {
    console.log(
      "\n  gestos que NENHUM fotograma mostrou (nasceram e morreram dentro de um buraco do fio principal):",
    );
    for (const p of r.perdidos) {
      console.log(
        `    ${p.nome.slice(0, 18).padEnd(19)} ${String(p.declarada).padStart(5)} ms declarados` +
          `   já terminado quando se olhou, aos ${p.visto.toFixed(0)} ms   ${p.alvo.slice(0, 44)}`,
      );
    }
  }
  if (r.marcas.length) {
    // O React põe a mesma classe duas vezes no mesmo commit (StrictMode em
    // desenvolvimento); a cronologia interessa uma vez por marca e por nó.
    const vistas = new Set();
    const linhas = [];
    for (const m of r.marcas) {
      if (m.o === "tirada" && !process.env.MARCAS) continue;
      const chave = `${Math.round(m.t)}|${m.o}|${m.nome}|${m.alvo}`;
      if (vistas.has(chave)) continue;
      vistas.add(chave);
      linhas.push(
        `    ${m.t.toFixed(0).padStart(6)} ms   ${m.o.padEnd(11)} ${m.nome.padEnd(11)} ${m.alvo.slice(0, 52)}`,
      );
    }
    if (linhas.length) {
      console.log(
        "\n  cronologia das marcas (`MutationObserver` — o que foi PEDIDO, haja fotograma ou não):",
      );
      const tecto = process.env.MARCAS ? 60 : 14;
      for (const l of linhas.slice(0, tecto)) console.log(l);
      if (linhas.length > tecto)
        console.log(`    … e mais ${linhas.length - tecto} (MARCAS=1 mostra tudo)`);
    }
  }
  if (r.vigiados && r.vigiados.length) {
    console.log(
      "\n  à régua (`getBoundingClientRect`, o que o olho vê depois de somados os antepassados):",
    );
    console.log(
      "    " +
        "percurso".padStart(9) +
        "maior salto entre 2 quadros".padStart(30) +
        "  " +
        "topo".padEnd(16) +
        "elemento",
    );
    for (const v of r.vigiados) {
      console.log(
        "    " +
          `${v.percurso} px`.padStart(9) +
          `${v.salto} px (aos ${v.quando} ms)`.padStart(30) +
          "  " +
          `${v.de}→${v.ate}`.padEnd(16) +
          v.alvo.slice(0, 46),
      );
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   A CONDUÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

const SUBMISSAO = "e2e-gestos-em-simultaneo";

/** O mesmo formulário público que o `e2e/semear-pedido.ts` envia. */
function sementePayload(nome) {
  return {
    form: {
      name: nome,
      email: "gestos.e2e@example.pt",
      phone: "912345678",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      date: "2027-06-10",
      guests: 120,
      location: "Herdade da Maridona, Glória",
    },
    website: "",
    submissionId: SUBMISSAO,
  };
}

async function entrar(page) {
  const painel = page.getByRole("navigation", { name: /Navegação do back office/i });
  await page.goto(`${BASE}/pt/orcamento/admin`, {
    waitUntil: "domcontentloaded",
    timeout: 240_000,
  });
  // Com a sessão herdada o painel abre directo — mas não no primeiro
  // fotograma: o HTML chega antes do JavaScript. Um `isVisible()` imediato
  // dava falso e mandava preencher um formulário que já não existe (medido:
  // era assim que a corrida com `prefers-reduced-motion` morria num
  // `getByLabel` que nunca ia aparecer).
  if (
    await painel
      .waitFor({ state: "visible", timeout: 20_000 })
      .then(() => true)
      .catch(() => false)
  ) {
    return;
  }
  await page
    .waitForResponse((r) => r.url().includes("/api/admin/passkeys/entrada"), { timeout: 120_000 })
    .catch(() => null);
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  await painel.waitFor({ state: "visible", timeout: 180_000 });
}

/** Garante um pedido na lista — o painel e os avisos precisam de um. */
async function semear(page) {
  for (let i = 0; i < 10; i += 1) {
    const res = await page.request.get(`${BASE}/api/orcamento`);
    if (res.status() === 401) {
      await page.waitForTimeout(300);
      continue;
    }
    if (res.ok()) {
      const lista = await res.json().catch(() => null);
      if (Array.isArray(lista) && lista.length > 0) return true;
    }
    break;
  }
  const criado = await page.request.post(`${BASE}/api/orcamento`, {
    data: sementePayload("Semente dos gestos"),
  });
  if (!criado.ok()) {
    console.log(
      `  (não foi possível semear um pedido: ${criado.status()} — os encontros 1, 2 e 5 ficam de fora)`,
    );
    return false;
  }
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 });
  await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ timeout: 180_000 });
  return true;
}

const browser = await chromium.launch();

/**
 * A SESSÃO ENTRA UMA VEZ, E TODOS OS ENCONTROS A HERDAM.
 *
 * Cada encontro quer um contexto novo (o ecrã tem de começar sempre do mesmo
 * sítio), e um contexto novo não tem cookies. Sem isto, oito encontros são
 * oito entradas — e o `POST /api/admin/login` tem um tecto de OITO POR MINUTO
 * por endereço. É a mesma armadilha, e o mesmo remédio, que estão escritos no
 * `e2e/sessao-admin.setup.ts`: o nono pedido leva 429, a entrada falha, e o
 * erro que se lê aponta para o sítio errado.
 */
const ESTADO = path.join(os.tmpdir(), "gestos-em-simultaneo-sessao.json");

/** Um contexto por medição, para o ecrã começar sempre do mesmo sítio. */
async function comEcra(largura, fn) {
  const ctx = await browser.newContext({
    viewport: { width: largura, height: largura < 700 ? 780 : 900 },
    storageState: fs.existsSync(ESTADO) ? ESTADO : undefined,
    ...(CALMO ? { reducedMotion: "reduce" } : {}),
  });
  await ctx.addInitScript(GRAVADOR);
  const page = await ctx.newPage();
  page.setDefaultTimeout(120_000);
  try {
    await entrar(page);
    await ctx.storageState({ path: ESTADO });
    await page.waitForTimeout(1200);
    return await fn(page);
  } finally {
    await ctx.close();
  }
}

/** Grava tudo o que o browser animar entre a acção e o fim da janela. */
async function medir(page, accao, ms = 1600, vigia = null) {
  await page.evaluate((v) => {
    window.__gestos.vigiar(v);
    window.__gestos.arrancar();
  }, vigia);
  await accao();
  await page.waitForTimeout(ms);
  const bruto = await page.evaluate(() => window.__gestos.parar());
  if (bruto.quadros === 0) {
    // Zero fotogramas em mais de um segundo não é uma medição de nada: é o
    // gravador a ter sido montado noutro contexto (uma navegação pelo meio) ou
    // a acção a não ter chegado a acontecer. Diz-se, em vez de se imprimir um
    // ecrã «quieto» que engana quem o lê.
    console.log("  ⚠ zero fotogramas amostrados — a medição não vale; repete-se o encontro.");
  }
  return analisar(bruto);
}

const naveg = (page) => page.getByRole("navigation", { name: /Navegação do back office/i });
const quer = (n) => SO.length === 0 || SO.includes(n);

console.log(
  `dois gestos ao mesmo tempo — ${BASE}${CALMO ? "   ·   COM prefers-reduced-motion: reduce" : ""}`,
);

/* ── 4b · A ENTRADA DENTRO DA ENTRADA ─────────────────────────────────────
   Sem interacção nenhuma: trocar de vista. O invólucro leva `.view-in`
   (240 ms, 8 px) e os blocos lá dentro levam `.bo-cena` (600 ms, 12 px). São
   duas entradas ENCAIXADAS, no mesmo conteúdo, nas duas bandas de velocidade
   ao mesmo tempo — que é o que a regra 1 proíbe («se uma animação hesitar
   entre as duas, está no sítio errado»), e é o mesmo defeito que o
   `ui/reordenar-nao-salta.test.tsx` já recusa por escrito noutro sítio:
   «duas entradas encaixadas: a `.bo-cena` do ecrã mais esta — 20 px e dois
   desvanecimentos». */
if (quer(0)) {
  const r = await comEcra(1280, async (page) => {
    await naveg(page)
      .getByRole("button", { name: /^Propostas$/ })
      .click();
    await page.waitForTimeout(2000);
    await naveg(page)
      .getByRole("button", { name: /^Pedidos/ })
      .click();
    await page.waitForTimeout(2000);
    // A vigia é posta nos blocos da vista: o que interessa provar é o
    // PERCURSO COMPOSTO — os 12 px da `.bo-cena` somados aos 8 px do
    // invólucro `.view-in` que os leva ao colo.
    return medir(
      page,
      () =>
        naveg(page)
          .getByRole("button", { name: /^Propostas$/ })
          .click(),
      1600,
      ".bo-cena",
    );
  });
  imprimir("ENCONTRO 0 · a entrada DENTRO da entrada — `.view-in` × `.bo-cena` (1280 px)", r);
}

/* ── 3 · TROCAR DE VISTA ENQUANTO A GAVETA DO TELEMÓVEL FECHA ────────────
   O gesto que ela faz dezenas de vezes por dia. Quatro coisas ao mesmo
   tempo, segundo o enunciado: a gaveta sai, a vista nova entra, o cabeçalho
   troca e o filete desliza. */
if (quer(3)) {
  const r = await comEcra(390, async (page) => {
    await page.getByRole("button", { name: "Mais destinos" }).click();
    await page.waitForTimeout(700);
    return medir(page, () =>
      naveg(page)
        .getByRole("button", { name: /Estatísticas/i })
        .click(),
    );
  });
  imprimir("ENCONTRO 3 · trocar de vista enquanto a gaveta do telemóvel fecha (390 px)", r);
}

/* ── 4 · UMA GAVETA ABRE DENTRO DE UMA VISTA QUE AINDA ESTÁ A ENTRAR ──────
   A vista traz 600 ms de apresentação; a gaveta traz 240 (ou 600, se for a
   dos nove blocos). Toca-se no resumo 120 ms depois da troca de vista — o
   tempo de um dedo rápido, e menos do que a entrada da vista dura. */
if (quer(4)) {
  const r = await comEcra(1280, async (page) => {
    await naveg(page)
      .getByRole("button", { name: /^Pedidos/ })
      .click();
    await page.waitForTimeout(1800);
    return medir(page, async () => {
      await naveg(page)
        .getByRole("button", { name: /Visão Geral/i })
        .click();
      await page.waitForTimeout(120);
      await page.getByText("Mais do painel", { exact: false }).first().click();
    });
  });
  imprimir("ENCONTRO 4 · a gaveta abre dentro de uma vista que ainda está a entrar (1280 px)", r);
}

/* ── 5 · ABRIR UM PEDIDO ENQUANTO A LISTA REORDENA ────────────────────────
   Reordena-se pelo cabeçalho da tabela (o `.view-in` que o
   `ui/TabelaOuCartoes.tsx` põe no `<tbody>`) e, 100 ms depois — ainda com a
   lista a entrar —, abre-se a primeira linha. A porta da lista de Pedidos é o
   `irFazerAProposta`, ou seja o ESTÚDIO (ver o comentário do `abrirDaListaRef`
   no `AdminClient.tsx`); as outras cinco portas abrem o painel. */
if (quer(5)) {
  const r = await comEcra(1280, async (page) => {
    await naveg(page)
      .getByRole("button", { name: /^Pedidos/ })
      .click();
    await page.waitForTimeout(2500);
    if (!(await semear(page))) return null;
    const cabecalho = page.getByRole("button", { name: /^Cliente/ }).first();
    await cabecalho.waitFor({ timeout: 30_000 });
    return medir(
      page,
      async () => {
        await cabecalho.click();
        await page.waitForTimeout(100);
        await page.locator("tbody tr").first().click();
      },
      2200,
    );
  });
  if (r) imprimir("ENCONTRO 5 · abrir um pedido enquanto a lista reordena (1280 px)", r);
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS DOIS ENCONTROS DO AVISO — e porque é que se medem OFFLINE
   ═══════════════════════════════════════════════════════════════════════════

   Os avisos deste back office nascem quase todos de uma acção que falha, e o
   `Toast.tsx` diz-se desenhado precisamente para esse caso («uma gravação em
   lote que falha em doze linhas dá doze caixas»). Fazer o `DELETE` abortar é
   a maneira de o reproduzir SEM APAGAR NADA: o `apagarMesmo` faz
   `setAApagarLote(null)` — o diálogo começa a sair — e só depois espera pelo
   pedido, que rejeita; nenhum pedido é removido, e o aviso de erro entra por
   cima do diálogo que ainda está a sair. É o encontro 1 tal e qual, e a lista
   dela fica como estava.

   ── E É `route.abort()`, NÃO `setOffline` ────────────────────────────────
   Medido: com `setOffline(true)` a rejeição levava ~280 ms a chegar, e nessa
   corrida o aviso entrava aos 484 ms com o diálogo já fora do ecrã aos 447 —
   ou seja, o encontro NÃO acontecia e a medição dizia «não há sobreposição»
   por causa do instrumento e não do produto. O `route.abort()` rejeita no
   fotograma seguinte, que é o pior caso realista (um 500 do servidor, uma
   rota que recusa à entrada) e o único em que os dois gestos se encontram
   mesmo. Quem quiser ver o outro extremo troca uma linha. */

/**
 * O `DELETE` responde OK sem nunca sair da página.
 *
 * ── PORQUE É QUE A RESPOSTA É FALSA, E PORQUE É QUE É *DENTRO* DA PÁGINA ──
 *
 * O aviso deste encontro nasce DEPOIS de o servidor responder (`apagarMesmo`
 * fecha o diálogo, espera pelo `DELETE`, e só então chama o `toast`). Ou seja:
 * a latência da resposta é que decide se os dois gestos se encontram ou não.
 * Medido, nas três maneiras:
 *
 *   · resposta VERDADEIRA do servidor local  ~10 ms   → encontram-se
 *   · `route.abort()` do Playwright         ~370 ms   → não se encontram
 *   · `context.setOffline(true)`            ~280 ms   → não se encontram
 *
 * As duas últimas medem o Playwright, não o produto: uma rota interceptada
 * dá a volta ao processo do condutor e volta. Substituir o `fetch` DENTRO da
 * página resolve num microtarefa — é o mesmo que uma resposta imediata, que é
 * o caso real de um servidor rápido e o ÚNICO em que o encontro acontece.
 *
 * E é falsa para não apagar nada: a lista dela fica exactamente como estava no
 * disco. O que muda é só o estado local do ecrã, que morre com o contexto.
 */
const FINGIR_APAGAR_OK = () => {
  const original = window.fetch;
  window.fetch = (entrada, init) => {
    const url = typeof entrada === "string" ? entrada : (entrada && entrada.url) || "";
    const metodo = (init && init.method) || (entrada && entrada.method) || "GET";
    if (metodo === "DELETE" && /\/api\/orcamento\//.test(url)) {
      return Promise.resolve(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      );
    }
    return original(entrada, init);
  };
};

/** Selecciona a primeira linha da lista e abre a pergunta destrutiva. */
async function pedirParaApagar(page) {
  await page.locator("tbody tr").first().getByRole("button").last().click();
  await page.waitForTimeout(300);
  await page.getByRole("button", { name: /^Apagar \(\d+\)/ }).click();
  const confirmar = page.getByRole("button", { name: /^Apagar \d+ pedido/ });
  await confirmar.waitFor({ timeout: 30_000 });
  await page.waitForTimeout(600);
  return confirmar;
}

async function irParaPedidos(page) {
  await naveg(page)
    .getByRole("button", { name: /^Pedidos/ })
    .click();
  await page.waitForTimeout(2500);
  await page.evaluate(FINGIR_APAGAR_OK);
}

const CAIXAS_DE_AVISO = '[role="alert"] > div, [role="status"] > div';

/* ── 1 · UM AVISO ENTRA ENQUANTO UM DIÁLOGO FECHA ─────────────────────────
   O `Toast` entra por cima (240 ms, a curva de quem apresenta, 8 px a subir);
   o `FolhaOuDialogo` sai com 200 ms e `--ease-in`, e o fundo apaga-se com ele.
   Vêem-se dois gestos em direcções diferentes na mesma faixa do ecrã? */
if (quer(1)) {
  const r = await comEcra(1280, async (page) => {
    await irParaPedidos(page);
    const confirmar = await pedirParaApagar(page);
    return medir(page, () => confirmar.click(), 1600, CAIXAS_DE_AVISO);
  });
  if (r) imprimir("ENCONTRO 1 · um aviso entra enquanto um diálogo fecha (1280 px)", r);
}

/* ── 2 · A ENTRADA DE UM AVISO EMPURRA OS QUE JÁ LÁ ESTÃO ─────────────────
   A dívida escrita no `Toast.tsx`, por quem construiu a SAÍDA: «a entrada de
   um aviso novo continua a fazer saltar os que já lá estão (a pilha cresce e
   empurra); é o mesmo FLIP ao contrário e não estava no âmbito.»

   O `getAnimations()` não vê isto — quem salta não anima nada. Quem o vê é a
   VIGIA: mede-se o topo de cada caixa a cada fotograma e olha-se para o maior
   salto entre dois fotogramas seguidos. Um aviso que DESLIZA move-se uns
   poucos píxeis por fotograma (a 60 Hz, 64 px em 200 ms são ~5 px por
   fotograma); um que SALTA move a altura de uma caixa inteira de uma vez. */
if (quer(2)) {
  const r = await comEcra(1280, async (page) => {
    await irParaPedidos(page);
    let confirmar = await pedirParaApagar(page);
    return medir(
      page,
      async () => {
        await confirmar.click();
        await page.waitForTimeout(600);
        confirmar = await pedirParaApagar(page);
        await confirmar.click();
        await page.waitForTimeout(600);
        confirmar = await pedirParaApagar(page);
        await confirmar.click();
      },
      1400,
      CAIXAS_DE_AVISO,
    );
  });
  if (r) imprimir("ENCONTRO 2 · a entrada de um aviso empurra os que já lá estão (1280 px)", r);
}

/* ── 8 · O CABEÇALHO ENCOLHE ENQUANTO SE ROLA ─────────────────────────────
   Não estava na lista, e é o encontro mais frequente de todos: rolar a lista
   de pedidos. Ao passar do topo, o cabeçalho condensa — e condensa em
   `padding` e em `font-size`, que são LAYOUT, ao mesmo tempo que a lista está
   a andar debaixo do dedo. Dois gestos, um deles a remedir a página a cada
   fotograma, e o outro a ser o próprio scroll.

   Mede-se duas vezes: como está, e com `prefers-reduced-motion: reduce`
   (`CALMO=1`). */
if (quer(8)) {
  const r = await comEcra(390, async (page) => {
    // No telemóvel a barra lateral é uma gaveta fechada; os quatro destinos do
    // dia vivem na barra de baixo, que tem nome próprio (ver `nav.tsx`).
    await page
      .getByRole("navigation", { name: /Destinos principais/i })
      .getByRole("button", { name: /^Pedidos/ })
      .click();
    await page.waitForTimeout(2500);
    return medir(
      page,
      async () => {
        await page.mouse.move(195, 500);
        await page.mouse.wheel(0, 400);
      },
      1200,
      "header, header h1, header > div",
    );
  });
  imprimir("ENCONTRO 8 · o cabeçalho encolhe enquanto se rola (390 px)", r);
}

await browser.close();
