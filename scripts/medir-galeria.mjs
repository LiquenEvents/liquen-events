/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MEDE A GALERIA — O QUE O VISITANTE SENTE, EM NÚMEROS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/medir-galeria.mjs [url-base] [--json ficheiro] [--perfil telemovel|secretaria]
 *
 * A queixa é "ao fazer scroll, as fotos de baixo ainda estão a carregar". Esse
 * sintoma tem um número por trás, e é o mais importante deste ficheiro:
 *
 *   ANTECIPAÇÃO = quantos píxeis ANTES de a foto entrar no ecrã é que o pedido
 *   dela partiu.
 *
 * Positivo e grande = o pedido saiu com o mosaico ainda longe, e há tempo de a
 * foto chegar. Zero ou negativo = o pedido só sai quando o mosaico JÁ está à
 * vista, e nesse caso não há rede que chegue: o visitante vê o buraco. Mede-se
 * cruzando o instante de cada pedido (PerformanceObserver de recursos) com a
 * posição do scroll nesse instante e com a posição do mosaico no documento.
 *
 * ── O QUE ISTO MEDE, E COMO ────────────────────────────────────────────────
 *  1. LCP, FCP, CLS, INP e bloqueio da thread principal — PerformanceObserver,
 *     com a página a ser percorrida como um visitante a percorre. O bloqueio
 *     vem SEPARADO em dois: o de CARREGAMENTO (que é o que a métrica TBT
 *     significa, e o que se compara com o alvo) e o da TRAVESSIA (a soma de
 *     mais de um minuto a percorrer 427 fotografias, que não se compara com
 *     alvo nenhum). Somá-los dava "TBT 1449 ms" onde o carregamento custa
 *     ~300 ms.
 *  2. Peso — `transferSize` por recurso, separando imagens do resto.
 *  3. Por imagem — bytes, píxeis servidos (lidos do NOME do ficheiro, porque o
 *     naturalWidth vem corrigido pela densidade e mente), píxeis de exibição,
 *     formato (pelo content-type) e o RÁCIO entre servido e exibido, que é
 *     onde os bytes se desperdiçam.
 *  4. Eager vs lazy, e a antecipação descrita acima.
 *  5. Descodificação — sonda própria: volta a descodificar uma amostra das
 *     imagens servidas com `createImageBitmap`, na mesma thread e com o mesmo
 *     estrangulamento de CPU. Não é o que o browser gastou (isso vive no
 *     rasterizador), é o custo de descodificar aquele ficheiro naquela
 *     máquina — que é o número que decide se a descodificação trava o scroll.
 *  6. Fluidez — a DISTRIBUIÇÃO dos intervalos de `requestAnimationFrame`
 *     durante uma travessia programática. Não "frames perdidos": ver a nota
 *     dentro da travessia sobre porque é que esse número não existe aqui.
 *  7. Placeholders — quantos mosaicos têm blur, quantos só têm cor, quantos
 *     não têm nada.
 *
 * ── O QUE NÃO MEDE ────────────────────────────────────────────────────────
 * É Chromium com estrangulamento, não um telemóvel de gama média a sério. Os
 * números são um PISO optimista: o aparelho real é mais lento. E `transferSize`
 * é zero para respostas vindas da cache do browser — por isso cada corrida
 * abre um contexto novo, sem cache.
 */

import { chromium, devices } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3123";
const JSON_OUT = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : "";
})();
const SO_PERFIL = (() => {
  const i = process.argv.indexOf("--perfil");
  return i >= 0 ? process.argv[i + 1] : "";
})();
/**
 * A VELOCIDADE DA TRAVESSIA, agora explícita — e porque isso importa.
 *
 * Os 900 px de 260 em 260 ms que aqui estavam dão ~1500 px/s medidos: um
 * scroll contínuo e educado. Um dedo a atirar a página faz 3000–5000 px/s, e
 * é aí que a antecipação deixa de comprar tempo suficiente. Medir só a
 * velocidade gentil e concluir "não há desfoque" seria responder a uma
 * pergunta que ninguém fez.
 *
 *   --passo <px>    px por salto      (omissão: 900)
 *   --espera <ms>   ms entre saltos   (omissão: 260)
 */
const numArg = (nome, omissao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? Number(process.argv[i + 1]) : omissao;
};
const PASSO_PX = numArg("--passo", 900);
const ESPERA_MS = numArg("--espera", 260);

/**
 * 4G lento, os números do painel do Chrome: 1,6 Mbit/s a descer, 750 kbit/s a
 * subir, 150 ms de latência. O CDP quer bytes por segundo.
 */
const REDE_4G_LENTO = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};
const CPU_THROTTLE = 4;

const PERFIS = [
  {
    nome: "telemovel",
    contexto: { ...devices["Pixel 7"], deviceScaleFactor: 3 },
  },
  {
    nome: "secretaria",
    contexto: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
  },
];

/**
 * Instalado ANTES de qualquer script da página: os observadores têm de existir
 * antes do primeiro pedido, senão perdem-se as entradas que interessam (o FCP
 * e o LCP acontecem cedo demais para se apanharem depois do `goto`).
 */
const SONDA = `
(() => {
  const M = (window.__medida = {
    lcp: 0, fcp: 0, cls: 0, inp: 0, tbt: 0,
    recursos: [],            // {url, inicio, tipo, bytes, corpo, dur}
    scrollPorInstante: [],   // {t, y}
    longas: [],              // {inicio, dur}
  });

  // O buffer de recursos do browser pára nas 250 entradas por omissão, e esta
  // galeria pede mais de 430. Sem isto, getEntriesByType("resource") devolve um
  // recorte silencioso e os bytes ficavam subcontados. O observador abaixo
  // apanha tudo à medida que chega; subir o tecto mantém as duas fontes de
  // acordo.
  try { performance.setResourceTimingBufferSize(8000); } catch (e) {}

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) M.lcp = Math.max(M.lcp, e.startTime);
  }).observe({ type: "largest-contentful-paint", buffered: true });

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") M.fcp = e.startTime;
  }).observe({ type: "paint", buffered: true });

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) M.cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });

  // INP: a pior interação da sessão (é assim que a métrica é definida).
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.interactionId) M.inp = Math.max(M.inp, e.duration);
    }
  }).observe({ type: "event", buffered: true, durationThreshold: 16 });

  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      M.longas.push({ inicio: e.startTime, dur: e.duration });
    }
  }).observe({ type: "longtask", buffered: true });

  // Cada recurso com o INSTANTE em que o pedido partiu. É metade da conta da
  // antecipação; a outra metade é a posição do scroll nesse instante.
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      M.recursos.push({
        url: e.name,
        inicio: e.startTime,
        tipo: e.initiatorType,
        bytes: e.transferSize || 0,
        corpo: e.encodedBodySize || 0,
        dur: e.duration,
      });
    }
  }).observe({ type: "resource", buffered: true });

  // Amostra do scroll a cada frame: dá-nos y(t) para cruzar com os pedidos.
  const amostra = () => {
    M.scrollPorInstante.push({ t: performance.now(), y: window.scrollY });
    requestAnimationFrame(amostra);
  };
  requestAnimationFrame(amostra);

  /**
   * PLACEHOLDERS, contados ANTES de as fotos chegarem.
   *
   * Tem de ser aqui: o next/image APAGA o background do placeholder assim que
   * a foto carrega, portanto contar no fim da sessão dá sempre perto de zero e
   * não distingue "tinha blur" de "nunca teve nada". O que interessa é o que o
   * visitante vê enquanto espera.
   */
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * QUANTO TEMPO CADA FOTOGRAFIA FICA DESFOCADA
   * ═══════════════════════════════════════════════════════════════════════
   *
   * A queixa é esta e não outra: "o cliente não devia ter de esperar que as
   * fotos deixem de estar desfocadas para a foto aparecer". O número que lhe
   * corresponde é, por mosaico:
   *
   *     desfocadoMs = (fotografia desenhada) − (mosaico entra no ecrã)
   *
   * ── Porquê o TILE e não o <img> ────────────────────────────────────────
   * O botão do mosaico leva 'content-visibility: auto'. Fora do ecrã os
   * descendentes NÃO TÊM CAIXA, portanto um IntersectionObserver sobre o
   * <img> nunca dispararia (está escrito no próprio GalleryImage.tsx). Observa-
   * -se '[data-tile-idx]', que é o elemento com caixa.
   *
   * ── O que conta como "desenhada" ───────────────────────────────────────
   * 'load' sozinho não chega: entre o 'load' e o pixel no ecrã há a
   * descodificação, que nesta galeria custa dezenas de ms com o CPU
   * estrangulado. Guardam-se três instantes:
   *   tLoad     — evento 'load' do <img>
   *   tDecode   — 'img.decode()' resolvido (bitmap pronto a pintar)
   *   tPintada  — o rAF seguinte ao decode (o frame em que pode aparecer)
   * O número principal usa 'tDecode', como pedido.
   *
   * ── O sinal negativo ──────────────────────────────────────────────────
   * Se a fotografia ficou pronta ANTES de o mosaico assomar, o visitante nunca
   * viu desfocado: 'desfocadoMs' é 0 e conta-se à parte como "chegou a tempo".
   * Guarda-se o valor cru com sinal para não se perder a margem.
   *
   * ── tSai ──────────────────────────────────────────────────────────────
   * Primeira vez que o mosaico deixa o ecrã. Se 'tDecode > tSai', a fotografia
   * chegou depois de o mosaico já ter passado: o visitante viu SÓ o desfocado
   * naquela passagem. É o pior caso da queixa e conta-se separadamente.
   */
  M.desfoque = [];
  M.desfoqueErro = "";
  try {
  const porTile = new Map();   // elemento do mosaico -> registo
  const imgsVistas = new WeakSet();

  const ioVisivel = new IntersectionObserver(
    (entradas) => {
      const agora = performance.now();
      for (const e of entradas) {
        const r = porTile.get(e.target);
        if (!r) continue;
        if (e.isIntersecting) {
          if (r.tEntra === null) r.tEntra = agora;
          r.visivel = true;
        } else {
          if (r.tEntra !== null && r.tSai === null) r.tSai = agora;
          r.visivel = false;
        }
      }
    },
    { threshold: 0 },
  );

  const engancharImg = (im, r) => {
    if (!im || imgsVistas.has(im)) return;
    imgsVistas.add(im);
    r.imgs++;
    r.im = im;   // apagado antes de serializar; serve o censo abaixo
    // O que o mosaico mostra ENQUANTO espera, lido no momento em que o <img>
    // aparece (depois some: o componente tira o background ao carregar).
    if (r.placeholder === null) {
      const fundoImg = im.style.backgroundImage || "";
      const tile = r.el;
      r.placeholder = /data:image/.test(fundoImg)
        ? "blur"
        : /rgb|#/.test((tile && tile.style.backgroundColor) || "")
          ? "cor"
          : "nada";
    }
    const marcar = () => {
      if (r.tLoad !== null) return;
      r.tLoad = performance.now();
      r.url = im.currentSrc || im.src || "";
      const fim = () => {
        if (r.tDecode !== null) return;
        r.tDecode = performance.now();
        requestAnimationFrame(() => {
          if (r.tPintada === null) r.tPintada = performance.now();
        });
      };
      try {
        const p = im.decode ? im.decode() : null;
        if (p && p.then) p.then(fim, fim);
        else fim();
      } catch (e) { fim(); }
    };
    if (im.complete && im.naturalWidth > 0) marcar();
    else im.addEventListener("load", marcar, { once: true });
  };

  const registarTile = (t) => {
    if (porTile.has(t)) return;
    const r = {
      idx: Number(t.getAttribute("data-tile-idx")),
      el: t,                 // apagado antes de serializar
      tCriado: performance.now(),
      tEntra: null, tSai: null, tLoad: null, tDecode: null, tPintada: null,
      url: "", imgs: 0, placeholder: null, visivel: false,
    };
    porTile.set(t, r);
    M.desfoque.push(r);
    ioVisivel.observe(t);
    engancharImg(t.querySelector("img"), r);
  };

  const varrerNo = (n) => {
    if (!n || n.nodeType !== 1) return;
    if (n.matches && n.matches("[data-tile-idx]")) registarTile(n);
    if (n.querySelectorAll) {
      for (const t of n.querySelectorAll("[data-tile-idx]")) registarTile(t);
    }
    // Um <img> pode nascer DEPOIS do mosaico (o componente remonta-o a cada
    // tentativa, com key={bust}). Liga-se ao registo do mosaico que o contém.
    const ligar = (im) => {
      const t = im.closest && im.closest("[data-tile-idx]");
      if (!t) return;
      registarTile(t);
      engancharImg(im, porTile.get(t));
    };
    if (n.tagName === "IMG") ligar(n);
    if (n.querySelectorAll) for (const im of n.querySelectorAll("img")) ligar(im);
  };

  // Orientado a eventos, não a sondagem: um setInterval a percorrer 427
  // mosaicos com o CPU 4x mais lento mudava aquilo que se está a medir.
  new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) varrerNo(n);
    // Observa-se o DOCUMENTO, não o document.documentElement.
    //
    // Esta sonda é instalada ANTES de existir conteúdo, e nesse instante
    // 'document.documentElement' ainda é null: o parser ainda não criou o
    // <html>. Passar null ao observe() atira TypeError, e como isto tudo corre
    // dentro de uma IIFE, o erro abortava o RESTO da sonda — foi assim que uma
    // corrida inteira saiu com 0 mosaicos observados e sem 'primeiraPintura'.
    // O nó 'document' existe sempre e um subtree a partir dele apanha o <html>
    // quando ele nascer.
  }).observe(document, { childList: true, subtree: true });

  const varreduraInicial = () => varrerNo(document.body);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", varreduraInicial);
  } else varreduraInicial();
  window.addEventListener("load", varreduraInicial);
  /**
   * ═══════════════════════════════════════════════════════════════════════
   * O CENSO — a mesma pergunta, medida por outro caminho
   * ═══════════════════════════════════════════════════════════════════════
   *
   * O tempo desfocado acima sai de dois carimbos (entrou no ecrã / decode
   * resolvido) e depende do IntersectionObserver entregar a observação a
   * horas. Com o CPU 4x mais lento e a thread ocupada, essa entrega pode
   * atrasar-se — e um 'tEntra' atrasado ENCURTA artificialmente o tempo
   * desfocado. Ou seja: o erro daquela sonda empurra o número para zero, que é
   * exactamente a resposta que convém. Não se aceita um número desses sem uma
   * segunda medição que falhe de outra maneira.
   *
   * O censo é essa segunda medição, e não usa carimbos nenhuns: em cada passo
   * do scroll pergunta ao DOM, mosaico a mosaico, o que está no ecrã AGORA e o
   * que esse mosaico está a mostrar. "Desfocado" é literalmente o que o
   * visitante vê: o <img> ainda tem o data:image do blur por baixo, porque o
   * componente só o tira no onLoad.
   */
  M.censo = [];
  M.fazerCenso = () => {
    const h = window.innerHeight;
    let visiveis = 0, desfocados = 0, semFoto = 0;
    for (const r of M.desfoque) {
      if (!r.el) continue;
      const c = r.el.getBoundingClientRect();
      if (c.bottom <= 0 || c.top >= h || c.height === 0) continue;
      visiveis++;
      const im = r.im;
      if (!im) { semFoto++; desfocados++; continue; }
      if (!(im.complete && im.naturalWidth > 0)) semFoto++;
      if (/data:image/.test(im.style.backgroundImage || "")) desfocados++;
    }
    M.censo.push({
      t: Math.round(performance.now()),
      y: window.scrollY,
      visiveis, desfocados, semFoto,
    });
  };
  } catch (e) {
    M.fazerCenso = () => {};
    // Nunca deixar esta sonda derrubar as outras: uma falha aqui tem de sair
    // como um campo vazio E uma mensagem, não como uma corrida silenciosamente
    // sem métricas.
    M.desfoqueErro = String((e && e.message) || e);
  }

  M.primeiraPintura = null;
  const contar = () => {
    const tiles = [...document.querySelectorAll("[data-tile-idx]")];
    let blur = 0, cor = 0, nada = 0;
    for (const t of tiles) {
      const im = t.querySelector("img");
      const temBlur = im && /data:image/.test(im.style.backgroundImage || "");
      const temCor = /rgb|#/.test(t.style.backgroundColor || "");
      if (temBlur) blur++;
      else if (temCor) cor++;
      else nada++;
    }
    M.primeiraPintura = {
      mosaicos: tiles.length,
      blur, cor, nada,
      pedidosAteAqui: M.recursos.length,
    };
  };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(contar, 0));
  } else setTimeout(contar, 0);
})();
`;

/** Percorre a página toda a uma velocidade humana, contando frames perdidos. */
const TRAVESSIA = `
(async (PASSO, ESPERA) => {
  const frames = [];
  let parar = false;
  const rAF = () => {
    frames.push(performance.now());
    if (!parar) requestAnimationFrame(rAF);
  };
  requestAnimationFrame(rAF);

  let anterior = -1;
  /**
   * MODO CONTÍNUO (--espera 0): um dedo a atirar a página.
   *
   * Os saltos com pausa medem um scroll educado. Um flick é movimento
   * CONTÍNUO e rápido, e a diferença não é só de velocidade: com saltos
   * grandes há mosaicos que passam inteiros entre dois frames e nunca chegam a
   * gerar uma observação de intersecção — ou seja, o próprio método perderia
   * de vista exactamente as fotografias que mais interessam. Aqui anda-se
   * PASSO px por frame, sem buracos, e tira-se o censo de 8 em 8 frames.
   */
  if (ESPERA === 0) {
    let n = 0;
    for (;;) {
      await new Promise((r) => requestAnimationFrame(r));
      window.scrollBy(0, PASSO);
      if (++n % 8 === 0) { try { window.__medida.fazerCenso(); } catch (e) {} }
      const y = window.scrollY;
      const noFim = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (noFim && y === anterior) break;
      anterior = y;
      if (n > 20000) break;
    }
  } else
  for (let i = 0; i < 400; i++) {
    window.scrollBy(0, PASSO);
    await new Promise((r) => setTimeout(r, ESPERA));
    // O censo é tirado DEPOIS da espera, ou seja no estado em que o visitante
    // ficaria a olhar se parasse aqui — não no frame imediatamente a seguir ao
    // salto, que mediria sempre o pior instante possível.
    try { window.__medida.fazerCenso(); } catch (e) {}
    const y = window.scrollY;
    const fim = y + window.innerHeight >= document.documentElement.scrollHeight - 4;
    if (fim && y === anterior) break;
    anterior = y;
  }
  parar = true;
  await new Promise((r) => setTimeout(r, 400));
  const censo = (window.__medida.censo || []).slice();

  /**
   * FLUIDEZ — e o que este número NÃO é.
   *
   * Um Chromium headless não tem pipeline de ecrã: o requestAnimationFrame
   * pode correr acima ou abaixo dos 60 Hz por razões que nada têm a ver com a
   * pagina. Contar "frames perdidos" a partir daqui, como se fosse um ecrã a
   * sério, era dar precisão a um numero que não a tem — e foi o que a primeira
   * versão deste ficheiro fez (dava 2200 frames em 25 s num perfil e 6231 em
   * 55 s noutro, ou seja, taxas base diferentes na mesma máquina).
   *
   * O que se guarda em vez disso é a DISTRIBUIÇÃO dos intervalos, que é
   * comparável entre corridas do mesmo arnês: a percentagem de intervalos
   * acima de 32 ms (dois frames a 60 Hz) e a cauda. Serve para comparar antes
   * e depois; não serve para dizer "o telemóvel dela perde N frames".
   */
  const ds = [];
  for (let i = 1; i < frames.length; i++) ds.push(frames[i] - frames[i - 1]);
  ds.sort((a, b) => a - b);
  const q = (p) => (ds.length ? Math.round(ds[Math.floor((p / 100) * ds.length)]) : 0);
  const acima32 = ds.filter((d) => d > 32).length;
  /**
   * O CENSO, resumido. 'desfocadosPorEcra' é a conta que responde à queixa:
   * em média, quantos mosaicos DOS QUE ESTÃO NO ECRÃ estão a mostrar o
   * desfocado em vez da fotografia.
   */
  const totVis = censo.reduce((s, c) => s + c.visiveis, 0);
  const totDes = censo.reduce((s, c) => s + c.desfocados, 0);
  const totSem = censo.reduce((s, c) => s + c.semFoto, 0);
  const passosComDesfoque = censo.filter((c) => c.desfocados > 0).length;
  const piorPasso = censo.reduce((m, c) => (c.desfocados > m ? c.desfocados : m), 0);
  return {
    censoPassos: censo.length,
    mosaicosVisiveisSomados: totVis,
    desfocadosSomados: totDes,
    semFotoSomados: totSem,
    percentagemDesfocadaNoEcra: totVis ? +((totDes / totVis) * 100).toFixed(1) : 0,
    percentagemSemFotoNoEcra: totVis ? +((totSem / totVis) * 100).toFixed(1) : 0,
    passosComAlgumDesfocado: passosComDesfoque,
    piorPassoDesfocados: piorPasso,
    mediaVisiveisPorPasso: censo.length ? +(totVis / censo.length).toFixed(1) : 0,
    intervalos: ds.length,
    medianaMs: q(50),
    p95Ms: q(95),
    p99Ms: q(99),
    piorMs: Math.round(ds[ds.length - 1] || 0),
    acimaDe32ms: acima32,
    percentagemAcima32: ds.length ? +((acima32 / ds.length) * 100).toFixed(1) : 0,
  };
})
`;

/** O estado final: cada imagem com bytes, píxeis servidos e píxeis de exibição. */
const INVENTARIO = `
(() => {
  const dpr = window.devicePixelRatio || 1;
  // A lista do OBSERVADOR, não a de getEntriesByType: é a única completa (ver
  // a nota sobre o tecto de 250 na sonda).
  const recursos = window.__medida.recursos;
  // A PRIMEIRA entrada de cada URL, não a última. Um ficheiro com
  // Cache-Control immutable pedido uma segunda vez produz uma entrada NOVA com
  // transferSize 0 (veio da cache) — guardar a última fazia 361 de 362 fotos
  // aparecerem com zero bytes e o peso da página parecer 20x menor do que é.
  const porUrl = new Map();
  for (const e of recursos) {
    const ja = porUrl.get(e.url);
    // Prefere-se a entrada que TEM corpo (encodedBodySize). Ver a nota grande
    // sobre bytes mais abaixo: o transferSize vem a zero em quase tudo com a
    // emulação de rede do CDP, por isso desempatar por ele mantinha entradas
    // vazias.
    if (!ja || (!ja.corpo && e.corpo) || (!ja.bytes && e.bytes)) porUrl.set(e.url, e);
  }

  const imgs = [...document.querySelectorAll("img")].map((im) => {
    const r = im.getBoundingClientRect();
    const t = porUrl.get(im.currentSrc) || {};
    const topoNoDoc = r.top + window.scrollY;
    /**
     * A LARGURA SERVIDA VEM DO NOME DO FICHEIRO, NÃO DE naturalWidth.
     *
     * Com um srcset de descritores w, a especificação manda o browser
     * devolver o tamanho intrínseco DIVIDIDO pela densidade que ele próprio
     * calculou (descritor ÷ largura de exibição). Medido: um ficheiro de
     * 1280 px desenhado numa caixa de 412 CSS px devolve naturalWidth = 412 —
     * ou seja, exactamente a largura de exibição, sempre, para qualquer foto.
     * Usar naturalWidth aqui dava um rácio servido/exibido de 1,00 em todo o
     * lado e escondia por completo o desperdício que este ficheiro existe para
     * encontrar.
     *
     * As derivadas chamam-se <chave>-<largura>.webp, portanto a largura real
     * está no nome. Sem nome utilizável, cai-se no naturalWidth (que pelo menos
     * não inventa).
     */
    const m = /-(\\d+)\\.(webp|avif)(\\?|$)/.exec(im.currentSrc || "");
    const servidoW = m ? Number(m[1]) : im.naturalWidth;
    return {
      url: im.currentSrc,
      alt: im.alt || "",
      loading: im.loading,
      fetchPriority: im.fetchPriority,
      decoding: im.decoding,
      servidoW,
      exibidoW: Math.round(r.width),
      exibidoH: Math.round(r.height),
      exibidoWfis: Math.round(r.width * dpr),
      // A regra é em CSS px ("nunca acima de 2x o tamanho de exibição").
      racio: r.width > 0 ? +(servidoW / r.width).toFixed(2) : 0,
      // E o mesmo contra os píxeis FÍSICOS, que é o que decide a nitidez.
      racioFisico: r.width > 0 ? +(servidoW / (r.width * dpr)).toFixed(2) : 0,
      bytes: t.bytes || 0,
      corpo: t.corpo || 0,
      inicio: t.inicio || 0,
      topoNoDoc: Math.round(topoNoDoc),
    };
  });

  /**
   * ═══════════════════════════════════════════════════════════════════════
   * OS BYTES CONTAM-SE PELO encodedBodySize, NÃO PELO transferSize
   * ═══════════════════════════════════════════════════════════════════════
   *
   * Está escrito no GALERIA-BEFORE.md §2.2 e o código não estava a cumpri-lo:
   * somava 'e.bytes' (transferSize). Com a emulação de rede do CDP ligada, o
   * transferSize vem a ZERO em quase todas as respostas — medido nesta corrida:
   * 7 de 429 imagens no telemóvel e 16 de 432 na secretária tinham
   * transferSize > 0, contra 383 e 432 com encodedBodySize > 0.
   *
   * O efeito era um peso de imagens vinte vezes menor do que o real e uma
   * mediana de KB por foto calculada sobre a mão-cheia de respostas onde o
   * transferSize calhou vir preenchido — ou seja, uma amostra de 7.
   *
   * Guardam-se os dois: 'corpo' (encodedBodySize, o número que se usa) e
   * 'transfer' (transferSize, mantido só para se ver que é inutilizável aqui).
   */
  let bytesTotais = 0, bytesImagem = 0, bytesImagemTransfer = 0, pedidos = 0;
  for (const e of recursos) {
    bytesTotais += e.corpo || 0;
    pedidos++;
    if (/\\.(webp|avif|jpe?g|png)(\\?|$)/i.test(e.url) || e.tipo === "img") {
      bytesImagem += e.corpo || 0;
      bytesImagemTransfer += e.bytes || 0;
    }
  }
  const nav = performance.getEntriesByType("navigation")[0];
  bytesTotais += (nav && nav.encodedBodySize) || 0;

  /**
   * Os registos de desfoque saem SEM a referência ao elemento ('el'), que não
   * é serializável e faria o page.evaluate devolver um erro em vez de dados.
   * Junta-se a cada um a posição do mosaico no documento e os bytes da
   * fotografia que lhe corresponde, para se poder cruzar depois.
   */
  const porUrlBytes = porUrl;
  const desfoque = window.__medida.desfoque.map((r) => {
    const cx = r.el ? r.el.getBoundingClientRect() : null;
    const t = porUrlBytes.get(r.url) || {};
    return {
      idx: r.idx,
      url: r.url,
      tCriado: +r.tCriado.toFixed(1),
      tEntra: r.tEntra === null ? null : +r.tEntra.toFixed(1),
      tSai: r.tSai === null ? null : +r.tSai.toFixed(1),
      tLoad: r.tLoad === null ? null : +r.tLoad.toFixed(1),
      tDecode: r.tDecode === null ? null : +r.tDecode.toFixed(1),
      tPintada: r.tPintada === null ? null : +r.tPintada.toFixed(1),
      placeholder: r.placeholder,
      imgs: r.imgs,
      bytes: t.bytes || 0,
      pedidoEm: t.inicio || 0,
      topoNoDoc: cx ? Math.round(cx.top + window.scrollY) : null,
    };
  });

  return {
    dpr,
    alturaDoc: document.documentElement.scrollHeight,
    imgs,
    bytesTotais,
    bytesImagem,
    bytesImagemTransfer,
    pedidos,
    desfoque,
    desfoqueErro: window.__medida.desfoqueErro || "",
    medida: {
      lcp: window.__medida.lcp,
      fcp: window.__medida.fcp,
      cls: window.__medida.cls,
      inp: window.__medida.inp,
      recursos: window.__medida.recursos,
      scrollPorInstante: window.__medida.scrollPorInstante,
      longas: window.__medida.longas,
      primeiraPintura: window.__medida.primeiraPintura,
    },
  };
})()
`;

/**
 * SONDA DE DESCODIFICAÇÃO. Volta a descodificar uma amostra dos ficheiros já
 * servidos, com o CPU estrangulado, e cronometra. createImageBitmap sobre um
 * blob mede a descodificação sozinha, sem rede e sem layout.
 */
const DECODE = `
(async (urls) => {
  const out = [];
  for (const u of urls) {
    try {
      const blob = await (await fetch(u, { cache: "force-cache" })).blob();
      const t0 = performance.now();
      const bm = await createImageBitmap(blob);
      const ms = performance.now() - t0;
      out.push({ url: u, ms: +ms.toFixed(1), w: bm.width, h: bm.height, bytes: blob.size });
      bm.close && bm.close();
    } catch (e) {
      out.push({ url: u, erro: String(e && e.message) });
    }
  }
  return out;
})
`;

/**
 * Antecipação: px entre o pedido de cada foto e a entrada dela no ecrã.
 *
 * E, mais útil do que os píxeis, o TEMPO que esses píxeis compram à velocidade
 * a que se estava a percorrer a página. 1200 px de antecipação parecem
 * generosos até se dividir por 3 400 px/s de scroll: dá 350 ms, e uma foto de
 * 130 KB a 200 KB/s demora 650 ms a chegar. É essa subtracção que produz o
 * buraco cinzento — não a falta de margem.
 */
function calcularAntecipacao(inv, alturaViewport) {
  const y = inv.medida.scrollPorInstante;
  if (!y.length) return [];
  const yEm = (t) => {
    // procura binária pela amostra mais próxima
    let lo = 0,
      hi = y.length - 1;
    while (lo < hi) {
      const m = (lo + hi) >> 1;
      if (y[m].t < t) lo = m + 1;
      else hi = m;
    }
    return y[lo].y;
  };
  const out = [];
  for (const im of inv.imgs) {
    if (!im.inicio || !im.topoNoDoc) continue;
    const yPedido = yEm(im.inicio);
    // Quando o pedido saiu, o fundo do ecrã estava em yPedido + altura.
    // A distância que faltava até o mosaico assomar é a antecipação.
    out.push({
      url: im.url,
      px: Math.round(im.topoNoDoc - (yPedido + alturaViewport)),
    });
  }
  return out;
}

/** Velocidade média do scroll durante a travessia, em px/s. */
function velocidadeDoScroll(inv) {
  const y = inv.medida.scrollPorInstante;
  if (y.length < 2) return 0;
  let percorrido = 0;
  for (let i = 1; i < y.length; i++) percorrido += Math.abs(y[i].y - y[i - 1].y);
  const segundos = (y[y.length - 1].t - y[0].t) / 1000;
  return segundos > 0 ? Math.round(percorrido / segundos) : 0;
}

const pct = (arr, p) => {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const kb = (b) => +(b / 1024).toFixed(1);
const EH_IMAGEM = (u) => /\.(webp|avif|jpe?g|png)(\?|$)/i.test(u || "");

/**
 * ─────────────────────────────────────────────────────────────────────────
 * O NÚMERO PRINCIPAL: quanto tempo cada fotografia esteve desfocada no ecrã.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `desfocadoMs` = tDecode − tEntra, com piso em 0. Zero significa que a
 * fotografia já estava pronta quando o mosaico assomou — o visitante não viu
 * desfocado nenhum, que é o objectivo.
 *
 * Divide-se em dois grupos porque são duas experiências diferentes:
 *   • PRIMEIRO ECRÃ — os mosaicos que já lá estavam quando a página abriu.
 *     Aqui o relógio começa no carregamento, não no scroll.
 *   • DURANTE O SCROLL — os que assomaram enquanto se percorria a galeria.
 *     É este o caso da queixa.
 *
 * `nuncaChegou` = o mosaico saiu do ecrã antes de a fotografia estar pronta.
 * Nessa passagem o visitante viu SÓ o desfocado. É o pior caso, e é o que a
 * dona descreve.
 */
function analisarDesfoque(desfoque, marcoTravessia, fcp) {
  const comAmbos = desfoque.filter((r) => r.tEntra !== null && r.tDecode !== null);
  const calc = (lista) => {
    const ms = lista.map((r) => Math.max(0, r.tDecode - r.tEntra));
    const cru = lista.map((r) => Math.round(r.tDecode - r.tEntra));
    return {
      n: lista.length,
      medianaMs: Math.round(pct(ms, 50)),
      p90Ms: Math.round(pct(ms, 90)),
      p95Ms: Math.round(pct(ms, 95)),
      piorMs: Math.round(Math.max(0, ...ms)),
      mediaMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : 0,
      // Quantas chegaram ANTES de assomar (o visitante não viu desfocado).
      semDesfoque: cru.filter((v) => v <= 0).length,
      // A margem, quando houve: quanto tempo a fotografia estava pronta antes.
      margemMedianaMs: cru.filter((v) => v < 0).length
        ? -Math.round(
            pct(
              cru.filter((v) => v < 0).map((v) => -v),
              50,
            ),
          )
        : 0,
    };
  };
  const primeiroEcra = comAmbos.filter((r) => r.tEntra < marcoTravessia);
  /**
   * O PRIMEIRO ECRÃ TEM UM RELÓGIO DIFERENTE.
   *
   * Para um mosaico que já lá estava quando a página abriu, 'tEntra' é o
   * instante em que o IntersectionObserver entregou a primeira observação — que
   * acontece assim que há layout, ANTES de haver pintura. Antes do FCP não há
   * nada no ecrã, portanto o visitante não pode estar a olhar para um
   * placeholder desfocado.
   *
   * O tempo que ele passa mesmo a ver desfocado no primeiro ecrã é, então,
   * medido a partir do FCP: 'tDecode − max(tEntra, FCP)'. É este o número
   * honesto para "abri a galeria e as fotos estavam desfocadas".
   */
  const desdeFcp = primeiroEcra
    .map((r) => r.tDecode - Math.max(r.tEntra, fcp))
    .map((v) => Math.max(0, v));
  const noScroll = comAmbos.filter((r) => r.tEntra >= marcoTravessia);
  // Saiu do ecrã antes de a fotografia estar pronta.
  const nuncaChegou = comAmbos.filter((r) => r.tSai !== null && r.tDecode > r.tSai);
  // Mosaicos que assomaram e cuja fotografia NUNCA ficou pronta na sessão.
  const semFoto = desfoque.filter((r) => r.tEntra !== null && r.tDecode === null);

  // Descodificação real: entre o `load` e o `decode()` resolvido, na thread
  // principal desta página (não a sonda do createImageBitmap).
  const decodeReal = comAmbos.filter((r) => r.tLoad !== null).map((r) => r.tDecode - r.tLoad);
  // E o frame a seguir ao decode, que é quando o pixel pode mesmo aparecer.
  const atePintar = comAmbos
    .filter((r) => r.tPintada !== null && r.tEntra !== null)
    .map((r) => Math.max(0, r.tPintada - r.tEntra));

  return {
    todas: calc(comAmbos),
    primeiroEcra: calc(primeiroEcra),
    primeiroEcraDesdeFcp: {
      n: desdeFcp.length,
      medianaMs: Math.round(pct(desdeFcp, 50)),
      p90Ms: Math.round(pct(desdeFcp, 90)),
      piorMs: Math.round(Math.max(0, ...desdeFcp)),
    },
    noScroll: calc(noScroll),
    mosaicosObservados: desfoque.length,
    semTDecode: semFoto.length,
    nuncaVisivelNitida: nuncaChegou.length,
    nuncaVisivelNitidaNoScroll: nuncaChegou.filter((r) => r.tEntra >= marcoTravessia).length,
    placeholderQuandoEsperou: comAmbos.reduce(
      (m, r) => ((m[r.placeholder || "?"] = (m[r.placeholder || "?"] || 0) + 1), m),
      {},
    ),
    decodeRealMedianaMs: +pct(decodeReal, 50).toFixed(1),
    decodeRealP90Ms: +pct(decodeReal, 90).toFixed(1),
    decodeRealP95Ms: +pct(decodeReal, 95).toFixed(1),
    decodeRealPiorMs: +Math.max(0, ...decodeReal).toFixed(1),
    atePintarMedianaMs: Math.round(pct(atePintar, 50)),
    atePintarP90Ms: Math.round(pct(atePintar, 90)),
  };
}

/**
 * Quantas fotografias são pedidas antes de a PRIMEIRA aparecer, e quantas
 * estão em voo ao mesmo tempo.
 *
 * "Em voo" sai da linha do tempo de cada recurso: [inicio, inicio+dur]. Uma
 * varredura pelos extremos dá a concorrência máxima e a mediana ponderada pelo
 * tempo. Não é a fila do browser vista por dentro — é o que se observa de fora,
 * que é o que conta para a espera.
 */
function analisarConcorrencia(recursos, desfoque) {
  const imgs = recursos.filter((e) => EH_IMAGEM(e.url) || e.tipo === "img");
  const primeiraPronta = desfoque
    .filter((r) => r.tDecode !== null)
    .reduce((min, r) => Math.min(min, r.tDecode), Infinity);
  const pedidasAntes = Number.isFinite(primeiraPronta)
    ? imgs.filter((e) => e.inicio < primeiraPronta).length
    : 0;

  const eventos = [];
  for (const e of imgs) {
    if (!e.dur) continue;
    eventos.push({ t: e.inicio, d: +1 });
    eventos.push({ t: e.inicio + e.dur, d: -1 });
  }
  eventos.sort((a, b) => a.t - b.t || a.d - b.d);
  let vivos = 0,
    max = 0,
    tAnterior = eventos.length ? eventos[0].t : 0;
  const tempoPorNivel = new Map();
  for (const ev of eventos) {
    if (ev.t > tAnterior && vivos > 0) {
      tempoPorNivel.set(vivos, (tempoPorNivel.get(vivos) || 0) + (ev.t - tAnterior));
    }
    tAnterior = ev.t;
    vivos += ev.d;
    if (vivos > max) max = vivos;
  }
  // Mediana ponderada pelo tempo em que havia pelo menos um pedido em voo.
  const niveis = [...tempoPorNivel.entries()].sort((a, b) => a[0] - b[0]);
  const totalTempo = niveis.reduce((s, [, t]) => s + t, 0);
  let acc = 0,
    medianaEmVoo = 0;
  for (const [nivel, t] of niveis) {
    acc += t;
    if (acc >= totalTempo / 2) {
      medianaEmVoo = nivel;
      break;
    }
  }
  return {
    primeiraFotoProntaMs: Number.isFinite(primeiraPronta) ? Math.round(primeiraPronta) : null,
    fotosPedidasAntesDaPrimeiraAparecer: pedidasAntes,
    maxEmParalelo: max,
    medianaEmParalelo: medianaEmVoo,
    pedidosDeImagem: imgs.length,
  };
}

async function medirPerfil(browser, perfil, url) {
  const ctx = await browser.newContext({ ...perfil.contexto });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", REDE_4G_LENTO);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU_THROTTLE });

  // Content-type por URL: é a única forma honesta de dizer o FORMATO servido
  // (a extensão mente quando há negociação de conteúdo).
  const tipos = new Map();
  page.on("response", (r) => {
    const ct = r.headers()["content-type"];
    if (ct) tipos.set(r.url(), ct.split(";")[0]);
  });

  await page.addInitScript(SONDA);
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 180_000 });
  await page.waitForTimeout(3500);

  // Uma interação a sério, para o INP ter o que medir.
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  const alvo = await page.$('[data-tile-idx="1"], .g-tile, main button');
  if (alvo) {
    await alvo.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(900);
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(600);
  }

  /**
   * O instante em que a travessia começa. Serve para separar duas coisas que
   * eu estava a somar numa só e a chamar TBT:
   *
   *   • o BLOQUEIO DE CARREGAMENTO — o que trava a página antes de ela estar
   *     utilizável. É o que a métrica TBT significa, e é o que se compara com
   *     o alvo de 150 ms.
   *   • o BLOQUEIO DA TRAVESSIA — o que trava a thread principal ao percorrer
   *     as 427 fotografias. É interessante, mas é a soma de uma sessão de mais
   *     de um minuto e não se compara com nenhum alvo de TBT.
   *
   * Somar os dois dava "TBT 1449 ms" onde o carregamento custa ~300 ms. Uma
   * corrida só de carregamento (sem scroll nenhum) mede 284/318/322 ms em três
   * repetições — ou seja, o número grande era quase todo travessia.
   */
  const marcoTravessia = await page.evaluate(() => performance.now());
  const scroll = await page.evaluate(`(${TRAVESSIA})(${PASSO_PX}, ${ESPERA_MS})`);
  const inv = await page.evaluate(INVENTARIO);

  const bloqueio = (desde, ate) =>
    Math.round(
      inv.medida.longas
        .filter((t) => t.inicio >= desde && t.inicio < ate)
        .reduce((s, t) => s + Math.max(0, t.dur - 50), 0),
    );
  const tbt = bloqueio(0, marcoTravessia);
  const bloqueioTravessia = bloqueio(marcoTravessia, Infinity);

  const alturaViewport = perfil.contexto.viewport?.height ?? 852;
  const antecip = calcularAntecipacao(inv, alturaViewport);

  // Descodificação: 12 ficheiros distintos, dos maiores servidos.
  const amostra = [...new Set(inv.imgs.map((i) => i.url).filter(Boolean))].slice(0, 12);
  const decode = await page.evaluate(`(${DECODE})(${JSON.stringify(amostra)})`);

  for (const im of inv.imgs) im.formato = tipos.get(im.url) || "?";

  await ctx.close();

  // `corpo` = encodedBodySize. Ver a nota nos bytes dentro do INVENTARIO:
  // `bytes` (transferSize) vem a zero em quase tudo com a rede emulada, e
  // filtrar por ele reduzia esta amostra de 383 fotografias para 7.
  const comBytes = inv.imgs.filter((i) => i.corpo > 0);
  const racios = inv.imgs.filter((i) => i.racio > 0).map((i) => i.racio);
  const decodeMs = decode.filter((d) => d.ms).map((d) => d.ms);
  const antecipPx = antecip.map((a) => a.px);
  const velocidade = velocidadeDoScroll(inv);
  const antecipMs = velocidade > 0 ? Math.round((pct(antecipPx, 50) / velocidade) * 1000) : 0;

  return {
    perfil: perfil.nome,
    lcp: Math.round(inv.medida.lcp),
    fcp: Math.round(inv.medida.fcp),
    cls: +inv.medida.cls.toFixed(4),
    inp: Math.round(inv.medida.inp),
    tbt,
    bloqueioTravessia,
    pedidos: inv.pedidos,
    bytesTotais: inv.bytesTotais,
    bytesImagem: inv.bytesImagem,
    imagensNoDom: inv.imgs.length,
    imagensComBytes: comBytes.length,
    eager: inv.imgs.filter((i) => i.loading === "eager").length,
    lazy: inv.imgs.filter((i) => i.loading === "lazy").length,
    formatos: inv.imgs.reduce((m, i) => ((m[i.formato] = (m[i.formato] || 0) + 1), m), {}),
    larguraServida: inv.imgs.reduce((m, i) => ((m[i.servidoW] = (m[i.servidoW] || 0) + 1), m), {}),
    racioMediano: pct(racios, 50),
    racioP95: pct(racios, 95),
    acimaDe2x: inv.imgs.filter((i) => i.racio > 2).length,
    kbMinPorFoto: kb(
      pct(
        comBytes.map((i) => i.corpo),
        0,
      ),
    ),
    kbMedianoPorFoto: kb(
      pct(
        comBytes.map((i) => i.corpo),
        50,
      ),
    ),
    kbP90PorFoto: kb(
      pct(
        comBytes.map((i) => i.corpo),
        90,
      ),
    ),
    kbP95PorFoto: kb(
      pct(
        comBytes.map((i) => i.corpo),
        95,
      ),
    ),
    kbMaxPorFoto: kb(Math.max(0, ...comBytes.map((i) => i.corpo))),
    bytesImagemTransfer: inv.bytesImagemTransfer,
    imagensComTransferSize: inv.imgs.filter((i) => i.bytes > 0).length,
    desfoqueErro: inv.desfoqueErro,
    racioFisicoMediano: pct(
      inv.imgs.filter((i) => i.racioFisico > 0).map((i) => i.racioFisico),
      50,
    ),
    acimaDe120kb: comBytes.filter((i) => i.corpo > 120 * 1024).length,
    decodeMedianoMs: pct(decodeMs, 50),
    decodeP95Ms: pct(decodeMs, 95),
    decode,
    antecipacaoMedianaPx: pct(antecipPx, 50),
    antecipacaoP10Px: pct(antecipPx, 10),
    antecipacaoNegativas: antecipPx.filter((p) => p < 0).length,
    antecipacaoTotal: antecipPx.length,
    velocidadeScrollPxS: velocidade,
    antecipacaoMedianaMs: antecipMs,
    primeiraPintura: inv.medida.primeiraPintura,
    scroll,
    alturaDoc: inv.alturaDoc,
    desfoque: analisarDesfoque(inv.desfoque, marcoTravessia, inv.medida.fcp),
    concorrencia: analisarConcorrencia(inv.medida.recursos, inv.desfoque),
    marcoTravessia: Math.round(marcoTravessia),
    passoPx: PASSO_PX,
    esperaMs: ESPERA_MS,
    imgs: inv.imgs,
    desfoqueBruto: inv.desfoque,
  };
}

const browser = await chromium.launch();
// O português é o idioma por omissão e vive SEM prefixo: `/pt/galeria`
// responde 308 para `/galeria`. Medir a partir do redireccionamento juntava o
// custo dele a todos os números.
const url = `${BASE}/galeria`;
const resultados = [];
for (const perfil of PERFIS) {
  if (SO_PERFIL && perfil.nome !== SO_PERFIL) continue;
  process.stderr.write(`\n▶ ${perfil.nome} — ${url}\n`);
  resultados.push(await medirPerfil(browser, perfil, url));
}
await browser.close();

for (const r of resultados) {
  console.log(`\n═══ ${r.perfil.toUpperCase()} ═══`);
  console.log(
    `LCP ${r.lcp} ms · FCP ${r.fcp} ms · CLS ${r.cls} · INP ${r.inp} ms · TBT ${r.tbt} ms`,
  );
  console.log(
    `Peso ${kb(r.bytesTotais)} KB (imagens ${kb(r.bytesImagem)} KB) em ${r.pedidos} pedidos`,
  );
  console.log(`Imagens no DOM ${r.imagensNoDom} · eager ${r.eager} · lazy ${r.lazy}`);
  if (r.primeiraPintura) {
    const p = r.primeiraPintura;
    console.log(
      `Primeira pintura: ${p.mosaicos} mosaicos · blur ${p.blur} · só cor ${p.cor} · ` +
        `nada ${p.nada} · ${p.pedidosAteAqui} pedidos já feitos`,
    );
  }
  console.log(`Formatos: ${JSON.stringify(r.formatos)}`);
  console.log(
    `Rácio servido/exibido: mediana ${r.racioMediano}× · p95 ${r.racioP95}× · acima de 2×: ${r.acimaDe2x}`,
  );
  console.log(
    `KB por foto (encodedBodySize): min ${r.kbMinPorFoto} · mediana ${r.kbMedianoPorFoto} · ` +
      `p90 ${r.kbP90PorFoto} · p95 ${r.kbP95PorFoto} · max ${r.kbMaxPorFoto} · ` +
      `acima de 120 KB: ${r.acimaDe120kb} de ${r.imagensComBytes}`,
  );
  console.log(
    `  (transferSize, inutilizavel com rede emulada: ${kb(r.bytesImagemTransfer)} KB em ` +
      `${r.imagensComTransferSize} imagens de ${r.imagensNoDom})`,
  );
  console.log(`Racio contra pixeis FISICOS: mediana ${r.racioFisicoMediano}x`);
  console.log(`Descodificação: mediana ${r.decodeMedianoMs} ms · p95 ${r.decodeP95Ms} ms`);
  const d = r.desfoque;
  console.log(
    `\n── TEMPO DESFOCADO (entra no ecrã → decode() resolvido) ──\n` +
      `  TODAS (${d.todas.n}):        mediana ${d.todas.medianaMs} ms · p90 ${d.todas.p90Ms} ms · ` +
      `p95 ${d.todas.p95Ms} ms · pior ${d.todas.piorMs} ms · média ${d.todas.mediaMs} ms\n` +
      `  1.º ecrã (${d.primeiroEcra.n}):    mediana ${d.primeiroEcra.medianaMs} ms · ` +
      `p90 ${d.primeiroEcra.p90Ms} ms · pior ${d.primeiroEcra.piorMs} ms\n` +
      `  1.º ecrã DESDE O FCP (${d.primeiroEcraDesdeFcp.n}): mediana ` +
      `${d.primeiroEcraDesdeFcp.medianaMs} ms · p90 ${d.primeiroEcraDesdeFcp.p90Ms} ms · ` +
      `pior ${d.primeiroEcraDesdeFcp.piorMs} ms\n` +
      `  no scroll (${d.noScroll.n}):  mediana ${d.noScroll.medianaMs} ms · ` +
      `p90 ${d.noScroll.p90Ms} ms · pior ${d.noScroll.piorMs} ms\n` +
      `  Já prontas ao assomar (0 ms de desfoque): ${d.todas.semDesfoque} de ${d.todas.n}` +
      ` · margem mediana dessas: ${d.todas.margemMedianaMs} ms\n` +
      `  Saíram do ecrã ANTES de a foto estar pronta: ${d.nuncaVisivelNitida}` +
      ` (${d.nuncaVisivelNitidaNoScroll} durante o scroll)\n` +
      `  Mosaicos que assomaram e nunca tiveram foto: ${d.semTDecode}` +
      ` · mosaicos observados: ${d.mosaicosObservados}\n` +
      `  Placeholder visto por quem esperou: ${JSON.stringify(d.placeholderQuandoEsperou)}\n` +
      `  Até o frame de pintura (rAF a seguir ao decode): mediana ${d.atePintarMedianaMs} ms · ` +
      `p90 ${d.atePintarP90Ms} ms\n` +
      `  Descodificação REAL (load → decode()): mediana ${d.decodeRealMedianaMs} ms · ` +
      `p90 ${d.decodeRealP90Ms} ms · p95 ${d.decodeRealP95Ms} ms · pior ${d.decodeRealPiorMs} ms`,
  );
  const c = r.concorrencia;
  console.log(
    `Concorrência: primeira foto pronta aos ${c.primeiraFotoProntaMs} ms · ` +
      `fotos pedidas antes disso ${c.fotosPedidasAntesDaPrimeiraAparecer} · ` +
      `máximo em paralelo ${c.maxEmParalelo} · mediana em voo ${c.medianaEmParalelo} · ` +
      `pedidos de imagem ${c.pedidosDeImagem}`,
  );
  console.log(
    `ANTECIPAÇÃO: mediana ${r.antecipacaoMedianaPx} px (= ${r.antecipacaoMedianaMs} ms a ` +
      `${r.velocidadeScrollPxS} px/s) · p10 ${r.antecipacaoP10Px} px · ` +
      `negativas ${r.antecipacaoNegativas}/${r.antecipacaoTotal}`,
  );
  console.log(
    `CENSO no ecrã (2.º método, sem carimbos): ${r.scroll.percentagemDesfocadaNoEcra}% dos ` +
      `mosaicos visíveis estavam desfocados · ${r.scroll.percentagemSemFotoNoEcra}% sem foto ` +
      `carregada · pior passo ${r.scroll.piorPassoDesfocados} mosaicos · ` +
      `${r.scroll.passosComAlgumDesfocado} de ${r.scroll.censoPassos} passos com algum ` +
      `desfocado · média ${r.scroll.mediaVisiveisPorPasso} mosaicos visíveis por passo`,
  );
  console.log(`Travessia: passo ${r.passoPx} px / espera ${r.esperaMs} ms`);
  console.log(
    `Fluidez: intervalos acima de 32 ms ${r.scroll.percentagemAcima32}% ` +
      `(${r.scroll.acimaDe32ms} de ${r.scroll.intervalos}) · mediana ${r.scroll.medianaMs} ms · ` +
      `p95 ${r.scroll.p95Ms} ms · p99 ${r.scroll.p99Ms} ms · pior ${r.scroll.piorMs} ms`,
  );
  console.log(`Documento: ${r.alturaDoc} px`);
}

if (JSON_OUT) {
  writeFileSync(JSON_OUT, JSON.stringify(resultados, null, 1));
  process.stderr.write(`\n→ ${JSON_OUT}\n`);
}
