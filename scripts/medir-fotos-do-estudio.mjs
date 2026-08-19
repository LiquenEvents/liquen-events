/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTÚDIO DE PROPOSTAS NUM TELEMÓVEL EM 4G — a medição
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
 * quando estava a fazer a proposta e não consigo». Em 4G.
 *
 * Sem estrangular a rede este defeito não existe — em localhost as 24 células
 * pintam-se em menos de um segundo, e foi por isso que ninguém deu por ele. Por
 * isso a régua deste guião é sempre a mesma: telemóvel de 375×667 com
 * `deviceScaleFactor` 2, e 1,6 Mbps / 150 ms pelo CDP.
 *
 * Uso (com o servidor de desenvolvimento a correr):
 *
 *   node scripts/medir-fotos-do-estudio.mjs sem-miniatura  antes
 *   node scripts/medir-fotos-do-estudio.mjs com-miniatura  depois
 *   node scripts/medir-fotos-do-estudio.mjs assets-falha   falha
 *
 *   BASE_URL   o servidor  (por omissão http://localhost:3132)
 *   SAIDA      onde escreve o JSON e a captura (/tmp/medicao-fotos-estudio)
 *   CHROMIUM   caminho do executável, quando não é o do Playwright
 *
 * Abre o estúdio a sério (não uma página nua), com 24 fotos num rascunho
 * semeado, e mede o que cada célula puxa.
 *
 * ── O QUE ESTE GUIÃO NÃO CONSEGUE PROVAR ──────────────────────────────────
 * Não há Supabase neste ambiente. O `/assets` é INTERCEPTADO para se poder ter
 * uma grelha cheia; portanto o que fica medido é o caminho dos bytes DEPOIS de
 * os URL chegarem — e não a latência do Storage, nem a assinatura, nem a
 * geração da miniatura em falta pela rota `miniatura` (essa precisa do bucket).
 *
 * ── «GRELHA COMPLETA» É O QUE ESTÁ NO ECRÃ ────────────────────────────────
 * As células fora do ecrã são `lazy` DE PROPÓSITO, e portanto nunca chegam a
 * ser pedidas enquanto lá estiverem. Contá-las para o alvo fazia o número
 * depender de fotografias que ninguém está a olhar.
 *
 * ── PORQUE É QUE AS FOTOS SÃO SERVIDAS PELO NEXT E NÃO PELO `route.fulfill` ──
 * Medido: uma resposta fabricada pelo `route.fulfill` do Playwright NÃO passa
 * pelo estrangulador do CDP — 4,4 MB chegavam em 11 s, ou seja 3,1 Mbps num
 * canal declarado a 1,6. Servidas pelo servidor de desenvolvimento, as fotos
 * atravessam a pilha de rede verdadeira e o estrangulamento vale. Só o JSON do
 * `/assets` é fabricado, e esse são bytes que não contam.
 *
 * O relógio arranca quando o `/assets` responde: é aí que as células ficam com
 * URL e começa a corrida dos bytes, que é o que se está a medir.
 */
import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";
import sharp from "sharp";

// `localhost` e não `127.0.0.1`: o `next dev` não hidrata no segundo, e uma
// página que não hidrata não tem grelha nenhuma para medir.
const RAIZ = process.cwd();
const BASE = process.env.BASE_URL ?? "http://localhost:3132";
const SAIDA = process.env.SAIDA ?? "/tmp/medicao-fotos-estudio";
/** Vinte e quatro: o mesmo número da linha de base em `IMAGES-BEFORE.md`. */
const CELULAS = 24;

const MODO = process.argv[2] ?? "com-miniatura"; // com-miniatura | sem-miniatura | assets-falha
const ETIQUETA = process.argv[3] ?? MODO;

// ── As fotografias: as reais do repositório, com o peso de uma foto de casamento
const dir = path.join(RAIZ, "public", "imagens");
const nomes = readdirSync(dir)
  .filter((f) => f.endsWith(".jpg"))
  .filter((f) => statSync(path.join(dir, f)).size > 1_000_000)
  .sort()
  .slice(0, CELULAS);
if (nomes.length < CELULAS) throw new Error(`só ${nomes.length} fotos grandes`);

// A miniatura, com os MESMOS valores do `image-prep.ts` do browser: 400 px, q72.
const dirMini = path.join(RAIZ, "public", "medicao-mini");
mkdirSync(dirMini, { recursive: true });
let bytesOriginal = 0;
let bytesMini = 0;
for (const n of nomes) {
  bytesOriginal += statSync(path.join(dir, n)).size;
  const alvo = path.join(dirMini, n);
  if (!existsSync(alvo)) {
    await sharp(readFileSync(path.join(dir, n)))
      .resize(400, 400, { fit: "inside" })
      .jpeg({ quality: 72 })
      .toFile(alvo);
  }
  bytesMini += statSync(alvo).size;
}

mkdirSync(SAIDA, { recursive: true });
const SESSAO = `${SAIDA}/sessao.json`;
const browser = await chromium.launch({
  ...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {}),
});
const ctx = await browser.newContext({
  ...(existsSync(SESSAO) ? { storageState: SESSAO } : {}),
  viewport: { width: 375, height: 667 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 2,
  baseURL: BASE,
});
const page = await ctx.newPage();

// ── Entrar ────────────────────────────────────────────────────────────────
const clienteVivo = page
  .waitForResponse((r) => r.url().includes("/api/admin/passkeys/entrada"), { timeout: 60_000 })
  .catch(() => null);
await page.goto("/orcamento/admin", { waitUntil: "domcontentloaded" });
const painel = page.getByRole("navigation", { name: /Navegação do back office/i });
const email = page.getByLabel(/O teu email/i);
await Promise.race([
  painel.waitFor({ timeout: 60_000 }).catch(() => null),
  email.waitFor({ timeout: 60_000 }).catch(() => null),
]);
if (!(await painel.isVisible().catch(() => false))) {
  await clienteVivo;
  await email.fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  await painel.waitFor({ timeout: 60_000 });
  await ctx.storageState({ path: SESSAO });
}

// ── Um pedido ─────────────────────────────────────────────────────────────
const nome = `Medicao ${Date.now().toString(36)}`;
const res = await page.request.post("/api/orcamento", {
  data: {
    form: {
      name: nome,
      email: "medicao@example.pt",
      phone: "912345678",
      category: "particulares",
      eventType: "casamentos",
      eventName: "Casamento",
      date: "2027-06-10",
      guests: 120,
      location: "Herdade da Maridona, Glória",
    },
    website: "",
    submissionId: `medicao-${Date.now().toString(36)}`,
  },
});
if (!res.ok()) throw new Error("não deu para criar o pedido");
const quoteId = (await res.json()).id;
const caminhos = nomes.map((_, i) => `${quoteId}/foto-${String(i).padStart(2, "0")}.jpg`);

// ── O rascunho semeado: 3 boards de 8 fotos ───────────────────────────────
// SEM `meta.urls`: é o que ela tem no telemóvel — um aparelho que nunca abriu
// esta proposta não tem `localStorage` nenhum, e a grelha depende inteiramente
// da hidratação.
const boards = [0, 1, 2].map((b) => ({
  id: `mb-${b}`,
  title: `Board ${b + 1}`,
  images: caminhos.slice(b * 8, b * 8 + 8),
  layout: "filas",
}));
await page.addInitScript(
  ({ quoteId, boards }) => {
    localStorage.setItem("liquen-admin-view", "fazer-proposta");
    localStorage.setItem(
      `liquen-proposal-studio-${quoteId}`,
      JSON.stringify({
        clientNames: "Medição",
        ref: "MED-001",
        totalAmount: 4200,
        moodBoards: boards,
      }),
    );
  },
  { quoteId, boards },
);

// ── O `/assets`, segurado até a página estar pronta ───────────────────────
let libertar = () => {};
const prontoParaLibertar = new Promise((r) => (libertar = r));
await page.route(`**/api/orcamento/${quoteId}/assets`, async (route) => {
  if (route.request().method() !== "GET") return route.continue();
  await prontoParaLibertar;
  if (MODO === "assets-falha") {
    return route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"Erro interno"}',
    });
  }
  const images = nomes.map((n, i) => ({
    path: caminhos[i],
    url: `${BASE}/imagens/${encodeURIComponent(n)}`,
    ...(MODO === "sem-miniatura"
      ? {}
      : { thumbUrl: `${BASE}/medicao-mini/${encodeURIComponent(n)}` }),
  }));
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ ok: true, images }),
  });
});

// ── Os bytes, contados na resposta ────────────────────────────────────────
// O `performance.getEntriesByType("resource")` é apagado por uma navegação, e
// o estúdio recarrega-se a meio de uma corrida longa: o que ficava no fim era
// zero pedidos, que é a resposta errada com todo o ar de ser a certa.
const respostas = [];
page.on("response", (r) => {
  const u = r.url();
  if (!/\/imagens\/|\/medicao-mini\//.test(u)) return;
  const n = Number(r.headers()["content-length"] ?? 0);
  respostas.push({ mini: u.includes("/medicao-mini/"), bytes: n });
});

// ── A rede: 4G lento, pelo CDP ────────────────────────────────────────────
// Ligado SO depois de a pagina estar montada e antes de as fotografias
// comecarem: o que se mede e o caminho dos BYTES DAS FOTOS.
const cdp = await ctx.newCDPSession(page);
await cdp.send("Network.enable");
const estrangular = () =>
  cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    connectionType: "cellular4g",
  });

await page.goto("/orcamento/admin", { waitUntil: "commit" });
await page.getByRole("heading", { name: /^Fazer proposta$/ }).waitFor({ timeout: 180_000 });
await page
  .locator("main button:visible")
  .filter({ hasText: nome })
  .first()
  .click({ timeout: 180_000 });
await page
  .getByText(/Estúdio de propostas/i)
  .first()
  .waitFor({ timeout: 180_000 });
// Descer até às fotos: é onde ela vai, e é onde o `lazy` passa a querer dizer
// alguma coisa.
await page
  .locator("[data-foto]")
  .first()
  .scrollIntoViewIfNeeded({ timeout: 60_000 })
  .catch(() => {});
await page.waitForTimeout(1000);

await estrangular();
const inicio = Date.now();
libertar();

const amostras = [];
let primeiraFoto = null;
let grelhaCompleta = null;
let cinzentasNoInicio = null;
let maxPintadas = 0;
for (let i = 0; i < 900; i++) {
  const estado = await page
    .evaluate(() => {
      const celulas = [...document.querySelectorAll("[data-foto]")];
      const imgs = celulas.map((c) => c.querySelector("img"));
      // NO ECRÃ. Uma célula lá em baixo, que o `lazy` (de propósito) nunca
      // pediu, não conta para «a grelha ficou completa» — contá-la fazia o
      // alvo depender de coisas que ninguém está a olhar.
      const noEcra = celulas.filter((c) => {
        const r = c.getBoundingClientRect();
        return r.bottom > 0 && r.top < window.innerHeight;
      });
      const pintada = (c) => {
        const im = c.querySelector("img");
        return !!im && im.complete && im.naturalWidth > 0;
      };
      return {
        celulas: celulas.length,
        noEcra: noEcra.length,
        pintadasNoEcra: noEcra.filter(pintada).length,
        comImg: imgs.filter(Boolean).length,
        pintadas: imgs.filter((im) => im && im.complete && im.naturalWidth > 0).length,
        cinzentas: celulas.filter(
          (c) => !c.querySelector("img") && /^\s*Imagem\s*$/i.test(c.textContent ?? ""),
        ).length,
        erro: celulas.filter((c) => /Imagem guardada/i.test(c.textContent ?? "")).length,
        aCarregar: celulas.filter((c) => c.querySelector("[data-a-carregar]")).length,
      };
    })
    .catch(() => null);
  if (!estado) {
    await page.waitForTimeout(250);
    continue;
  }
  const t = Date.now() - inicio;
  if (cinzentasNoInicio === null) cinzentasNoInicio = estado.cinzentas;
  amostras.push({ t, ...estado });
  if (primeiraFoto === null && estado.pintadas > 0) primeiraFoto = t;
  if (estado.pintadas > maxPintadas) maxPintadas = estado.pintadas;
  if (grelhaCompleta === null && estado.noEcra > 0 && estado.pintadasNoEcra === estado.noEcra) {
    grelhaCompleta = t;
    break;
  }
  await page.waitForTimeout(250);
  if (t > 150_000) break;
}

const timing = respostas;

await page.screenshot({ path: `${SAIDA}/${ETIQUETA}.png` });

const ultima = amostras[amostras.length - 1] ?? {};
const relatorio = {
  modo: MODO,
  etiqueta: ETIQUETA,
  celulas: CELULAS,
  mediaOriginalKB: Math.round(bytesOriginal / CELULAS / 1024),
  mediaMiniaturaKB: Math.round(bytesMini / CELULAS / 1024),
  pedidosDeImagem: timing.length,
  pedidosDeMiniatura: timing.filter((t) => t.mini).length,
  pedidosDeOriginal: timing.filter((t) => !t.mini).length,
  bytesDescarregados: timing.reduce((s, t) => s + t.bytes, 0),
  primeiraFotoMs: primeiraFoto,
  grelhaCompletaMs: grelhaCompleta,
  cinzentasNoInicio,
  maxPintadas,
  estadoFinal: ultima,
  amostras: amostras.filter((_, i) => i % 4 === 0).slice(0, 60),
};
writeFileSync(`${SAIDA}/${ETIQUETA}.json`, JSON.stringify(relatorio, null, 2));
console.log(JSON.stringify({ ...relatorio, amostras: undefined }, null, 2));

await browser.close();
