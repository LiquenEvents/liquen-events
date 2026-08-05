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
 * · Sem conteúdo para lá da margem direita a 375 px.
 */

/** 375 px — o iPhone SE, o telemóvel mais estreito que ainda se usa a sério. */
export const ECRA_ESTREITO = { width: 375, height: 667 };

export const ALVO_MIN = 44;
export const LETRA_CAMPO_MIN = 16;
export const ESPACO_MIN = 8;

/**
 * O auditor que corre DENTRO da página, como fonte para `page.evaluate`.
 *
 * É uma string e não uma função por uma razão prática: o guião `.mjs` e o
 * passeio `.ts` passam-na a `page.evaluate` sem depender de o Playwright
 * serializar um closure que fecha sobre constantes deste módulo.
 */
export const AUDITOR = `(() => {
  const ALVO_MIN = ${ALVO_MIN};
  const ESPACO_MIN = ${ESPACO_MIN};
  const LETRA_CAMPO_MIN = ${LETRA_CAMPO_MIN};

  const SELECTOR_INTERACTIVO = [
    "a[href]", "button", "input", "select", "textarea",
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
  const foraDoEcra = [];
  for (const el of document.querySelectorAll(SELECTOR_INTERACTIVO)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > 0 && r.left < innerWidth) continue;
    if (el.closest("[inert],[aria-hidden=true]")) continue;
    if (el.hasAttribute("disabled") || el.tabIndex < 0) continue;
    foraDoEcra.push({ ...assinatura(el), x: Math.round(r.x) });
  }

  return {
    examinados: interactivos.length,
    campos: document.querySelectorAll(CAMPOS).length,
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

export function descreverCulpado(c) {
  const nome = c.rotulo || c.texto || `<${c.tag}>`;
  return `  corta ${c.corta}px para lá da margem  "${nome}"`;
}
