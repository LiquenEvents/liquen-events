/**
 * ════════════════════════════════════════════════════════════════════════════
 * «UM AVISO QUE CHEGA EMPURRA OS QUE JÁ LÁ ESTÃO» — a medida, fotograma a
 * fotograma
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A pilha está encostada ao FUNDO do ecrã: quando um aviso chega, o que já lá
 * estava tem de subir. A pergunta não é SE se mexe — é se se mexe como um gesto
 * ou como um salto.
 *
 * MEDIDO antes desta ronda, e é o defeito: um aviso que já lá estava percorria
 * **53,25 px num único fotograma**, enquanto o que ENTRA percorre 8 px em
 * 240 ms — no máximo 3,4 px por fotograma. E havia um segundo salto, de
 * 53,9 px, quando um aviso saía ENQUANTO outro entrava: o FLIP da saída existia
 * mas media o «antes» dentro do próprio efeito, e nesse instante o recém-chegado
 * já tinha empurrado toda a gente.
 *
 * ── O QUE ISTO MEDE, E COMO ───────────────────────────────────────────────
 *
 * Um `requestAnimationFrame` a ler o `getBoundingClientRect().top` do MESMO nó
 * (guardado por referência, não por índice) enquanto o gesto corre. Do rasto
 * saem dois números:
 *
 *   · **maior salto** — a maior diferença entre dois fotogramas seguidos, e a
 *     FRACÇÃO que ela representa do percurso. É o número do defeito: antes
 *     desta ronda um só fotograma levava o percurso inteiro (100 %).
 *   · **andou** — o caminho todo que o nó percorreu. NÃO é para descer: o aviso
 *     tem mesmo de subir a altura de uma caixa. O que muda é em quantos
 *     fotogramas.
 *
 * Dois cenários, e o segundo é o que a saída sozinha não cobria:
 *
 *   A · um aviso CHEGA a uma pilha que já tem dois.
 *   B · um aviso CHEGA 90 ms depois de outro começar a SAIR, ou seja a meio do
 *       deslize da saída.
 *
 * Não mede desempenho — para isso está o `60-fotogramas-no-telemovel.mjs`, e a
 * escolha de fazer isto com `transform` em vez de `height` ou de
 * `grid-template-rows` já foi medida e está escrita no `saida-do-aviso.mjs`
 * (~19 layouts contra ~4). Aqui mede-se GEOMETRIA.
 *
 * ── COMO CORRER ───────────────────────────────────────────────────────────
 *
 *   1. Um servidor com o back office de pé (o `dev` serve — isto conta píxeis,
 *      não fotogramas perdidos):
 *
 *        SESSION_SECRET=<32+ caracteres> ADMIN_PASSWORD_HASH=<hash de dev> \
 *        npx next dev --port 3411
 *
 *   2. PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers \
 *      node e2e/a-entrada-nao-empurra.mjs --url=http://localhost:3411
 *
 * Sai com 1 se, em algum dos cenários, o percurso couber em menos de
 * `--espalhado` fotogramas (por omissão 5) ou um só fotograma levar quase tudo.
 * O critério está escrito por extenso ao lado do `relatar`, e o porquê de não
 * ser um tecto em píxeis também.
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
const TECTO = Number(args.tecto ?? 8);
/** Quantos fotogramas com movimento fazem de um percurso um deslize. */
const ESPALHADO = Number(args.espalhado ?? 3);
const LARGURA = 390;
const ALTURA = 844;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

function acharChromium() {
  for (const c of [
    process.env.CHROMIUM_BIN,
    "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
  ]) {
    if (c && fsSync.existsSync(c)) return c;
  }
  return undefined;
}

function credenciais() {
  const fonte = fsSync.readFileSync(path.join(RAIZ, "e2e/semear-pedido.ts"), "utf8");
  return {
    email: process.env.MEDICAO_EMAIL ?? fonte.match(/email\.fill\("([^"]+)"\)/)?.[1],
    palavraPasse:
      process.env.MEDICAO_PALAVRA_PASSE ??
      fonte.match(/input\[name="password"\][\s\S]{0,40}?\.fill\("([^"]+)"\)/)?.[1],
  };
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

async function tocar(alvo) {
  let caixa = await alvo.boundingBox({ timeout: 15_000 });
  if (!caixa) throw new Error("alvo sem caixa");
  if (caixa.y < 0 || caixa.y + caixa.height > ALTURA) {
    await alvo.scrollIntoViewIfNeeded({ timeout: 15_000 });
    await dormir(350);
    caixa = await alvo.boundingBox({ timeout: 15_000 });
  }
  await page.touchscreen.tap(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
}

/**
 * Os «×» dos avisos da REGIÃO EDUCADA (`role="status"`), que é onde caem os
 * «Email copiado» com que este arnês enche a pilha.
 *
 * Escopo, e não `[aria-label="Fechar"]` à solta: a pilha tem duas regiões (a
 * assertiva dos erros vem primeiro no documento) e um erro do arranque metia-se
 * à frente da conta. Um cenário que fecha um aviso numa região e mede outra dá
 * deslocação líquida zero — e um verde que não prova nada.
 */
const SELECTOR_AVISOS = '[role="status"] [aria-label="Fechar"][class*="alvo-toque"]';

const quantosAvisos = () =>
  page.evaluate((sel) => document.querySelectorAll(sel).length, SELECTOR_AVISOS);

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
}

/**
 * Começa a seguir o aviso MAIS NOVO da pilha, por referência.
 *
 * Duas escolhas, e as duas custaram uma leitura falsa:
 *
 *  · pelo «×» e a subir um nível, e NÃO por `[role="status"] > div` — há mais
 *    do que uma região `role="status"` na página, a primeira não é a da pilha,
 *    e o nó seguido nascia já desligado do documento (`isConnected: false`,
 *    `top: 0`). O cenário dava «0 px» e parecia verde.
 *  · o mais NOVO e não o mais velho — um aviso apaga-se sozinho ao fim de 4 s,
 *    e o mais velho pode ir-se embora a meio da medição. O mais novo acabou de
 *    ser disparado e sobe na mesma quando o seguinte chega.
 */
const comecarARastrear = () =>
  page.evaluate(() => {
    const botoes = document.querySelectorAll(
      '[role="status"] [aria-label="Fechar"][class*="alvo-toque"]',
    );
    const alvo = botoes[botoes.length - 1]?.parentElement;
    if (!alvo || !alvo.isConnected) throw new Error("não há aviso para seguir");
    window.__rasto = [];
    window.__desligou = false;
    window.__aSeguir = true;
    const passo = () => {
      if (!window.__aSeguir) return;
      // Um nó desligado devolve zeros e faria passar por «não se mexeu» o que
      // é, na verdade, o arnês a seguir um fantasma.
      if (!alvo.isConnected) {
        window.__desligou = true;
        return;
      }
      window.__rasto.push(alvo.getBoundingClientRect().top);
      requestAnimationFrame(passo);
    };
    requestAnimationFrame(passo);
  });

const lerORasto = () =>
  page.evaluate(() => {
    window.__aSeguir = false;
    const t = window.__rasto ?? [];
    let maior = 0;
    let andou = 0;
    let comMovimento = 0;
    for (let i = 1; i < t.length; i++) {
      const passo = Math.abs(t[i] - t[i - 1]);
      maior = Math.max(maior, passo);
      andou += passo;
      if (passo > 0.5) comMovimento++;
    }
    return {
      fotogramas: t.length,
      comMovimento,
      maiorSalto: maior,
      andou,
      desligou: !!window.__desligou,
    };
  });

/**
 * O CRITÉRIO, e porque é que não é um número solto de píxeis.
 *
 * A primeira versão disto media o MAIOR PASSO contra um tecto fixo, e estava
 * errada duas vezes. Um deslize de 78 px em 200 ms com a curva de quem
 * apresenta (`cubic-bezier(0, 0, 0.2, 1)`, que só desacelera) põe ~26 % do
 * percurso no PRIMEIRO fotograma — uns 20 px — e isso é a curva a fazer o seu
 * trabalho, não um salto: um tecto de 8 px chumbava-o. E quando a máquina está
 * carregada e o browser perde fotogramas, o primeiro passo pintado cai mais à
 * frente na curva: MEDIDO neste contentor, o mesmo gesto deu 20 px numa
 * corrida sossegada e 34 px com o servidor ainda a compilar. Um tecto em
 * píxeis mede a carga da máquina, não o gesto.
 *
 * O que separa um salto de um deslize não é o tamanho do maior passo — é se o
 * movimento foi ESPALHADO. Antes desta ronda, o aviso andava o percurso
 * inteiro em UM fotograma e ficava quieto no resto: um fotograma com
 * movimento, e 100 % dele. Depois, o mesmo percurso reparte-se por uma dúzia.
 *
 * Portanto: pelo menos TRÊS fotogramas com movimento, e nenhum deles a levar
 * sozinho quase tudo (90 %). Três e não doze porque o chão tem de ser o de uma
 * máquina esfomeada: uma transição de 200 ms dá ~12 fotogramas a 60 Hz, e este
 * contentor, com outro trabalho a correr ao lado, já foi visto a entregar 18
 * por segundo — quatro fotogramas para os mesmos 200 ms. O que se prende aqui
 * é a diferença entre UM e vários, que é a diferença entre um corte e um
 * gesto; medir a suavidade é outro instrumento
 * (`60-fotogramas-no-telemovel.mjs`).
 */
function relatar(nome, r) {
  const fraccao = r.andou > 0 ? r.maiorSalto / r.andou : 0;
  console.log(
    `${nome.padEnd(46)} maior passo: ${r.maiorSalto.toFixed(2).padStart(7)} px ` +
      `(${(fraccao * 100).toFixed(0).padStart(3)} % do percurso)   ` +
      `andou: ${r.andou.toFixed(2).padStart(7)} px   ` +
      `em ${String(r.comMovimento).padStart(2)} fotogramas (de ${r.fotogramas} vistos)`,
  );
  if (r.desligou) {
    falhas.push(`${nome}: o aviso seguido saiu do documento a meio — a medição não vale`);
    return;
  }
  if (r.andou < 20 || r.fotogramas < 10) {
    falhas.push(`${nome}: o cenário não mediu nada (andou ${r.andou.toFixed(2)} px)`);
    return;
  }
  if (r.comMovimento < ESPALHADO) {
    falhas.push(
      `${nome}: o percurso coube em ${r.comMovimento} fotograma(s) — é um salto, não um deslize`,
    );
  } else if (r.maiorSalto > Math.max(TECTO, r.andou * 0.9)) {
    falhas.push(
      `${nome}: um fotograma levou ${r.maiorSalto.toFixed(2)} px ` +
        `(${(fraccao * 100).toFixed(0)} % do percurso) — é um salto, não um deslize`,
    );
  }
}

try {
  await page.goto(URL_BASE + "/orcamento/admin", { waitUntil: "domcontentloaded" });
  const barra = page.locator('nav[aria-label="Destinos principais"]');
  const email = page.getByLabel(/O teu email/i);
  await Promise.race([
    email.waitFor({ timeout: 90_000 }).catch(() => {}),
    barra.waitFor({ timeout: 90_000 }).catch(() => {}),
  ]);
  if (!(await barra.isVisible().catch(() => false))) {
    // O SOSSEGO DE UM SEGUNDO E MEIO NÃO É SUPERSTIÇÃO: o HTML do ecrã de
    // entrada chega antes do JavaScript, e nessa janela o botão está desenhado
    // e o formulário submete-se À ANTIGA — com a palavra-passe no endereço e
    // sem sessão do lado do cliente. É a mesma nota do
    // `60-fotogramas-no-telemovel.mjs`, e o `reload` é a segunda rede.
    await dormir(1500);
    const cred = credenciais();
    await email.fill(cred.email);
    await page.locator('input[name="password"]').fill(cred.palavraPasse);
    await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
    let dentro = await barra
      .waitFor({ timeout: 40_000 })
      .then(() => true)
      .catch(() => false);
    if (!dentro) {
      await page.goto(URL_BASE + "/orcamento/admin", { waitUntil: "domcontentloaded" });
      dentro = await barra
        .waitFor({ timeout: 60_000 })
        .then(() => true)
        .catch(() => false);
    }
    if (!dentro) throw new Error("não entrei no back office");
  }

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
  const abrir = page.getByRole("button", { name: /^Abrir o pedido$/ });
  await abrir.waitFor({ timeout: 40_000 });
  await abrir.scrollIntoViewIfNeeded().catch(() => {});
  await dormir(400);
  await tocar(abrir);
  const copiar = page.getByRole("button", { name: /^Copiar email$/ }).first();
  await copiar.waitFor({ timeout: 60_000 });
  await dormir(900);
  await copiar.scrollIntoViewIfNeeded().catch(() => {});
  await dormir(300);

  // ── A · um aviso CHEGA a uma pilha que já tem dois ────────────────────────
  await encherAPilha(2);
  await comecarARastrear();
  await tocar(copiar);
  await dormir(900);
  relatar("A · um aviso chega (a pilha já tinha dois)", await lerORasto());

  // ── B · um CHEGA enquanto outro ainda está a SAIR ─────────────────────────
  // O aviso de baixo sai, e 90 ms depois — a meio dos 200 ms do deslize — chega
  // outro. É este o caso que o FLIP da saída sozinho não cobria: o «antes» era
  // medido dentro do efeito, e nesse instante o recém-chegado já tinha
  // empurrado toda a gente. (Fazê-los no MESMO commit não serve de cenário: um
  // que sai e um que chega dão deslocação líquida ZERO para quem fica, e a
  // medição não teria nada para ver.)
  await encherAPilha(3);
  await comecarARastrear();
  await page.evaluate(() => {
    // O MAIS VELHO, que não é o que está a ser seguido: fechar o próprio nó
    // seguido não media a pilha, media o desaparecimento dele.
    document.querySelector('[role="status"] [aria-label="Fechar"][class*="alvo-toque"]')?.click();
  });
  await dormir(90);
  // `evaluate(el => el.click())` e não um toque: um toque leva o seu tempo a
  // resolver coordenadas, e aqui os 90 ms são o cenário.
  await page
    .getByRole("button", { name: /^Copiar email$/ })
    .first()
    .evaluate((el) => el.click());
  await dormir(900);
  relatar("B · um chega enquanto outro ainda sai", await lerORasto());
} catch (e) {
  falhas.push("o arnês não chegou ao fim: " + e.message);
} finally {
  await browser.close();
}

console.log(
  "\n" +
    (falhas.length === 0
      ? "OK — o percurso repartiu-se por vários fotogramas: a pilha desliza, não salta."
      : "FALHOU:\n  · " + falhas.join("\n  · ")),
);
process.exit(falhas.length === 0 ? 0 : 1);
