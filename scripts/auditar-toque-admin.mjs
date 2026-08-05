/**
 * VARRIMENTO DE ERGONOMIA TÁCTIL DO BACK OFFICE — a linha de base.
 *
 * Uso: node scripts/auditar-toque-admin.mjs [url]   (por omissão http://localhost:3210)
 *      --json toque.json    escreve o relatório em bruto
 *
 * ── O que isto mede, e porquê estes limiares ──────────────────────────────
 * Corre o back office num ecrã de 375 px (o iPhone SE, o telemóvel mais
 * estreito que ainda se usa) com toque ligado, percorre todas as vistas, e
 * conta quatro coisas:
 *
 * · ALVOS PEQUENOS — qualquer coisa em que se toca com menos de 44×44 px. É o
 *   mínimo das Human Interface Guidelines da Apple (o Material Design pede
 *   48 dp). Abaixo disto a taxa de erro de toque sobe depressa, porque a polpa
 *   do dedo tem ~10 mm e o ecrã não sabe onde está o centro.
 *
 * · ALVOS ENCOSTADOS — dois alvos a menos de 8 px um do outro. Mesmo que cada
 *   um seja grande, colados dão toques no vizinho; o mais caro no back office
 *   é ter "Apagar" ao lado de "Guardar".
 *
 * · CAMPOS QUE DÃO ZOOM — um `<input>`/`<select>`/`<textarea>` com letra abaixo
 *   de 16 px faz o Safari do iOS AMPLIAR a página ao receber foco, e não volta
 *   a desamplíar. O ecrã fica descentrado a meio do preenchimento de um
 *   formulário. Não é uma preferência de gosto: é o comportamento do sistema.
 *
 * · SCROLL LATERAL — a página a medir mais do que o ecrã a 375 px. É o sintoma
 *   número um de "não está adaptado", e o único destes quatro que já tinha
 *   rede (o passeio `admin-mobile.spec.ts`, mas a 390 px).
 *
 * ── Como é que um achado ganha ficheiro:linha ─────────────────────────────
 * O DOM não sabe de que linha do TSX veio. O que o browser sabe é a lista de
 * classes Tailwind do elemento; e essa lista, no nosso código, é escrita à mão
 * e quase sempre única. Portanto: o browser devolve a assinatura (classes,
 * texto, papel) e o Node procura essa assinatura no `src/`. Quando encontra
 * exactamente um sítio, o achado sai com `ficheiro:linha`; quando encontra
 * vários ou nenhum, sai a dizer isso em vez de adivinhar.
 *
 * ── O que NÃO mede ────────────────────────────────────────────────────────
 * Não julga o que está escondido (`display:none`, fora do ecrã, ou dentro de um
 * painel fechado) — só o que está pintado na altura em que se mede. As vistas
 * que precisam de dados do Supabase aparecem vazias nesta máquina, e o que lá
 * estaria por linha de tabela não é visto. Está dito no relatório, vista a
 * vista, quantos elementos foram examinados.
 */

import { chromium } from "@playwright/test";
import { existsSync, writeFileSync } from "node:fs";
import { execSync } from "node:child_process";

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3210";
const JSON_OUT = (() => {
  const i = process.argv.indexOf("--json");
  return i >= 0 ? process.argv[i + 1] : null;
})();
/** Ficheiro de cookies reutilizado entre execuções (ver `entrar`). */
const SESSAO = (() => {
  const i = process.argv.indexOf("--sessao");
  return i >= 0 ? process.argv[i + 1] : null;
})();
/** Pasta onde gravar uma captura de ecrã por vista (opcional). */
const CAPTURAS = (() => {
  const i = process.argv.indexOf("--capturas");
  return i >= 0 ? process.argv[i + 1] : null;
})();

/** iPhone SE — o mais estreito que ainda se usa a sério. */
const ECRA = { width: 375, height: 667 };

/** Os mínimos, e de onde vêm (ver cabeçalho). */
const ALVO_MIN = 44;
const ESPACO_MIN = 8;
const LETRA_CAMPO_MIN = 16;

/**
 * As vistas, pelo RÓTULO que aparece no menu — que nem sempre é o id: a vista
 * `contratos` chama-se "Propostas Aceites" no ecrã. É o rótulo que se clica,
 * portanto é o rótulo que aqui está.
 */
const VISTAS = [
  "Visão Geral",
  "Pedidos",
  "Propostas",
  "Calendário",
  "Tarefas",
  "Faturas",
  "Propostas Aceites",
  "Temas",
  "Organização de propostas",
  "Estatísticas",
];

/**
 * O auditor que corre DENTRO da página.
 *
 * Escrito como string e injectado, para não depender de o Playwright
 * serializar closures. Devolve dados simples — a decisão fica no Node.
 */
const AUDITOR = `(() => {
  const ALVO_MIN = ${ALVO_MIN};
  const ESPACO_MIN = ${ESPACO_MIN};
  const LETRA_CAMPO_MIN = ${LETRA_CAMPO_MIN};

  const SELECTOR_INTERACTIVO = [
    "a[href]", "button", "input", "select", "textarea",
    "[role=button]", "[role=link]", "[role=tab]", "[role=checkbox]",
    "[role=switch]", "[role=menuitem]", "[role=option]", "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  const CAMPOS = "input:not([type=hidden]):not([type=checkbox]):not([type=radio]),select,textarea";

  /** Visível = pintado, com área, e dentro do documento. */
  function visivel(el) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.opacity === "0") return false;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    // FORA DO ECRÃ na horizontal. A gaveta de navegação fechada fica em
    // \`x = -244\` — continua no DOM, com tamanho, e sem esta linha entrava em
    // TODAS as vistas como se fosse conteúdo visível. Não se inventa aqui um
    // limiar: só conta o que intersecta mesmo a largura do ecrã.
    if (r.right <= 0 || r.left >= innerWidth) return false;
    // Escondido por um antepassado (a gaveta fechada tem \`opacity:0\` no véu,
    // e os grupos colapsados têm \`display:none\` no pai, não no filho).
    for (let p = el.parentElement; p; p = p.parentElement) {
      const cp = getComputedStyle(p);
      if (cp.display === "none" || cp.visibility === "hidden") return false;
    }
    // Marcado como inerte para toque e para leitores de ecrã.
    if (el.closest("[inert],[aria-hidden=true]")) return false;
    return true;
  }

  /** Assinatura para depois procurar no código-fonte. */
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

  const interactivos = Array.from(document.querySelectorAll(SELECTOR_INTERACTIVO)).filter(visivel);

  // ── 1. Alvos pequenos ───────────────────────────────────────────────────
  // Mede-se a caixa do próprio elemento. Um ícone de 20px dentro de um botão
  // de 44px não é achado — o alvo é o botão.
  /**
   * A caixa em que se TOCA, que nem sempre é a do elemento.
   *
   * Um \`<input type=checkbox>\` de 16 px dentro de um \`<label>\` de 44 px tem um
   * alvo de 44 px: o HTML manda o toque no rótulo activar o controlo. Medir o
   * input dava um achado falso — e, pior, um achado que continuaria a aparecer
   * depois de estar corrigido, porque a correcção é no rótulo.
   */
  function caixaDeToque(el) {
    const r = el.getBoundingClientRect();
    const rot = el.closest("label");
    if (!rot || rot === el) return r;
    const rr = rot.getBoundingClientRect();
    // Só conta se o rótulo é mesmo o alvo — um rótulo que envolve meia linha de
    // texto não faz do checkbox um alvo largo.
    if (rr.width > 400 || rr.height > 120) return r;
    return rr.width * rr.height > r.width * r.height ? rr : r;
  }

  const pequenos = [];
  for (const el of interactivos) {
    const r = caixaDeToque(el);
    const l = Math.round(r.width), a = Math.round(r.height);
    if (l >= ALVO_MIN && a >= ALVO_MIN) continue;
    // Um link dentro de um parágrafo de texto corrido não é um "alvo" no
    // sentido das guidelines — é palavra sublinhada. Distinguem-se porque o
    // pai imediato tem mais texto do que o link.
    if (el.tagName === "A") {
      const pai = el.parentElement;
      const textoPai = (pai?.textContent || "").trim();
      const textoEl = (el.textContent || "").trim();
      if (textoPai.length > textoEl.length + 20) continue;
    }
    pequenos.push({ ...assinatura(el), largura: l, altura: a, x: Math.round(r.x), y: Math.round(r.y) });
  }

  // ── 2. Alvos encostados ─────────────────────────────────────────────────
  // Só entre pares que se veem ao mesmo tempo e que não estão um dentro do
  // outro (um botão dentro de um cartão clicável não é um par colado).
  const encostados = [];
  for (let i = 0; i < interactivos.length; i++) {
    for (let j = i + 1; j < interactivos.length; j++) {
      const a = interactivos[i], b = interactivos[j];
      if (a.contains(b) || b.contains(a)) continue;
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      const dx = Math.max(0, Math.max(ra.left - rb.right, rb.left - ra.right));
      const dy = Math.max(0, Math.max(ra.top - rb.bottom, rb.top - ra.bottom));
      // Sobrepostos (ambos 0) são normalmente camadas, não vizinhos.
      if (dx === 0 && dy === 0) continue;
      const d = Math.round(Math.hypot(dx, dy));
      if (d >= ESPACO_MIN) continue;
      encostados.push({
        distancia: d,
        a: assinatura(a),
        b: assinatura(b),
      });
    }
  }

  // ── 3. Campos que provocam zoom no iOS ──────────────────────────────────
  const camposPequenos = [];
  for (const el of Array.from(document.querySelectorAll(CAMPOS)).filter(visivel)) {
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px >= LETRA_CAMPO_MIN - 0.01) continue;
    camposPequenos.push({ ...assinatura(el), fontSize: Math.round(px * 100) / 100 });
  }

  // ── 4. Scroll lateral ───────────────────────────────────────────────────
  // ATENÇÃO: \`globals.css\` tem \`body { overflow-x: clip }\`. Isso faz com que
  // \`scrollWidth\` NUNCA passe de \`clientWidth\` — o teste clássico
  // (\`scrollWidth > clientWidth\`) está cego neste site e dá sempre verde. O que
  // o clip faz é tirar a BARRA de scroll, não o conteúdo que sai fora: o que
  // passa da margem fica CORTADO e inalcançável, que é pior do que poder
  // arrastar até lá. Por isso o que se mede aqui é a margem direita de cada
  // elemento, e não o scroll do documento.
  const de = document.documentElement;
  const overflow = {
    scrollW: de.scrollWidth,
    clientW: de.clientWidth,
    clipado: getComputedStyle(document.body).overflowX,
    culpados: [],
  };
  // Um antepassado com scroll próprio significa que o conteúdo largo é
  // ARRASTÁVEL de propósito (uma tabela dentro de \`overflow-x-auto\`) — desenho,
  // não defeito. \`clip\`/\`hidden\` não contam como "arrastável".
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
  // A gaveta fechada fica em \`x = -244\`: continua no DOM, com tamanho. Se não
  // estiver marcada \`inert\` (ou \`aria-hidden\`), o TAB do teclado externo e o
  // varrimento do VoiceOver entram lá dentro e o foco desaparece do ecrã —
  // fica-se a carregar em Tab às cegas. Contam-se os que se podem focar.
  const foraDoEcra = [];
  for (const el of document.querySelectorAll(SELECTOR_INTERACTIVO)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right > 0 && r.left < innerWidth) continue;
    if (el.closest("[inert],[aria-hidden=true]")) continue;
    if (el.hasAttribute("disabled")) continue;
    if (el.tabIndex < 0) continue;
    foraDoEcra.push({ ...assinatura(el), x: Math.round(r.x) });
  }

  return {
    foraDoEcra,
    examinados: interactivos.length,
    campos: document.querySelectorAll(CAMPOS).length,
    pequenos,
    encostados,
    camposPequenos,
    overflow,
  };
})()`;

/** ── Procurar a assinatura no código-fonte ────────────────────────────────
 * Usa `git grep -n` com uma string fixa (as classes Tailwind), o que é rápido
 * e não trata nada como expressão regular. Devolve `ficheiro:linha` só quando
 * há UM sítio; caso contrário diz quantos há.
 */
const cacheGrep = new Map();
function ondeNoCodigo(sig) {
  // A lista de classes é a agulha mais específica; o rótulo/título vêm a
  // seguir. O texto visível é o pior candidato (pode vir de dados).
  const agulhas = [];
  if (sig.classes && sig.classes.length > 25) {
    // As classes no DOM vêm pela ordem final; no TSX estão como escritas.
    // Um pedaço contíguo do meio costuma bater certo mesmo com condicionais.
    agulhas.push(sig.classes.trim());
    const partes = sig.classes.trim().split(/\s+/);
    if (partes.length > 4) agulhas.push(partes.slice(0, 4).join(" "));
    if (partes.length > 3) agulhas.push(partes.slice(-3).join(" "));
  }
  if (sig.rotulo) agulhas.push(`aria-label="${sig.rotulo}"`);
  if (sig.titulo) agulhas.push(`title="${sig.titulo}"`);
  for (const agulha of agulhas) {
    if (agulha.length < 8) continue;
    if (cacheGrep.has(agulha)) {
      const r = cacheGrep.get(agulha);
      if (r) return r;
      continue;
    }
    let saida = "";
    try {
      saida = execSync(`git grep -nF -- ${JSON.stringify(agulha)} -- src/`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
    } catch {
      /* git grep sai 1 quando não encontra — não é erro */
    }
    const linhas = saida.split("\n").filter(Boolean);
    const resultado =
      linhas.length === 1
        ? linhas[0].split(":").slice(0, 2).join(":")
        : linhas.length > 1 && linhas.length <= 4
          ? linhas.map((l) => l.split(":").slice(0, 2).join(":")).join(" | ")
          : null;
    cacheGrep.set(agulha, resultado);
    if (resultado) return resultado;
  }
  return null;
}

/** Chave de deduplicação: o mesmo botão em dez linhas de tabela é UM achado. */
function chave(sig, extra = "") {
  return [sig.tag, sig.papel, sig.rotulo, sig.classes.slice(0, 120), extra].join("|");
}

/**
 * Entrar, e GUARDAR a sessão para a próxima execução.
 *
 * O login tem tecto de 8 tentativas por minuto por IP e 20 por hora por conta —
 * de propósito, e bem. Afinar este guião dá dezenas de execuções seguidas, e
 * sem isto a quarta ou quinta bate no tecto e o varrimento morre a meio a
 * dizer "timeout", que é o pior diagnóstico possível para a causa verdadeira.
 * Guardar os cookies gasta UM login por sessão, não um por execução.
 */
async function entrar(ctx, page) {
  const jaDentro = await page
    .goto(`${BASE}/orcamento/admin`, { waitUntil: "domcontentloaded" })
    .then(() =>
      page
        .getByRole("navigation", { name: /Navegação do back office/i })
        .waitFor({ state: "visible", timeout: 4000 })
        .then(() => true)
        .catch(() => false),
    );
  if (jaDentro) return;

  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  try {
    await page
      .getByRole("navigation", { name: /Navegação do back office/i })
      .waitFor({ state: "visible", timeout: 15000 });
  } catch (e) {
    const aviso = await page
      .getByText(/Demasiadas tentativas/i)
      .first()
      .textContent()
      .catch(() => null);
    throw new Error(aviso ? `login travado pelo tecto de tentativas: ${aviso}` : e.message);
  }
  if (SESSAO) await ctx.storageState({ path: SESSAO });
}

async function irPara(page, vista) {
  await page.getByRole("button", { name: "Abrir menu" }).click();
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
  await nav.waitFor({ state: "visible" });
  // O grupo "Mais" fica ABERTO depois do primeiro destino lá de dentro. Clicar
  // outra vez fechava-o e o destino seguinte nunca aparecia — por isso a
  // pergunta é sempre "o botão está à vista?", nunca "esta vista é das de
  // dentro?".
  const item = nav.getByRole("button", { name: vista, exact: true });
  if ((await item.count()) === 0) {
    const mais = nav.getByRole("button", { name: /^Mais$/ });
    if (await mais.count()) await mais.first().click();
  }
  await item.first().click();
  await page.waitForTimeout(900); // deixar o conteúdo assentar antes de medir
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    storageState: SESSAO && existsSync(SESSAO) ? SESSAO : undefined,
    viewport: ECRA,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
  const page = await ctx.newPage();

  await entrar(ctx, page);

  const relatorio = [];
  for (const vista of VISTAS) {
    try {
      await irPara(page, vista);
    } catch (e) {
      relatorio.push({ vista, erro: e.message.split("\n")[0] });
      continue;
    }
    const r = await page.evaluate(AUDITOR);
    if (CAPTURAS) {
      const nome = vista.toLowerCase().replace(/[^a-z0-9]+/g, "-");
      await page.screenshot({ path: `${CAPTURAS}/${nome}.png`, fullPage: true });
    }
    relatorio.push({ vista, ...r });
    process.stderr.write(
      `${vista}: ${r.examinados} interactivos, ${r.pequenos.length} pequenos, ` +
        `${r.encostados.length} colados, ${r.camposPequenos.length} campos, ` +
        `overflow ${r.overflow.scrollW}/${r.overflow.clientW}\n`,
    );
  }

  // Também a gaveta de navegação aberta — é ecrã a sério e não aparece em
  // nenhuma vista, porque as medições acima são feitas com ela fechada.
  try {
    await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.waitForTimeout(400);
    const r = await page.evaluate(AUDITOR);
    relatorio.push({ vista: "Gaveta de navegação (aberta)", ...r });
    process.stderr.write(`Gaveta: ${r.examinados} interactivos, ${r.pequenos.length} pequenos\n`);
  } catch {
    /* sem gaveta nesta largura */
  }

  await browser.close();

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(relatorio, null, 2));
  process.stdout.write(JSON.stringify(relatorio));
  return relatorio;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

export { ondeNoCodigo, chave };
