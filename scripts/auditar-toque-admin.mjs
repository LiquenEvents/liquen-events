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
// As regras e os limiares vivem num sítio só, partilhados com o passeio do
// CI (`e2e/admin-mobile.spec.ts`). Duas cópias afastavam-se, e o relatório
// passava a dizer uma coisa e o CI outra.
import { AUDITOR, ECRA_ESTREITO } from "../e2e/ergonomia-tactil.mjs";
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
    viewport: ECRA_ESTREITO,
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
