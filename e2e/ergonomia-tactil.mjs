/**
 * ERGONOMIA TÁCTIL — as regras, num sítio só.
 *
 * Este ficheiro é partilhado por dois consumidores, e é de propósito:
 *
 *   · `scripts/auditar-toque-admin.mjs` — o varrimento que produz o relatório
 *     com a lista completa e o `ficheiro:linha` de cada achado.
 *   · `e2e/admin-mobile.spec.ts` — a rede do CI, que faz falhar a compilação
 *     quando um destes limiares volta a ser quebrado.
 *
 * Se as duas cópias vivessem separadas, afastavam-se: o relatório dizia uma
 * coisa e o CI outra, e a segunda ganhava por omissão. Com um ficheiro só, uma
 * regra corrigida é corrigida nos dois.
 *
 * ── Os limiares, e de onde vêm ────────────────────────────────────────────
 *
 * · 44×44 px de alvo — o mínimo das Human Interface Guidelines da Apple (o
 *   Material Design pede 48 dp). A polpa do dedo cobre ~10 mm de ecrã e o
 *   telemóvel não sabe onde está o centro dela.
 *
 * · 16 px de letra nos campos — abaixo disto o Safari do iOS AMPLIA a página
 *   ao focar o campo, e não volta a desamplíar. É comportamento do sistema,
 *   não gosto.
 *
 * · Sem conteúdo para lá da margem direita a 375 px. O que passa fica CORTADO
 *   (o body tem `overflow-x: clip`), e não há como chegar lá.
 *
 * · Nada de focável fora do ecrã, a menos que se revele ao receber o foco — que
 *   é o que distingue um defeito de um "Saltar para o conteúdo".
 */

/** 375 px — o iPhone SE, o telemóvel mais estreito que ainda se usa a sério. */
export const ECRA_ESTREITO = { width: 375, height: 667 };

export const ALVO_MIN = 44;
export const LETRA_CAMPO_MIN = 16;
export const ESPACO_MIN = 8;

/**
 * Largura mínima de renderização de um bloco de texto CORRIDO, em píxeis.
 *
 * Não é um capricho tipográfico: abaixo disto o texto passa a partir uma
 * palavra por linha, e duas frases ocupam dois ecrãs de scroll. Acontece quando
 * um parágrafo é irmão de uma barra de botões marcada `shrink-0` dentro de um
 * `flex` em linha — os botões ficam com a largura que pedem e o texto encolhe
 * até à palavra mais comprida.
 *
 * 100 px a 375 é conservador: cabem 4 a 5 palavras curtas por linha. Um
 * parágrafo abaixo disto está partido, não apertado.
 */
export const TEXTO_MIN = 100;

/** A partir de quantas letras um elemento conta como texto CORRIDO. Abaixo
 *  disto são chips, contadores e rótulos, que são estreitos por desenho. */
export const TEXTO_LETRAS_MIN = 40;

/**
 * O auditor que corre DENTRO da página, como fonte para `page.evaluate`.
 *
 * É uma string e não uma função por uma razão prática: o guião `.mjs` e o
 * passeio `.ts` passam-na a `page.evaluate` sem depender de o Playwright
 * serializar um closure que fecha sobre constantes deste módulo.
 */
export const AUDITOR = `(() => {
  const ALVO_MIN = ${ALVO_MIN};
  const TEXTO_MIN = ${TEXTO_MIN};
  const TEXTO_LETRAS_MIN = ${TEXTO_LETRAS_MIN};
  const ESPACO_MIN = ${ESPACO_MIN};
  const LETRA_CAMPO_MIN = ${LETRA_CAMPO_MIN};

  /**
   * O \`summary\` está nesta lista, e demorou a lá chegar.
   *
   * Um \`<details><summary>\` é um interruptor a sério: recebe foco, responde ao
   * toque e ao Enter, e é a ÚNICA porta para o que está lá dentro. Só que não é
   * \`<button>\`, não tem \`role\`, e não tem \`tabindex\` escrito — portanto passava
   * por esta rede sem tocar em nenhum fio.
   *
   * O que isso escondeu, medido a 375 px: «Detalhes (opcional)» das Tarefas com
   * 122×15, «Histórico de atividade» do painel do pedido com 334×16 e «Plano de
   * decoração, cronograma e convidados» com 334×16. Três interruptores de 15 px
   * de altura — um terço do mínimo — e o do meio é o que abre as ferramentas de
   * produção inteiras. Nenhum deles aparecia em relatório nenhum.
   *
   * Um \`summary\` sem \`details\` à volta não é interruptor nenhum (é texto), mas
   * também não existe neste código; medi-lo a mais custava um achado falso, e
   * medi-lo a menos custava três verdadeiros.
   */
  const SELECTOR_INTERACTIVO = [
    "a[href]", "button", "input", "select", "textarea", "summary",
    "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]",
    "[role=switch]", "[role=menuitem]", "[role=option]", "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const CAMPOS = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea";

  /** Visível = pintado, com área, e a intersectar mesmo o ecrã. */
  function visivel(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // FORA DO ECRÃ na horizontal. A gaveta de navegação fechada fica em
    // \`x = -244\` — continua no DOM, com tamanho, e sem esta linha entrava em
    // TODAS as vistas como se fosse conteúdo visível.
    if (r.right <= 0 || r.left >= innerWidth) return false;
    // Escondido por um antepassado (a gaveta fechada e os grupos colapsados
    // põem o \`display:none\` no pai, não no filho).
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cp = getComputedStyle(p);
      if (cp.display === "none" || cp.visibility === "hidden") return false;
    }
    if (el.closest("[inert],[aria-hidden=true]")) return false;
    return true;
  }

  function assinatura(el) {
    const cls = typeof el.className === "string" ? el.className : "";
    return {
      tag: el.tagName.toLowerCase(),
      tipo: el.getAttribute("type") || "",
      papel: el.getAttribute("role") || "",
      rotulo: (el.getAttribute("aria-label") || "").slice(0, 80),
      texto: (el.textContent || "").trim().replace(/\\s+/g, " ").slice(0, 60),
      classes: cls.slice(0, 400),
      titulo: (el.getAttribute("title") || "").slice(0, 80),
    };
  }

  /**
   * A caixa em que se TOCA, que nem sempre é a do elemento.
   *
   * Um \`<input type=checkbox>\` de 16 px dentro de um \`<label>\` de 44 px tem um
   * alvo de 44 px: o HTML manda o toque no rótulo activar o controlo. Medir o
   * input dava um achado falso — e um que continuaria a aparecer depois de
   * corrigido, porque a correcção é no rótulo.
   */
  function caixaDeToque(el) {
    const r = el.getBoundingClientRect();
    const rot = el.closest("label");
    if (!rot || rot === el) return r;
    const rr = rot.getBoundingClientRect();
    // Um rótulo que envolve meia linha de texto não faz do checkbox um alvo largo.
    if (rr.width > 400 || rr.height > 120) return r;
    return rr.width * rr.height > r.width * r.height ? rr : r;
  }

  const interactivos = Array.from(document.querySelectorAll(SELECTOR_INTERACTIVO)).filter(visivel);

  // ── 1. Alvos pequenos ───────────────────────────────────────────────────
  const pequenos = [];
  for (const el of interactivos) {
    const r = caixaDeToque(el);
    const l = Math.round(r.width), a = Math.round(r.height);
    if (l >= ALVO_MIN && a >= ALVO_MIN) continue;
    // Um link dentro de um parágrafo de texto corrido não é um "alvo" no
    // sentido das guidelines — é palavra sublinhada.
    if (el.tagName === "A") {
      const textoPai = (el.parentElement?.textContent || "").trim();
      if (textoPai.length > (el.textContent || "").trim().length + 20) continue;
    }
    pequenos.push({ ...assinatura(el), largura: l, altura: a, x: Math.round(r.x), y: Math.round(r.y) });
  }

  // ── 2. Alvos encostados ─────────────────────────────────────────────────
  const encostados = [];
  for (let i = 0; i < interactivos.length; i++) {
    for (let j = i + 1; j < interactivos.length; j++) {
      const a = interactivos[i], b = interactivos[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const dx = Math.max(0, Math.max(ra.left - rb.right, rb.left - ra.right));
      const dy = Math.max(0, Math.max(ra.top - rb.bottom, rb.top - ra.bottom));
      if (dx === 0 && dy === 0) continue; // sobrepostos são camadas, não vizinhos
      const d = Math.round(Math.hypot(dx, dy));
      if (d >= ESPACO_MIN) continue;
      encostados.push({ distancia: d, a: assinatura(a), b: assinatura(b) });
    }
  }

  // ── 3. Campos que provocam zoom no iOS ──────────────────────────────────
  const camposPequenos = [];
  for (const el of Array.from(document.querySelectorAll(CAMPOS)).filter(visivel)) {
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px >= LETRA_CAMPO_MIN - 0.01) continue;
    camposPequenos.push({ ...assinatura(el), fontSize: Math.round(px * 100) / 100 });
  }

  // ── 4. Conteúdo para lá da margem direita ───────────────────────────────
  // ATENÇÃO: \`globals.css\` tem \`body { overflow-x: clip }\`. Isso faz com que
  // \`scrollWidth\` nunca passe de \`clientWidth\` — o teste clássico
  // (\`scrollWidth > clientWidth\`) está CEGO neste site e dá sempre verde. O
  // clip tira a BARRA de scroll, não o conteúdo que sai fora: o que passa da
  // margem fica cortado e inalcançável, que é pior do que poder arrastar até
  // lá. Por isso mede-se a margem direita de cada elemento.
  const de = document.documentElement;
  const overflow = {
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    clipado: getComputedStyle(document.body).overflowX,
    culpados: [],
  };
  // Um antepassado com scroll próprio significa que o conteúdo largo é
  // ARRASTÁVEL de propósito (uma tabela em \`overflow-x-auto\`) — desenho, não
  // defeito. \`clip\`/\`hidden\` não contam como "arrastável".
  const temScrollProprio = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX;
      if (ox === "auto" || ox === "scroll") return true;
    }
    return false;
  };
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.right <= de.clientWidth + 1) continue;
    if (r.width === 0 || r.height === 0) continue;
    if (getComputedStyle(el).position === "fixed") continue;
    if (temScrollProprio(el)) continue;
    overflow.culpados.push({
      ...assinatura(el),
      direita: Math.round(r.right),
      largura: Math.round(r.width),
      corta: Math.round(r.right - de.clientWidth),
    });
    if (overflow.culpados.length >= 20) break;
  }

  // ── 5. Foco perdido fora do ecrã ────────────────────────────────────────
  // A gaveta fechada continua no DOM. Se não estiver \`inert\`, o TAB de um
  // teclado externo e o varrimento do VoiceOver entram lá dentro e o foco
  // desaparece do ecrã.
  //
  // Um "Saltar para o conteúdo" TAMBÉM vive fora do ecrã, e está certo: é a
  // técnica normal de um skip link, que só aparece quando recebe o foco. A
  // diferença entre o defeito e a técnica não é o elemento — é o que acontece
  // ao FOCÁ-LO. Portanto é isso que se testa, em vez de tratar por nome os
  // casos conhecidos: foca-se, mede-se outra vez, e só fica como achado o que
  // continua fora do ecrã depois de ter o foco.
  const foraDoEcra = [];
  const focoAntes = document.activeElement;
  for (const el of document.querySelectorAll(SELECTOR_INTERACTIVO)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > 0 && r.left < innerWidth) continue;
    if (el.closest("[inert],[aria-hidden=true]")) continue;
    if (el.hasAttribute("disabled") || el.tabIndex < 0) continue;
    // Dentro de um contentor com scroll próprio, estar fora do ecrã é NORMAL e
    // é o desenho: os cartões das colunas da direita do quadro de propostas
    // vivem em \`x = 1185\`, e chega-se lá arrastando o quadro. O foco também
    // lá chega, porque o browser rola o contentor sozinho ao focar. Mesma
    // distinção que a regra do overflow acima já faz — \`clip\`/\`hidden\` não
    // contam, porque desses não há como sair.
    if (temScrollProprio(el)) continue;
    // \`preventScroll\` de propósito: medir não pode arrastar a página, senão a
    // asserção seguinte já não vê o mesmo ecrã. Isso quer dizer que o que se
    // testa aqui é só a revelação por CSS (\`:focus\`), que é a do skip link —
    // a revelação por SCROLL já saiu acima, na linha do contentor arrastável.
    try {
      el.focus({ preventScroll: true });
    } catch {
      /* um elemento que nem sequer aceita foco não é problema de foco */
    }
    const depois = el.getBoundingClientRect();
    const revelaSeAoFocar = depois.right > 0 && depois.left < innerWidth;
    // Largar o foco JÁ. Um skip link revelado por \`:focus\` fica desenhado por
    // cima do canto superior esquerdo e intercepta o toque seguinte — medir
    // não pode deixar a página noutro estado do que a encontrou.
    if (el.blur) el.blur();
    if (revelaSeAoFocar) continue;
    foraDoEcra.push({ ...assinatura(el), x: Math.round(r.x) });
  }
  // Devolver o foco a quem o tinha, pela mesma razão.
  if (focoAntes instanceof HTMLElement && focoAntes !== document.body) {
    focoAntes.focus({ preventScroll: true });
  }

  /**
   * TEXTO ESMAGADO — parágrafos espremidos até à largura de uma palavra.
   *
   * Só se olha para texto CORRIDO (≥ TEXTO_LETRAS_MIN letras): um chip de
   * estado ou um contador são estreitos de propósito e não têm nada a ver com
   * este defeito. E só para os que estão VISÍVEIS — um painel fechado não conta.
   */
  const textoEsmagado = [];
  for (const el of document.querySelectorAll("p, li, dd, blockquote, figcaption")) {
    // NÃO se usa \`visivel()\` aqui, e esta é a linha que faz o cheque valer.
    //
    // O \`visivel()\` descarta tudo o que tenha largura zero — e a largura zero
    // é PRECISAMENTE o pior caso deste defeito: um parágrafo espremido contra
    // uma barra de botões \`shrink-0\` não fica estreito, fica com 0 px, e o
    // Playwright chama-lhe "hidden". A primeira versão deste cheque usava
    // \`visivel()\` e por isso ignorava exactamente aquilo que existe para
    // apanhar. Só se viu ao repor o defeito de propósito.
    //
    // O que se descarta é só o que está mesmo escondido: \`display:none\`,
    // \`visibility:hidden\`, um painel fechado, uma gaveta \`inert\`.
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    if (el.closest("[inert],[aria-hidden=true],[hidden]")) continue;
    let escondidoPeloPai = false;
    for (let pai = el.parentElement; pai; pai = pai.parentElement) {
      const cp = getComputedStyle(pai);
      if (cp.display === "none" || cp.visibility === "hidden") { escondidoPeloPai = true; break; }
    }
    if (escondidoPeloPai) continue;

    // \`innerText\` e NÃO \`textContent\`: o primeiro é o texto RENDERIZADO, o
    // segundo é tudo o que está no DOM. A diferença apanhou-me: uma linha que
    // no telemóvel mostra só um visto, mas que tem a frase completa lá dentro
    // num span escondido por CSS, contava 69 letras num elemento de
    // 17 px e era acusada de esmagada. Estava certa — o que estava errado era
    // a medição.
    const t = (el.innerText || "").trim();
    if (t.length < TEXTO_LETRAS_MIN) continue;
    const r = el.getBoundingClientRect();
    // Altura zero com largura zero é um elemento fora de fluxo, não um
    // parágrafo esmagado — só conta o que ocupa mesmo espaço vertical.
    if (r.height === 0) continue;
    if (r.width >= TEXTO_MIN) continue;
    textoEsmagado.push({ ...assinatura(el), largura: Math.round(r.width), letras: t.length });
  }

  /**
   * TAPADOS POR UMA BARRA FIXA.
   *
   * O defeito que isto apanha, e que nenhum dos outros cheques apanhava: um
   * botão ou campo que está no ecrã, com o tamanho certo e dentro da margem —
   * mas com uma barra \`sticky\`/\`fixed\` desenhada por cima. Tocar ali toca na
   * barra. Já aconteceu duas vezes neste estúdio: a barra do total tapou o
   * "Título interno" e, depois, o "Valor (sem IVA)" — ou seja, precisamente o
   * campo que a barra existe para acompanhar.
   *
   * Como se mede: pergunta-se ao browser QUEM está no ponto central do
   * elemento. Se quem responde não é ele nem um filho seu, está tapado — e o
   * culpado é o que vier de volta.
   *
   * Com um diálogo aberto isto não se mede: aí tapar o fundo é o que se quer.
   */
  const tapados = [];
  if (!document.querySelector("[role=dialog][aria-modal=true]")) {
    /** Quem está no ponto central deste elemento, se não for ele próprio? */
    const barraPorCima = (el) => {
      const r = caixaDeToque(el);
      if (!r || r.width === 0 || r.height === 0) return null;
      const x = Math.round(r.left + r.width / 2);
      const y = Math.round(r.top + r.height / 2);
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return null;
      const emCima = document.elementFromPoint(x, y);
      if (!emCima || el === emCima || el.contains(emCima) || emCima.contains(el)) return null;
      // Só interessa quando o que está por cima é mesmo uma barra presa ao
      // ecrã. Um pseudo-elemento decorativo ou um rótulo sobreposto não é um
      // problema de toque.
      for (let p = emCima; p; p = p.parentElement) {
        const pos = getComputedStyle(p).position;
        if (pos === "fixed" || pos === "sticky") return p;
      }
      return null;
    };

    const scrollAntes = { x: scrollX, y: scrollY };
    for (const el of interactivos) {
      if (!barraPorCima(el)) continue;
      /**
       * ESTAR TAPADO AGORA NÃO CHEGA.
       *
       * Um botão a meio da página passa por baixo da barra de baixo enquanto se
       * rola — e isso não é defeito nenhum, é o que uma barra fixa faz. O que é
       * defeito é ficar tapado DEPOIS de se o trazer para o meio do ecrã: aí não
       * há posição de scroll nenhuma que o liberte, e a única forma de lhe tocar
       * é não haver nenhuma.
       *
       * Sem esta segunda medição o cheque acusava metade da página e deixava de
       * se poder confiar nele — que é como um guarda morre.
       */
      el.scrollIntoView({ block: "center", inline: "nearest", behavior: "instant" });
      const barra = barraPorCima(el);
      if (!barra) continue;
      tapados.push({
        ...assinatura(el),
        porCima: assinatura(barra).texto || assinatura(barra).classes.slice(0, 60),
      });
    }
    // Devolver a página ao sítio onde estava: as medições seguintes contam com
    // ela ali, e um passeio que mexe no que mede não mede nada.
    scrollTo(scrollAntes.x, scrollAntes.y);
  }

  return {
    examinados: interactivos.length,
    tapados,
    campos: document.querySelectorAll(CAMPOS).length,
    textoEsmagado,
    pequenos,
    encostados,
    camposPequenos,
    overflow,
    foraDoEcra,
  };
})()`;

/** Uma linha legível por achado, para a mensagem de falha do teste. */
export function descreverAlvo(p) {
  const nome = p.rotulo || p.texto || `<${p.tag}>`;
  return `  ${p.largura}x${p.altura}px  "${nome}"  (mínimo ${ALVO_MIN}x${ALVO_MIN})`;
}

export function descreverCampo(c) {
  const nome = c.rotulo || c.texto || `<${c.tag}${c.tipo ? ` type=${c.tipo}` : ""}>`;
  return `  ${c.fontSize}px  "${nome}"  (mínimo ${LETRA_CAMPO_MIN}px, senão o iOS amplia)`;
}

/** Uma linha por elemento tapado por uma barra. */
export function descreverTapado(t) {
  const nome = t.rotulo || t.texto || `<${t.tag}>`;
  return `  "${nome}"  está por baixo de  "${t.porCima}"`;
}

/** Uma linha por parágrafo esmagado. */
export function descreverTexto(t) {
  const amostra = (t.texto || "").slice(0, 50);
  return `  ${t.largura}px de largura para ${t.letras} letras  "${amostra}…"  (mínimo ${TEXTO_MIN}px)`;
}

export function descreverCulpado(c) {
  const nome = c.rotulo || c.texto || `<${c.tag}>`;
  return `  corta ${c.corta}px para lá da margem  "${nome}"`;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NAVEGAR NO TELEMÓVEL COMO ELA NAVEGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A navegação do back office num ecrã estreito tem duas metades, e a regra é
 * que nunca se sobrepõem:
 *
 *  · a BARRA DE BAIXO leva os quatro destinos do dia mais o abridor da gaveta;
 *  · a GAVETA leva exactamente o resto.
 *
 * E há dois abridores no código, mas **nunca dois no ecrã**: o "Mais" da barra
 * de baixo (o normal, ao alcance do polegar) e o hambúrguer do cabeçalho, que
 * só entra quando a barra sai — enquanto uma proposta está aberta em detalhe.
 *
 * Isto vive aqui, e não copiado em três ficheiros, porque os passeios e os
 * varrimentos têm de ir pelo mesmo caminho que ela: um deles a navegar de
 * outra maneira mede um ecrã que ninguém usa. Foi assim que o parágrafo
 * esmagado do estúdio sobreviveu tanto tempo.
 */

/** Os quatro do dia, pelos RÓTULOS — é por eles que um passeio acha um botão. */
export const NA_BARRA_DE_BAIXO = ["Visão Geral", "Pedidos", "Fazer proposta", "Propostas"];

/** Abre a gaveta pelo abridor que estiver à vista. */
export async function abrirGaveta(page) {
  const daBarra = page.getByRole("button", { name: /Mais destinos/i });
  const doTopo = page.getByRole("button", { name: /Abrir menu/i });
  const alvo = (await daBarra.isVisible().catch(() => false)) ? daBarra : doTopo;
  await alvo.waitFor({ state: "visible", timeout: 10000 });
  await alvo.click();
}

/**
 * Vai para um destino pelo caminho por onde ele existe: a barra de baixo se for
 * dos quatro, a gaveta se for do resto.
 *
 * `rotulo` é o texto do botão ("Calendário", "Fazer proposta"…).
 */
export async function irParaDestinoMovel(page, rotulo) {
  if (NA_BARRA_DE_BAIXO.includes(rotulo)) {
    await page
      .getByRole("navigation", { name: /Destinos principais/i })
      .getByRole("button", { name: rotulo, exact: true })
      .click();
    return;
  }
  await abrirGaveta(page);
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
  await nav.waitFor({ state: "visible" });
  // O grupo "Mais" da coluna do computador fica ABERTO depois do primeiro
  // destino lá de dentro; no telemóvel nem existe. Por isso a pergunta é
  // sempre "o botão está à vista?", nunca "esta vista é das de dentro?".
  const item = nav.getByRole("button", { name: rotulo, exact: true });
  if ((await item.count()) === 0) {
    await nav.getByRole("button", { name: "Mais", exact: true }).click();
  }
  await item.first().click();
}
