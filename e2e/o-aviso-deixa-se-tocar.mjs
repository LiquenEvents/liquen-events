/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O «×» DE UM AVISO NÃO SE CONSEGUE TOCAR COM O PAINEL ABERTO» — a prova
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o defeito que impede uma pessoa de DISPENSAR uma notificação, e é o único
 * desta pilha que os testes em jsdom não podem apanhar: o jsdom não tem
 * disposição nenhuma e não decide destinos de toques. O `Toast.saida.test.tsx`
 * prende o ciclo de vida e o vocabulário; o que falta — e é isto — é o TESTE DE
 * ACERTO: com o painel do pedido aberto, o ponto no meio do «×» tem de devolver
 * o «×», e um toque a sério lá tem de fechar o aviso.
 *
 * ── O QUE ISTO APANHOU, E QUE NÃO ERA O QUE PARECIA ────────────────────────
 *
 * O sintoma media-se assim: `document.elementFromPoint` no centro do botão
 * devolvia o conteúdo do painel POR BAIXO, e um toque não fechava nada — com os
 * avisos a verem-se, inteiros, por cima do painel.
 *
 * A suspeita óbvia era empilhamento (a pilha é `z-[80]`, o painel `z-50`, e um
 * `z-index` só compete dentro do seu contexto). MEDIDO subindo a árvore a
 * partir dos dois: **não há contexto de empilhamento nenhum pelo caminho** —
 * `main#conteudo`, `body` e `html` são `static`/`auto`, sem `transform`, sem
 * `filter`, sem `isolation`, sem `opacity` e sem `will-change`. Os dois
 * competem no contexto da raiz e o 80 ganha ao 50, que é por isso que os avisos
 * se VÊEM. A pintura estava certa.
 *
 * O que estava errado era um atributo: com o painel aberto, a pilha tinha
 * `inert` e `aria-hidden="true"`, postos pelo `useFocusTrap` (ele sobe do
 * painel até ao `<body>` e marca, em cada nível, os irmãos por onde não subiu —
 * e a pilha é irmã da aplicação dentro do `<main>`). Um elemento `inert`
 * continua a ser PINTADO e deixa de existir para o teste de acerto.
 *
 * Por isso este ficheiro mede TRÊS coisas e não uma:
 *
 *   1 · CONTROLO NEGATIVO — com a pilha inertizada à mão (a partir do `<main>`,
 *       que é por onde o defeito entrava), o toque TEM de falhar. Sem isto, as
 *       medições seguintes podiam estar a passar numa página onde nada estava a
 *       ser testado.
 *   2 · COM O PAINEL ABERTO — `elementFromPoint` tem de devolver o «×», e o
 *       toque tem de fechar o aviso. É o defeito.
 *   3 · COM O PAINEL FECHADO — o mesmo, que já funcionava e não pode regredir.
 *
 * ── COMO CORRER ───────────────────────────────────────────────────────────
 *
 *   1. Um servidor com o back office de pé (produção ou `next dev`; aqui só se
 *      medem destinos de toques, não fotogramas, portanto o `dev` serve):
 *
 *        SESSION_SECRET=<32+ caracteres> ADMIN_PASSWORD_HASH=<hash de dev> \
 *        npx next dev --port 3411
 *
 *      A palavra-passe de desenvolvimento e o seu hash já vivem no repositório
 *      (`e2e/semear-pedido.ts` e `scripts/bench-back-office.mjs`), e este
 *      ficheiro vai lá buscá-los em vez de fazer uma terceira cópia. São
 *      públicos de propósito e nunca servem um servidor a sério.
 *
 *   2. PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *      node e2e/o-aviso-deixa-se-tocar.mjs --url=http://localhost:3411
 *
 * Neste ambiente o Chromium do Playwright NÃO vive em `~/.cache/ms-playwright`
 * (essa pasta está vazia e já enganou agentes) — vive em `/opt/pw-browsers`.
 *
 * Fica FORA do `playwright.config.ts` de propósito, como o `saida-do-aviso.mjs`
 * e o `60-fotogramas-no-telemovel.mjs`: sai com 1 se alguma das três medições
 * não der o que tem de dar.
 */
import { chromium } from "playwright";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const URL_BASE = String(args.url ?? "http://localhost:3411");
/** iPhone 14/15 em pontos CSS: é onde o painel é uma GAVETA e o defeito existe. */
const LARGURA = Number(args.largura ?? 390);
const ALTURA = Number(args.altura ?? 844);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function acharChromium() {
  for (const c of [
    process.env.CHROMIUM_BIN,
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ]) {
    if (c && fsSync.existsSync(c)) return c;
  }
  return undefined;
}

/** As credenciais de desenvolvimento — lidas de onde já vivem, não copiadas. */
function credenciais() {
  if (process.env.MEDICAO_EMAIL && process.env.MEDICAO_PALAVRA_PASSE) {
    return { email: process.env.MEDICAO_EMAIL, palavraPasse: process.env.MEDICAO_PALAVRA_PASSE };
  }
  const fonte = fsSync.readFileSync(path.join(RAIZ, "e2e/semear-pedido.ts"), "utf8");
  const email = fonte.match(/email\.fill\("([^"]+)"\)/)?.[1];
  const palavraPasse = fonte.match(/input\[name="password"\][\s\S]{0,40}?\.fill\("([^"]+)"\)/)?.[1];
  if (!email || !palavraPasse) {
    throw new Error(
      "não encontrei as credenciais de dev no `e2e/semear-pedido.ts` — passa " +
        "MEDICAO_EMAIL e MEDICAO_PALAVRA_PASSE no ambiente.",
    );
  }
  return { email, palavraPasse };
}

const browser = await chromium.launch({ executablePath: acharChromium() });
const ctx = await browser.newContext({
  viewport: { width: LARGURA, height: ALTURA },
  hasTouch: true,
  isMobile: true,
  deviceScaleFactor: 2,
});
const page = await ctx.newPage();
const falhas = [];

/** Um toque em COORDENADAS do ecrã, como o dedo dela. */
async function tocar(alvo) {
  let caixa = await alvo.boundingBox({ timeout: 15_000 });
  if (!caixa) throw new Error("alvo sem caixa — não está no ecrã");
  if (caixa.y < 0 || caixa.y + caixa.height > ALTURA) {
    await alvo.scrollIntoViewIfNeeded({ timeout: 15_000 });
    await dormir(350);
    caixa = await alvo.boundingBox({ timeout: 15_000 });
    if (!caixa) throw new Error("alvo sem caixa depois de rolar");
  }
  await page.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
}

async function entrar() {
  await page.goto(URL_BASE + "/orcamento/admin", { waitUntil: "domcontentloaded" });
  const barra = page.locator('nav[aria-label="Navegação do back office"]');
  const email = page.getByLabel(/O teu email/i);
  await Promise.race([
    email.waitFor({ timeout: 90_000 }).catch(() => {}),
    barra.waitFor({ timeout: 90_000 }).catch(() => {}),
  ]);
  if (await barra.isVisible().catch(() => false)) return;
  // O HTML do ecrã de entrada chega antes do JavaScript; nessa janela o botão
  // está desenhado e não tem manípulo nenhum. Ver a mesma nota no
  // `60-fotogramas-no-telemovel.mjs`.
  await dormir(1500);
  if (await email.count()) {
    const cred = credenciais();
    await email.fill(cred.email);
    await page.locator('input[name="password"]').fill(cred.palavraPasse);
    await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  }
  let dentro = await barra
    .waitFor({ timeout: 40_000 })
    .then(() => true)
    .catch(() => false);
  if (!dentro) {
    await page.reload({ waitUntil: "domcontentloaded" });
    dentro = await barra
      .waitFor({ timeout: 60_000 })
      .then(() => true)
      .catch(() => false);
  }
  if (!dentro) throw new Error("não entrei no back office — o servidor tem ADMIN_PASSWORD_HASH?");
}

/** Quantos avisos há no ecrã, contados pelo botão que os fecha. */
const quantosAvisos = () =>
  page.evaluate(
    () => document.querySelectorAll('[aria-label="Fechar"][class*="alvo-toque"]').length,
  );

/** O «×» do primeiro aviso: onde está, e quem está debaixo do seu centro. */
const sondarOFechar = () =>
  page.evaluate(() => {
    const botao = document.querySelector('[aria-label="Fechar"][class*="alvo-toque"]');
    if (!botao) return null;
    const r = botao.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const sob = document.elementFromPoint(x, y);
    const pilha = botao.closest("div.fixed");
    return {
      x,
      y,
      acerta: !!sob && (sob === botao || botao.contains(sob)),
      sob: sob
        ? sob.tagName.toLowerCase() +
          (sob.getAttribute("aria-label") ? `[${sob.getAttribute("aria-label")}]` : "") +
          "." +
          String(sob.className ?? "").slice(0, 44)
        : "(nada)",
      pilhaInerte: !!pilha && (pilha.hasAttribute("inert") || pilha.inert === true),
      pilhaAriaHidden: pilha?.getAttribute("aria-hidden") ?? null,
      pilhaZ: pilha ? getComputedStyle(pilha).zIndex : null,
    };
  });

/** Um toque a sério no «×», e quantos avisos ficaram. */
async function tocarNoFechar(ponto) {
  const antes = await quantosAvisos();
  await page.touchscreen.tap(ponto.x, ponto.y);
  await dormir(700);
  return { antes, depois: await quantosAvisos() };
}

/**
 * Enche a pilha pelo caminho real: «Copiar email» chama o `toast` do provider
 * como qualquer outro botão do back office. Não há atalho de teste nenhum.
 *
 * ── E ESVAZIA-SE PRIMEIRO, QUE NÃO É ZELO ────────────────────────────────
 * Um aviso apaga-se sozinho ao fim de 4 s. Uma medição feita sobre avisos que
 * já cá estavam podia ver a conta descer por causa de um relógio velho e não
 * do toque — ou seja, um verde falso. Espera-se que a pilha fique vazia e
 * enche-se de novo, para os 4 s começarem todos aqui.
 */
async function encherAPilha(quantos) {
  for (let i = 0; i < 40 && (await quantosAvisos()) > 0; i++) await dormir(300);
  const copiar = page.getByRole("button", { name: /^Copiar email$/ }).first();
  await copiar.waitFor({ timeout: 40_000 });
  await copiar.scrollIntoViewIfNeeded().catch(() => {});
  await dormir(400);
  for (let i = 0; i < quantos; i++) {
    await tocar(copiar);
    await dormir(250);
  }
  await dormir(400);
  const n = await quantosAvisos();
  if (n < quantos) throw new Error(`a pilha só tem ${n} avisos, queria ${quantos}`);
}

function relatar(nome, sonda, toque) {
  console.log(
    `${nome.padEnd(38)} sob o ponto: ${String(sonda?.sob).padEnd(52)} ` +
      `avisos: ${toque.antes} → ${toque.depois}   ` +
      `pilha inerte: ${sonda?.pilhaInerte}  z: ${sonda?.pilhaZ}`,
  );
}

try {
  await entrar();

  // Lista → cartão → estúdio → «Abrir o pedido»: é como ela lá chega, e é o
  // estado em que o painel é uma GAVETA (com o `useFocusTrap` ligado).
  const barra = page.locator('nav[aria-label="Navegação do back office"]');
  await tocar(barra.getByRole("button", { name: /^Pedidos/ }));
  await page.locator("h1", { hasText: /^Pedidos$/ }).waitFor({ timeout: 60_000 });
  await dormir(700);
  await tocar(
    page
      .locator("ul.flex.flex-col.divide-y")
      .first()
      .locator("li")
      .first()
      .locator("button")
      .first(),
  );
  await page
    .getByRole("button", { name: /^1 Conteúdo$/ })
    .first()
    .waitFor({ timeout: 60_000 });
  await dormir(900);
  const abrirOPedido = page.getByRole("button", { name: /^Abrir o pedido$/ });
  await abrirOPedido.waitFor({ timeout: 40_000 });
  await abrirOPedido.scrollIntoViewIfNeeded().catch(() => {});
  await dormir(400);
  await tocar(abrirOPedido);
  await page
    .getByRole("button", { name: /^Copiar email$/ })
    .first()
    .waitFor({ timeout: 60_000 });
  await dormir(900);

  // ── 1 · CONTROLO NEGATIVO ────────────────────────────────────────────────
  // Inertiza-se a pilha a partir do `<main>` — que é EXACTAMENTE por onde o
  // defeito entrava (o `useFocusTrap` marca irmãos, e a pilha é irmã da
  // aplicação lá dentro). Se com isto o toque ainda fechasse o aviso, a
  // medição de baixo não estaria a provar coisa nenhuma.
  await encherAPilha(2);
  await page.evaluate(() => {
    const pilha = document
      .querySelector('[aria-label="Fechar"][class*="alvo-toque"]')
      ?.closest("div.fixed");
    const pai = pilha?.parentElement;
    if (!pai) throw new Error("não encontrei a pilha para o controlo negativo");
    // MARCADO, para o poder desfazer sem ter de o voltar a procurar por um
    // aviso que entretanto se pode ter apagado sozinho — foi assim que este
    // arnês deixou o `<main>` inerte para o resto da corrida.
    pai.setAttribute("data-controlo-negativo", "1");
    pai.inert = true;
  });
  await dormir(200);
  const sondaControlo = await sondarOFechar();
  const toqueControlo = await tocarNoFechar(sondaControlo);
  relatar("CONTROLO · pilha inertizada à mão", sondaControlo, toqueControlo);
  const restaurado = await page.evaluate(() => {
    const pai = document.querySelector("[data-controlo-negativo]");
    if (!pai) return false;
    pai.inert = false;
    pai.removeAttribute("data-controlo-negativo");
    return !pai.inert;
  });
  await dormir(200);
  if (!restaurado) falhas.push("não consegui desfazer o controlo negativo — o resto não vale");
  if (sondaControlo?.acerta) falhas.push("o controlo negativo acertou no «×» — não prova nada");
  if (toqueControlo.depois !== toqueControlo.antes) {
    falhas.push("o controlo negativo fechou o aviso — não prova nada");
  }

  // ── 2 · O DEFEITO: com o painel do pedido ABERTO ─────────────────────────
  await encherAPilha(2);
  const sondaAberto = await sondarOFechar();
  const toqueAberto = await tocarNoFechar(sondaAberto);
  relatar("PAINEL ABERTO · o «×» do aviso", sondaAberto, toqueAberto);
  if (!sondaAberto?.acerta) {
    falhas.push(
      `com o painel aberto, o ponto no meio do «×» devolve ${sondaAberto?.sob} — não o botão`,
    );
  }
  if (sondaAberto?.pilhaInerte) falhas.push("a pilha está `inert` com o painel aberto");
  if (sondaAberto?.pilhaAriaHidden === "true") {
    falhas.push("a pilha está `aria-hidden` com o painel aberto — o `role=alert` deixa de falar");
  }
  if (toqueAberto.depois !== toqueAberto.antes - 1) {
    falhas.push(
      `um toque a sério no «×» com o painel aberto não fechou o aviso ` +
        `(${toqueAberto.antes} → ${toqueAberto.depois})`,
    );
  }

  // ── 3 · E COM O PAINEL FECHADO, que já funcionava ────────────────────────
  // Enche-se com o painel AINDA aberto (é lá que vive o «Copiar email») e
  // fecha-se logo a seguir: os avisos ficam no ecrã os seus 4 s e o painel já
  // não está lá. É a única ordem possível sem inventar um botão de teste.
  await encherAPilha(2);
  const fechar = page
    .locator(".fixed.z-50.max-w-md")
    .getByRole("button", { name: /^Fechar$/ })
    .first();
  if (await fechar.count()) {
    await tocar(fechar);
    await dormir(500);
  }
  const sondaFechado = await sondarOFechar();
  const toqueFechado = await tocarNoFechar(sondaFechado);
  relatar("PAINEL FECHADO · o «×» do aviso", sondaFechado, toqueFechado);
  if (!sondaFechado?.acerta) {
    falhas.push(`com o painel fechado, o ponto no meio do «×» devolve ${sondaFechado?.sob}`);
  }
  if (toqueFechado.depois !== toqueFechado.antes - 1) {
    falhas.push(
      `um toque no «×» com o painel fechado não fechou o aviso ` +
        `(${toqueFechado.antes} → ${toqueFechado.depois})`,
    );
  }
} catch (e) {
  falhas.push("o arnês não chegou ao fim: " + e.message);
} finally {
  await browser.close();
}

console.log(
  "\n" +
    (falhas.length === 0
      ? "OK — o «×» do aviso deixa-se tocar, com o painel aberto e com ele fechado."
      : "FALHOU:\n  · " + falhas.join("\n  · ")),
);
process.exit(falhas.length === 0 ? 0 : 1);
