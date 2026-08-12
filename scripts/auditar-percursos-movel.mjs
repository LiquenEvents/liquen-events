/**
 * OS PERCURSOS DE TRABALHO NO TELEMÓVEL — o que o varrimento não vê.
 *
 * Uso: node scripts/auditar-percursos-movel.mjs [url]
 *      --json percursos.json   relatório em bruto
 *      --capturas ./pasta      uma captura por passo
 *      --sessao ./sessao.json  reaproveita os cookies (o login tem tecto)
 *
 * ── Porque é que isto existe ao lado do outro ─────────────────────────────
 * `auditar-toque-admin.mjs` percorre as VISTAS e mede o que está pintado.
 * Nunca abre nada. Mas metade do back office vive em coisas que só existem
 * depois de um toque: a gaveta de um pedido, o estúdio de propostas, o
 * diálogo de uma fatura nova. Um relatório que diga "zero achados" sem ter
 * aberto nada disso está a dizer menos do que parece.
 *
 * Este guião faz o contrário: poucas medições, mas dentro do trabalho a
 * sério, e em quatro aparelhos.
 *
 * ── Os aparelhos, e porquê estes ──────────────────────────────────────────
 * · iPhone SE (375x667)   — o mais estreito que ainda se usa. O pior caso.
 * · iPhone 15 Pro (393x852) — o telemóvel mediano de hoje.
 * · Pixel 8 (412x915)     — o lado Android, mais largo e mais alto.
 * · iPad retrato (768x1024) — a largura em que as regras de "telemóvel"
 *   deixam de se aplicar e ainda não há rato. É onde se esperam surpresas:
 *   a regra que impede o zoom do iOS nos campos é `max-width: 640px`, e um
 *   iPad fica de FORA dela.
 *
 * ── O teclado ─────────────────────────────────────────────────────────────
 * Não há como abrir o teclado do sistema num browser sem cabeça. O que se
 * faz é a única coisa honesta: encolher a janela para o que SOBRA com o
 * teclado aberto (~300 px no iPhone, ~340 no iPad) e perguntar se o botão
 * que fecha a tarefa continua alcançável. Está dito como aproximação onde
 * aparece, e não como medição do teclado verdadeiro.
 *
 * ── O que NÃO mede ────────────────────────────────────────────────────────
 * Sem Supabase nesta máquina há UM pedido de exemplo e nenhuma foto em
 * bucket. Grelhas cheias, listas longas e propostas com fotografias a sério
 * ficam por medir, e isso está dito no relatório em vez de preenchido com
 * suposições.
 */

import { chromium } from "@playwright/test";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { AUDITOR, irParaDestinoMovel } from "../e2e/ergonomia-tactil.mjs";

const BASE = process.argv[2]?.startsWith("http") ? process.argv[2] : "http://localhost:3210";
const arg = (n) => {
  const i = process.argv.indexOf(n);
  return i >= 0 ? process.argv[i + 1] : null;
};
const JSON_OUT = arg("--json");
const CAPTURAS = arg("--capturas");
const SESSAO = arg("--sessao");

/**
 * `alturaTeclado` é o que o teclado do sistema tapa nesse aparelho, medido
 * das capturas públicas da Apple e da Google. Serve para a aproximação de
 * "com o teclado aberto" descrita no cabeçalho.
 */
const APARELHOS = [
  { nome: "iPhone SE", largura: 375, altura: 667, dpr: 2, alturaTeclado: 300, toque: true },
  { nome: "iPhone 15 Pro", largura: 393, altura: 852, dpr: 3, alturaTeclado: 336, toque: true },
  { nome: "Pixel 8", largura: 412, altura: 915, dpr: 2.6, alturaTeclado: 320, toque: true },
  { nome: "iPad retrato", largura: 768, altura: 1024, dpr: 2, alturaTeclado: 340, toque: true },
];

const UA_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 " +
  "(KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

/** 4G lento — o mesmo perfil das outras medições deste repositório. */
const REDE_4G = {
  offline: false,
  latency: 150,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
};

const achados = [];
function achado(gravidade, aparelho, passo, texto, extra = {}) {
  achados.push({ gravidade, aparelho, passo, texto, ...extra });
  process.stderr.write(`  [${gravidade}] ${aparelho} · ${passo}: ${texto}\n`);
}

async function medir(page, aparelho, passo) {
  const r = await page.evaluate(AUDITOR);
  if (r.pequenos.length) {
    const piores = r.pequenos
      .slice()
      .sort((a, b) => a.largura * a.altura - b.largura * b.altura)
      .slice(0, 5)
      .map((p) => `${p.largura}x${p.altura} "${(p.rotulo || p.texto || p.tag).slice(0, 32)}"`);
    achado("ALTO", aparelho, passo, `${r.pequenos.length} alvo(s) < 44px: ${piores.join(", ")}`);
  }
  if (r.camposPequenos.length) {
    const q = r.camposPequenos
      .slice(0, 5)
      .map((c) => `${c.fontSize}px "${(c.rotulo || c.texto || c.tipo || c.tag).slice(0, 28)}"`);
    achado(
      "CRITICO",
      aparelho,
      passo,
      `${r.camposPequenos.length} campo(s) com letra < 16px — o iOS amplia ao focar: ${q.join(", ")}`,
    );
  }
  if (r.overflow.culpados.length) {
    const q = r.overflow.culpados
      .slice(0, 4)
      .map((c) => `corta ${c.corta}px "${(c.rotulo || c.texto || c.tag).slice(0, 28)}"`);
    achado("ALTO", aparelho, passo, `${r.overflow.culpados.length} para lá da margem: ${q}`);
  }
  if (r.foraDoEcra.length) {
    achado("MEDIO", aparelho, passo, `${r.foraDoEcra.length} focável(eis) fora do ecrã`);
  }
  return { passo, examinados: r.examinados, ...r };
}

async function capturar(page, aparelho, passo) {
  if (!CAPTURAS) return;
  const nome = `${aparelho}-${passo}`.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  await page.screenshot({ path: `${CAPTURAS}/${nome}.png` }).catch(() => {});
}

async function entrar(ctx, page) {
  await page.goto(`${BASE}/orcamento/admin`, { waitUntil: "domcontentloaded" });
  const dentro = await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ state: "visible", timeout: 5000 })
    .then(() => true)
    .catch(() => false);
  if (dentro) return;
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  await page
    .getByRole("navigation", { name: /Navegação do back office/i })
    .waitFor({ state: "visible", timeout: 20000 });
  if (SESSAO) await ctx.storageState({ path: SESSAO });
}

/** A gaveta está fechada nesta largura? (abaixo de `lg` = 1024) */
const ehGaveta = (ap) => ap.largura < 1024;

async function irPara(page, aparelho, rotulo) {
  // NUM ECRÃ ESTREITO A NAVEGAÇÃO TEM DUAS METADES, e o caminho depende do
  // destino: os quatro do dia estão na barra de baixo e já NÃO estão na
  // gaveta. O caminho vive em `e2e/ergonomia-tactil.mjs`, partilhado com os
  // passeios — um varrimento a navegar de outra maneira mede um ecrã que
  // ninguém usa.
  if (ehGaveta(aparelho)) {
    await irParaDestinoMovel(page, rotulo);
    await page.waitForTimeout(1200);
    return;
  }
  // No computador a coluna está sempre lá, com a lista completa.
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
  await nav.waitFor({ state: "visible" });
  const item = nav.getByRole("button", { name: rotulo, exact: true });
  if ((await item.count()) === 0) {
    const mais = nav.getByRole("button", { name: /^Mais$/ });
    if (await mais.count()) await mais.first().click();
  }
  await item.first().click();
  await page.waitForTimeout(1200);
}

/**
 * PERCURSO 1 — abrir um pedido e ler o que lá está.
 * É a primeira coisa que se faz quando chega um pedido novo, e a mais
 * frequente de todas.
 */
async function percursoVerPedido(page, ap, medicoes) {
  await irPara(page, ap, "Pedidos");
  medicoes.push(await medir(page, ap.nome, "pedidos-lista"));
  await capturar(page, ap.nome, "pedidos-lista");

  const cartao = page.getByRole("button", { name: /Maria Teste/i }).first();
  if ((await cartao.count()) === 0) {
    achado("INFO", ap.nome, "ver-pedido", "sem pedidos nesta máquina — percurso não medido");
    return;
  }
  await cartao.click();
  await page.waitForTimeout(1200);
  medicoes.push(await medir(page, ap.nome, "pedido-aberto"));
  await capturar(page, ap.nome, "pedido-aberto");

  // O detalhe abre como gaveta por cima abaixo de `xl` (1280). O que interessa
  // saber é se o botão de fechar existe e se lá se chega — uma gaveta modal
  // sem saída visível é a queixa clássica de "fiquei preso".
  const fechar = page.getByRole("button", { name: /Fechar|Voltar/i });
  if ((await fechar.count()) === 0) {
    achado("CRITICO", ap.nome, "pedido-aberto", "gaveta de detalhe sem botão de fechar visível");
  } else {
    const cx = await fechar.first().boundingBox();
    if (cx && (cx.width < 44 || cx.height < 44)) {
      achado(
        "ALTO",
        ap.nome,
        "pedido-aberto",
        `botão de fechar a gaveta tem ${Math.round(cx.width)}x${Math.round(cx.height)}px`,
      );
    }
    await fechar
      .first()
      .click()
      .catch(() => {});
    await page.waitForTimeout(600);
  }
}

/**
 * PERCURSO 2 — os diálogos onde se escreve.
 * Um formulário num telemóvel é onde o teclado tapa metade do ecrã, e onde um
 * campo com letra pequena arruína a tarefa toda com um zoom que não desfaz.
 */
async function percursoDialogos(page, ap, medicoes) {
  // A gaveta de detalhe pode ter ficado aberta e tapa a barra de topo, que é
  // onde estão os botões que se vão carregar a seguir.
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(600);
  const dialogos = [
    { abrir: /Novo pedido/i, nome: "novo-pedido" },
    { abrir: /Ajuda e glossário/i, nome: "ajuda" },
  ];
  for (const d of dialogos) {
    const botao = page.getByRole("button", { name: d.abrir }).first();
    if ((await botao.count()) === 0) continue;
    await botao.click({ timeout: 8000 });
    await page.waitForTimeout(1000);
    medicoes.push(await medir(page, ap.nome, d.nome));
    await capturar(page, ap.nome, d.nome);

    // ── O TECLADO (aproximação, ver cabeçalho) ──────────────────────────
    // Encolhe-se a janela para o que sobra com o teclado aberto e pergunta-se
    // se ainda se chega ao botão que fecha a tarefa.
    const campo = page.locator("dialog input, [role=dialog] input").first();
    if ((await campo.count()) > 0) {
      await campo.click().catch(() => {});
      const sobra = Math.max(200, ap.altura - ap.alturaTeclado);
      await page.setViewportSize({ width: ap.largura, height: sobra });
      await page.waitForTimeout(500);
      await capturar(page, ap.nome, `${d.nome}-teclado`);
      const submeter = page
        .getByRole("button", { name: /Criar|Guardar|Adicionar|Enviar/i })
        .first();
      if ((await submeter.count()) > 0) {
        const visivel = await submeter.isVisible().catch(() => false);
        const cx = await submeter.boundingBox().catch(() => null);
        const dentroDoEcra = cx && cx.y >= 0 && cx.y + cx.height <= sobra + 1;
        if (!visivel || !dentroDoEcra) {
          achado(
            "ALTO",
            ap.nome,
            `${d.nome}-teclado`,
            `com o teclado aberto (${sobra}px de altura útil) o botão de confirmar ` +
              (cx ? `fica em y=${Math.round(cx.y)} — fora da parte visível` : "não é alcançável"),
            { aproximacao: true },
          );
        }
      }
      await page.setViewportSize({ width: ap.largura, height: ap.altura });
      await page.waitForTimeout(300);
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(600);
  }
}

/** PERCURSO 3 — o calendário e as fotos, as duas vistas mais densas. */
async function percursoVistasDensas(page, ap, medicoes) {
  for (const vista of ["Calendário", "Temas", "Estatísticas"]) {
    await irPara(page, ap, vista);
    medicoes.push(await medir(page, ap.nome, `vista-${vista.toLowerCase()}`));
    await capturar(page, ap.nome, `vista-${vista.toLowerCase()}`);
  }
}

async function main() {
  if (CAPTURAS) mkdirSync(CAPTURAS, { recursive: true });
  const browser = await chromium.launch();
  const relatorio = [];

  for (const ap of APARELHOS) {
    process.stderr.write(`\n=== ${ap.nome} (${ap.largura}x${ap.altura}) ===\n`);
    const ctx = await browser.newContext({
      storageState: SESSAO && existsSync(SESSAO) ? SESSAO : undefined,
      viewport: { width: ap.largura, height: ap.altura },
      deviceScaleFactor: ap.dpr,
      isMobile: ap.toque,
      hasTouch: ap.toque,
      userAgent: ap.nome.startsWith("iP") ? UA_IOS : undefined,
    });
    const page = await ctx.newPage();

    // 4G lento + CPU 4x mais lento, para o tempo ser o do aparelho dela e não
    // o desta máquina.
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", REDE_4G);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

    const medicoes = [];
    // Cada percurso é isolado. Um passo que falha (um botão que mudou de nome,
    // um diálogo que não abriu) não pode levar atrás os percursos seguintes —
    // senão um engano do guião passa por "sem achados" nos que ficaram por
    // correr, que é a pior maneira de um relatório mentir.
    try {
      await entrar(ctx, page);
    } catch (e) {
      achado("ERRO", ap.nome, "entrar", e.message.split("\n")[0]);
      await ctx.close();
      continue;
    }
    for (const [nome, fn] of [
      ["ver-pedido", percursoVerPedido],
      ["dialogos", percursoDialogos],
      ["vistas-densas", percursoVistasDensas],
    ]) {
      try {
        await fn(page, ap, medicoes);
      } catch (e) {
        achado("ERRO", ap.nome, nome, e.message.split("\n")[0]);
        // Voltar a um estado conhecido antes do percurso seguinte.
        await page.keyboard.press("Escape").catch(() => {});
        await page
          .goto(`${BASE}/orcamento/admin`, { waitUntil: "domcontentloaded" })
          .catch(() => {});
        await page.waitForTimeout(1500);
      }
    }
    relatorio.push({ aparelho: ap.nome, largura: ap.largura, medicoes });
    await ctx.close();
  }

  await browser.close();

  const porGravidade = {};
  for (const a of achados) porGravidade[a.gravidade] = (porGravidade[a.gravidade] ?? 0) + 1;
  process.stderr.write(`\n=== TOTAL === ${JSON.stringify(porGravidade)}\n`);

  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ achados, relatorio }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
