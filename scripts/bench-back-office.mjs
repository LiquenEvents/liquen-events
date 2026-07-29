#!/usr/bin/env node
/**
 * bench-back-office — medidor de desempenho do back office, do site público e
 * do PDF da proposta.
 *
 * PORQUÊ ESTE FICHEIRO EXISTE
 * ---------------------------
 * Duas vezes já se "otimizou" este repositório à conta de uma hipótese que os
 * números desmentiram (o PDF era lento por causa de JPEG progressivo e de fotos
 * embutidas quatro vezes — não por serem fotos grandes). A regra passou a ser:
 * medir primeiro, mexer depois, e voltar a medir. Este script é a medição.
 *
 * Só LÊ o produto. Não altera código nenhum. Sem opções NÃO ESCREVE NADA.
 * A única coisa que escreve são os ficheiros `data/*.json`, e só quando se pede
 * `--volume=N` de propósito: faz cópia de segurança antes, repõe-a no fim, e
 * repõe-a também no arranque seguinte se uma execução tiver sido interrompida
 * a meio (ver `withVolume` e `recoverAbandonedBackup`). Use sempre `--volume`
 * em conjunto com `--root=<cópia do projeto>`, para não mexer nos dados reais.
 *
 * O QUE MEDE
 * ----------
 *   1. Primeiro carregamento de /orcamento/admin — bytes de JS, tempo até o
 *      ecrã responder a um clique, e a cascata de pedidos (waterfall).
 *   2. Mudança de vista — Pedidos → Propostas → Faturas → Calendário → Temas →
 *      Estatísticas, mais abrir um pedido e o separador das mensagens, com o
 *      tempo repartido pelas fases em série (reagir, descarregar o ficheiro,
 *      montar, ir buscar dados, desenhar) para se ver o que domina.
 *      "Mensagens" não é uma vista de topo: vive dentro de um pedido, no
 *      separador "Fazer proposta".
 *   3. Tarefas longas — onde a thread principal bloqueia mais de 50 ms.
 *   4. Com volume a sério — centenas de pedidos/propostas/faturas, porque um
 *      back office rápido com 3 linhas e lento com 300 é a queixa verdadeira.
 *   5. Site público — home e galeria, contra os orçamentos do Lighthouse que
 *      já estão acordados em .github/workflows/lighthouse.yml.
 *   6. PDF da proposta — quanto demora de ponta a ponta e onde vai o tempo.
 *
 * COMO CORRER
 * -----------
 *   npm run build            # obrigatório: números de dev são ruído de compilação
 *   node scripts/bench-back-office.mjs
 *
 * O script arranca ele próprio o servidor de produção (`npm run start`) numa
 * porta livre, com as variáveis de ambiente mínimas para o login funcionar.
 *
 * Opções:
 *   --url=http://localhost:3000   usar um servidor já a correr (não arranca nenhum)
 *   --root=/caminho/para/copia    medir OUTRA árvore (o .next e o data/ dela).
 *                                 Indispensável quando várias pessoas estão a
 *                                 compilar a mesma pasta ao mesmo tempo — senão
 *                                 o .next muda debaixo dos pés a meio da medição.
 *   --runs=3                      repetições por medição (mediana; por omissão 3)
 *   --volume=300                  gerar N pedidos/propostas/faturas e medir com eles.
 *                                 OPT-IN: sem esta opção nada é escrito em data/.
 *                                 Use-a sempre com --root=<cópia> (ver abaixo).
 *   --skip=publico,pdf,volume     saltar secções (admin,vistas,volume,publico,pdf)
 *   --cpu=4                       abrandar o CPU N× (emula um portátil modesto)
 *   --json=caminho.json           gravar os números em bruto para comparar depois
 *   --headed                      ver o browser a trabalhar (diagnóstico)
 *
 * COMO COMPARAR ANTES/DEPOIS
 * --------------------------
 *   node scripts/bench-back-office.mjs --json=antes.json
 *   ... alterações ...
 *   npm run build && node scripts/bench-back-office.mjs --json=depois.json
 *   node scripts/bench-back-office.mjs --diff=antes.json,depois.json
 *
 * AVISO SOBRE O MODO DE PRODUÇÃO
 * ------------------------------
 * Sem Supabase configurado, o repositório de ficheiros RECUSA escritas em
 * produção de propósito (ver src/lib/repository.ts). As leituras funcionam, que
 * é o que este script mede. Gravações (criar pedido, guardar tema) não são
 * medidas aqui — seria preciso um Supabase local.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { promises as fs } from "node:fs";
import fsSync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Raiz do projeto a medir. Por omissão é este repositório; `--root=/caminho`
// aponta para uma CÓPIA isolada, útil quando várias pessoas (ou agentes) estão
// a construir a mesma árvore ao mesmo tempo e o .next muda debaixo dos pés —
// e também para que o teste de volume escreva em data/ da cópia, nunca no seu.
const SELF_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.argv.includes("--root")
  ? SELF_ROOT
  : path.resolve((process.argv.find((a) => a.startsWith("--root=")) || "").slice(7) || SELF_ROOT);
const DATA_DIR = path.join(ROOT, "data");

// ── Credenciais de teste ──────────────────────────────────────────────────
// A password de desenvolvimento ("liquen2026") já está no repositório e é
// pública; o hash abaixo é só dela, para o servidor de produção deste teste
// aceitar o login. Nunca usar isto num servidor a sério.
const TEST_PASSWORD = "liquen2026";
const TEST_PASSWORD_HASH = "$2b$10$9TQ3Ul8QgEleIZjy.TtSruhiJ2zsXd2doRNiXp0Fu/M6f70JdCxwu";
const TEST_USER = "Catarina";

// ── Argumentos ────────────────────────────────────────────────────────────
const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, "").split("=");
    return [k, v ?? true];
  }),
);
const RUNS = Number(args.runs ?? 3);
// A secção de volume SUBSTITUI os ficheiros em data/. É por isso OPT-IN: só
// corre se `--volume=N` for escrito à mão. Antes era o comportamento por
// omissão e uma execução distraída chegou a reescrever os dados do projeto —
// nunca mais. Sem `--volume`, a medição é 100% de leitura.
const VOLUME = args.volume === undefined ? 0 : Number(args.volume);
const CPU_THROTTLE = Number(args.cpu ?? 1);
const SKIP = new Set(
  String(args.skip ?? "")
    .split(",")
    .filter(Boolean),
);
const HEADED = !!args.headed;

// ── Utilitários ───────────────────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const ms = (n) => `${Math.round(n)} ms`;

function median(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function p95(xs) {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.ceil(s.length * 0.95) - 1)];
}

function heading(title) {
  console.log(`\n${"─".repeat(74)}\n${title}\n${"─".repeat(74)}`);
}

async function freePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });
}

// ── Chromium ──────────────────────────────────────────────────────────────
// O Playwright está instalado mas o binário vive fora do sítio habitual neste
// ambiente; procuramos as localizações conhecidas antes de desistir.
function findChromium() {
  const candidates = [
    process.env.CHROMIUM_PATH,
    "/opt/pw-browsers/chromium-1223/chrome-linux64/chrome",
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    "/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell",
  ].filter(Boolean);
  for (const c of candidates) if (fsSync.existsSync(c)) return c;
  // Última tentativa: deixar o Playwright resolver sozinho.
  return undefined;
}

// ── Servidor de produção ──────────────────────────────────────────────────
async function startServer(port) {
  if (!fsSync.existsSync(path.join(ROOT, ".next"))) {
    throw new Error("Não existe .next — corra `npm run build` antes de medir.");
  }
  const child = spawn("npm", ["run", "start", "--", "--port", String(port)], {
    cwd: ROOT,
    env: {
      ...process.env,
      NODE_ENV: "production",
      PORT: String(port),
      SESSION_SECRET: "bench-back-office-session-secret-0123456789",
      ADMIN_PASSWORD_HASH: TEST_PASSWORD_HASH,
      ADMIN_NAME: TEST_USER,
      NEXT_TELEMETRY_DISABLED: "1",
      // Sem SMTP nem Supabase: o objetivo é medir leitura e render, não envio.
      NEXT_PUBLIC_BASE_URL: `http://localhost:${port}`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let log = "";
  child.stdout.on("data", (d) => (log += d.toString()));
  child.stderr.on("data", (d) => (log += d.toString()));

  const base = `http://localhost:${port}`;
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return { child, base };
    } catch {
      /* ainda a arrancar */
    }
    if (child.exitCode !== null) throw new Error(`O servidor morreu:\n${log}`);
    await sleep(400);
  }
  child.kill("SIGKILL");
  throw new Error(`O servidor não ficou pronto em 90 s:\n${log}`);
}

// ── Sessão de admin ───────────────────────────────────────────────────────
async function loginCookies(base) {
  const res = await fetch(`${base}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: TEST_USER, password: TEST_PASSWORD }),
  });
  if (!res.ok) throw new Error(`Login falhou (${res.status}): ${await res.text()}`);
  const raw = res.headers.getSetCookie?.() ?? [];
  // A cookie de sessão chama-se `__Host-liquen_admin`: o prefixo `__Host-`
  // OBRIGA a `Secure` e PROÍBE o atributo Domain. Por isso o cookie é passado
  // ao Playwright por `url` (nunca por domain) e com secure:true — o Chromium
  // trata localhost como contexto seguro, portanto envia-o na mesma sobre http.
  return raw.map((c) => {
    const [pair] = c.split(";");
    const i = pair.indexOf("=");
    return {
      name: pair.slice(0, i).trim(),
      value: pair.slice(i + 1).trim(),
      url: base,
      secure: true,
      sameSite: "Lax",
    };
  });
}

// ── Observadores injetados na página ──────────────────────────────────────
// Instalados ANTES de qualquer navegação, para apanharem também o que acontece
// durante a hidratação (é aí que estão as tarefas longas que interessam).
const INIT_SCRIPT = () => {
  const b = {
    longTasks: [],
    lcp: 0,
    cls: 0,
    fcp: 0,
    mark: 0,
    interactiveAt: null,
    probeClicks: 0,
  };
  window.__bench = b;
  const safe = (type, cb) => {
    try {
      new PerformanceObserver(cb).observe({ type, buffered: true });
    } catch {
      /* tipo não suportado */
    }
  };
  safe("longtask", (l) => {
    for (const e of l.getEntries()) {
      b.longTasks.push({
        start: e.startTime,
        duration: e.duration,
        name: e.name,
        attribution: (e.attribution || []).map((a) => ({
          type: a.containerType,
          name: a.containerName || "",
          id: a.containerId || "",
          src: a.containerSrc || "",
        })),
      });
    }
  });
  safe("largest-contentful-paint", (l) => {
    const es = l.getEntries();
    if (es.length) b.lcp = es[es.length - 1].startTime;
  });
  safe("layout-shift", (l) => {
    for (const e of l.getEntries()) if (!e.hadRecentInput) b.cls += e.value;
  });
  safe("paint", (l) => {
    for (const e of l.getEntries()) if (e.name === "first-contentful-paint") b.fcp = e.startTime;
  });
};

/** Lê os recursos carregados desde `since` (performance.now()), com bytes. */
const READ_RESOURCES = (since) =>
  performance
    .getEntriesByType("resource")
    .filter((e) => e.startTime >= since - 1)
    .map((e) => ({
      url: e.name,
      type: e.initiatorType,
      start: e.startTime,
      end: e.responseEnd,
      duration: e.duration,
      transfer: e.transferSize,
      decoded: e.decodedBodySize,
    }));

// ── Atribuição de chunk → componente ──────────────────────────────────────
// Os chunks do Turbopack têm nomes opacos e não há sourcemaps em produção.
// Cada componente tem uma frase em português que só existe nele; procurá-la
// dentro do ficheiro diz-nos, sem ambiguidade, o que aquele chunk transporta.
const CHUNK_MARKERS = [
  // ── Runtime (não é nosso, mas domina os bytes) ──
  ["react-dom + scheduler", "__reactFiber$"],
  ["next app-router", "HTML_LIMITED_BOT_UA_RE"],
  ["next server-actions runtime", "Expected workStore to be initialized"],
  ["next navigation runtime", "invariant expected app router to be mounted"],
  ["next/image", "deviceSizes"],
  ["core-js polyfills", "Bad Promise constructor"],
  ["web-vitals", "onCLS"],
  // ── Dados partilhados ──
  ["catálogo orcamento/data", "Acompanhamento personalizado 24/7"],
  ["export CSV/ICS", "BEGIN:VCALENDAR"],
  // ── Back office ──
  ["AdminClient (shell)", "Prepare o evento: tarefas, checklist, plano e convidados."],
  ["Overview", "liquen-meta-receita"],
  ["Agenda", "Próximos eventos"],
  ["Propostas", "Proposta marcada como recusada."],
  ["Faturas", "Erro ao criar a fatura"],
  ["Calendario", "Novo evento no calendário"],
  ["Temas", "larguei a pasta Fotos toda"],
  ["ThemePicker", "Escolher tema"],
  ["StatsDashboard", "liquen-pagamentos-"],
  ["ProposalStudio", "Valor Total Decoração"],
  ["Contratos", "Guarda a lista dos contratos num ficheiro que abre no Excel"],
  ["Kanban", "clamp(20px, 2vw, 28px)"],
  ["Clientes", "Procurar cliente…"],
  ["Tarefas", "Não foi possível criar a tarefa. Tente novamente."],
  ["Fornecedores", "Exportar fornecedores para CSV"],
  ["Inventario", "Não foi possível guardar o item."],
  ["FollowUps", "Proposta sem resposta"],
  ["ClientMessenger", "Seguimento proposta"],
  ["PaymentsPanel", "registo um pagamento e nada muda"],
  ["EventCosts", "Não foi possível guardar o custo. Tente novamente."],
  ["GuestList", "Exportar convidados para CSV"],
  ["ProductionPlan", "Plano de produção por gerar"],
  ["EventTimeline", "Montagem e decoração do espaço"],
  ["EventChecklist", "Não foi possível guardar a checklist. Tente novamente."],
  ["ProposalBuilder", "liquen-last-proposal-items"],
  ["EmailTemplates", "insere a ligação para a proposta"],
  ["RichEmailEditor", "Ferramentas de formatação"],
  ["CommandPalette", "Pesquisar ou navegar…"],
  ["Reminders", "Lembretes"],
  // ── Site público ──
  ["GaleriaClient", "Voltar ao topo"],
  ["ogl / WebGL", "createShader"],
  ["OrcamentoForm", "acceptTerms"],
];

const chunkLabelCache = new Map();
async function labelChunk(url) {
  const file = url.split("/").pop()?.split("?")[0];
  if (!file) return "?";
  if (chunkLabelCache.has(file)) return chunkLabelCache.get(file);
  const full = path.join(ROOT, ".next", "static", "chunks", file);
  let label = file;
  try {
    const src = await fs.readFile(full, "utf8");
    const hits = CHUNK_MARKERS.filter(([, marker]) => src.includes(marker)).map(([n]) => n);
    if (hits.length) label = hits.join(" + ");
  } catch {
    /* não é um chunk local (ex.: media) */
  }
  chunkLabelCache.set(file, label);
  return label;
}

/** Tamanho no disco de um chunk (bytes), para o ranking por ficheiro. */
async function chunkSize(url) {
  const file = url.split("/").pop()?.split("?")[0];
  try {
    return (await fs.stat(path.join(ROOT, ".next", "static", "chunks", file))).size;
  } catch {
    return 0;
  }
}

// ── Contexto do browser ───────────────────────────────────────────────────
/**
 * Sessão de admin capturada UMA vez e reutilizada por todos os contextos.
 *
 * O endpoint de login tem limitação de tentativas (8 por minuto por IP, ver
 * src/app/api/admin/login/route.ts). Uma medição abre dezenas de contextos, por
 * isso autenticamo-nos uma vez, guardamos o estado do Playwright (que respeita
 * as regras do prefixo `__Host-` da cookie de sessão) e injetamo-lo depois.
 */
let STORAGE_STATE = null;
async function captureSession(browser, base) {
  const ctx = await browser.newContext();
  const r = await ctx.request.post(`${base}/api/admin/login`, {
    data: { name: TEST_USER, password: TEST_PASSWORD },
  });
  if (!r.ok()) throw new Error(`Login falhou (${r.status()})`);
  STORAGE_STATE = await ctx.storageState();
  await ctx.close();
}

async function newPage(browser, loginBase, { throttle = CPU_THROTTLE } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Sem cache entre execuções: é o primeiro carregamento que interessa.
    bypassCSP: false,
    ...(loginBase && STORAGE_STATE ? { storageState: STORAGE_STATE } : {}),
  });

  const page = await ctx.newPage();
  await page.addInitScript(INIT_SCRIPT);
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
  if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
  return { ctx, page, cdp };
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. PRIMEIRO CARREGAMENTO
// ═══════════════════════════════════════════════════════════════════════════
async function measureFirstLoad(browser, base, label) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) {
    const { ctx, page } = await newPage(browser, base);
    const t0 = Date.now();
    await page.goto(`${base}/pt/orcamento/admin`, { waitUntil: "commit", timeout: 60_000 });

    // "Quanto tempo até responder a um clique": batemos no botão "Mais" da
    // barra lateral de 40 em 40 ms até o aria-expanded mudar. O botão é do
    // React, portanto só reage depois da hidratação — é exatamente a pergunta.
    // A marca de tempo vem de dentro da página (precisa), o intervalo de 40 ms
    // é só a granularidade com que tentamos.
    const interactive = await page
      .evaluate(async () => {
        const t = performance.now();
        const find = () =>
          [...document.querySelectorAll('nav[aria-label="Navegação do back office"] button')].find(
            (b) => b.getAttribute("aria-expanded") !== null,
          );
        const deadline = t + 30_000;
        while (performance.now() < deadline) {
          const btn = find();
          if (btn) {
            const before = btn.getAttribute("aria-expanded");
            btn.click();
            window.__bench.probeClicks++;
            await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
            if (btn.getAttribute("aria-expanded") !== before) {
              window.__bench.interactiveAt = performance.now();
              // Repor o estado do menu (o clique é reversível de propósito).
              btn.click();
              return window.__bench.interactiveAt;
            }
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        return null;
      })
      .catch(() => null);

    await page.waitForLoadState("load").catch(() => {});
    // Deixar a janela de idle correr: é lá que o prefetch de dados acontece.
    await sleep(2500);

    const data = await page.evaluate(
      ([readSrc]) => {
        const nav = performance.getEntriesByType("navigation")[0] || {};
        const read = new Function("since", `return (${readSrc})(since)`);
        return {
          bench: window.__bench,
          nav: {
            ttfb: nav.responseStart,
            responseEnd: nav.responseEnd,
            domContentLoaded: nav.domContentLoadedEventEnd,
            load: nav.loadEventEnd,
            transferSize: nav.transferSize,
            decodedBodySize: nav.decodedBodySize,
          },
          resources: read(0),
        };
      },
      [String(READ_RESOURCES)],
    );

    runs.push({ ...data, interactive, wall: Date.now() - t0 });
    await ctx.close();
  }

  // Agregar
  const scripts = runs[0].resources.filter((r) => r.type === "script" || /\.js(\?|$)/.test(r.url));
  const jsBytes = scripts.reduce((s, r) => s + (r.transfer || r.decoded || 0), 0);
  const cssBytes = runs[0].resources
    .filter((r) => r.type === "css" || /\.css(\?|$)/.test(r.url))
    .reduce((s, r) => s + (r.transfer || r.decoded || 0), 0);
  const imgBytes = runs[0].resources
    .filter((r) => r.type === "img")
    .reduce((s, r) => s + (r.transfer || r.decoded || 0), 0);
  const apiCalls = runs[0].resources.filter((r) => r.url.includes("/api/"));

  // Ranking dos chunks por bytes, com etiqueta legível.
  const ranked = [];
  for (const r of scripts) {
    const size = (await chunkSize(r.url)) || r.transfer || r.decoded || 0;
    ranked.push({
      url: r.url,
      file: r.url.split("/").pop(),
      bytes: r.transfer || r.decoded || size,
      disk: size,
      label: await labelChunk(r.url),
      start: r.start,
      end: r.end,
    });
  }
  ranked.sort((a, b) => b.bytes - a.bytes);

  const out = {
    label,
    runs: runs.length,
    documentBytes: runs[0].nav.transferSize,
    documentHtmlBytes: runs[0].nav.decodedBodySize,
    jsBytes,
    jsFiles: scripts.length,
    cssBytes,
    imgBytes,
    ttfb: median(runs.map((r) => r.nav.ttfb)),
    fcp: median(runs.map((r) => r.bench.fcp)),
    lcp: median(runs.map((r) => r.bench.lcp)),
    cls: median(runs.map((r) => r.bench.cls)),
    domContentLoaded: median(runs.map((r) => r.nav.domContentLoaded)),
    load: median(runs.map((r) => r.nav.load)),
    interactive: median(runs.map((r) => r.interactive ?? 0)),
    interactiveP95: p95(runs.map((r) => r.interactive ?? 0)),
    longTasks: runs[0].bench.longTasks.filter((t) => t.duration >= 50),
    totalBlocking: runs[0].bench.longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0),
    chunks: ranked,
    api: apiCalls.map((r) => ({
      url: new URL(r.url).pathname,
      start: r.start,
      duration: r.duration,
      bytes: r.transfer || r.decoded,
    })),
  };

  heading(`1. PRIMEIRO CARREGAMENTO — /orcamento/admin  (${label})`);
  console.log(`   HTML do servidor .......... ${kb(out.documentHtmlBytes)} (descomprimido)`);
  console.log(`   JS enviado ................ ${kb(out.jsBytes)} em ${out.jsFiles} ficheiros`);
  console.log(`   CSS ....................... ${kb(out.cssBytes)}`);
  console.log(`   Imagens ................... ${kb(out.imgBytes)}`);
  console.log(`   TTFB ...................... ${ms(out.ttfb)}`);
  console.log(`   Primeira pintura (FCP) .... ${ms(out.fcp)}`);
  console.log(`   Maior elemento (LCP) ...... ${ms(out.lcp)}`);
  console.log(
    `   RESPONDE AO 1.º CLIQUE .... ${ms(out.interactive)}  (p95 ${ms(out.interactiveP95)}, ±40 ms)`,
  );
  console.log(`   Bloqueio total (TBT) ...... ${ms(out.totalBlocking)}`);
  console.log(`   CLS ....................... ${out.cls.toFixed(3)}`);
  console.log("\n   Maiores contribuintes de JS (ficheiro → o que transporta):");
  for (const c of ranked.slice(0, 10)) {
    console.log(`     ${kb(c.bytes).padStart(10)}  ${c.file.padEnd(20)} ${c.label}`);
  }
  console.log("\n   Cascata (início → fim, ms desde a navegação):");
  for (const c of [...ranked].sort((a, b) => a.start - b.start).slice(0, 12)) {
    console.log(
      `     ${String(Math.round(c.start)).padStart(6)} → ${String(Math.round(c.end)).padStart(6)}  ${kb(c.bytes).padStart(10)}  ${c.label}`,
    );
  }
  // Pedidos repetidos durante o arranque — cada duplicado é uma leitura
  // completa do ficheiro/tabela no servidor e um render a mais no cliente.
  const byPath = new Map();
  for (const a of out.api) byPath.set(a.url, (byPath.get(a.url) ?? 0) + 1);
  out.duplicateApi = [...byPath.entries()]
    .filter(([, n]) => n > 1)
    .map(([url, n]) => ({ url, times: n }));
  if (out.duplicateApi.length) {
    console.log("\n   PEDIDOS DUPLICADOS no arranque (mesmo URL, mais do que uma vez):");
    for (const d of out.duplicateApi) console.log(`     ${d.times}× ${d.url}`);
  }
  if (out.api.length) {
    console.log("\n   Pedidos à API durante o arranque:");
    for (const a of out.api.sort((x, y) => x.start - y.start)) {
      console.log(
        `     ${String(Math.round(a.start)).padStart(6)} ms  ${ms(a.duration).padStart(8)}  ${kb(a.bytes || 0).padStart(10)}  ${a.url}`,
      );
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. MUDANÇA DE VISTA
// ═══════════════════════════════════════════════════════════════════════════
// Cada vista é um chunk próprio (ver admin/lazy.tsx) e quase todas vão buscar
// dados a uma API. A pergunta é qual das três coisas manda no tempo: descarregar
// o código, ir buscar os dados, ou desenhar.
const VIEW_STEPS = [
  { id: "pedidos", label: "Pedidos" },
  { id: "propostas", label: "Propostas" },
  { id: "faturas", label: "Faturas" },
  { id: "calendario", label: "Calendário" },
  { id: "temas", label: "Temas", inMore: true },
  { id: "estatisticas", label: "Estatísticas", inMore: true },
];

/**
 * Clica num destino da barra lateral pelo nome que se lê no ecrã.
 *
 * Os destinos secundários vivem dentro do grupo "Mais", que arranca fechado:
 * se o item não estiver no DOM, abrimos o grupo primeiro. Deliberadamente sem
 * `aria-expanded` — o estado do grupo é uma consequência, o que interessa é o
 * botão existir e ser clicável, tal como para a Catarina.
 */
/** Abre o grupo "Mais" da barra lateral uma vez, para que TODOS os destinos
 *  fiquem visíveis durante a medição — senão cada destino secundário exigia
 *  dois cliques e o segundo já mediria outra coisa. */
async function expandMore(page) {
  const toggle = page
    .locator('nav[aria-label="Navegação do back office"] button[aria-expanded]')
    .first();
  try {
    await toggle.waitFor({ state: "visible", timeout: 10_000 });
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  } catch {
    /* sem grupo "Mais" nesta versão — os destinos já estão todos à vista */
  }
}

async function clickNav(page, label) {
  const nav = page.locator('nav[aria-label="Navegação do back office"]');
  // Sem `exact`: o item "Pedidos" traz um contador no nome acessível.
  const item = nav.getByRole("button", { name: label }).first();
  await item.waitFor({ state: "visible", timeout: 20_000 });
  await item.click({ timeout: 20_000 });
}

/** Espera que a vista assente: sem esqueletos e sem mutações durante 2 frames. */
async function waitSettled(page, timeout = 20_000) {
  return page.evaluate(async (limit) => {
    const t0 = performance.now();
    const main = document.querySelector("main") || document.body;
    let lastMutation = performance.now();
    const obs = new MutationObserver(() => (lastMutation = performance.now()));
    obs.observe(main, { childList: true, subtree: true, characterData: true });
    let settled = null;
    while (performance.now() - t0 < limit) {
      const skeletons = main.querySelectorAll(".bo-skeleton").length;
      const quiet = performance.now() - lastMutation;
      if (skeletons === 0 && quiet > 150 && main.innerText.trim().length > 40) {
        settled = lastMutation;
        break;
      }
      await new Promise((r) => setTimeout(r, 16));
    }
    obs.disconnect();
    return settled ?? performance.now();
  }, timeout);
}

async function measureViewSwitches(browser, base, label) {
  const results = new Map();
  for (let run = 0; run < RUNS; run++) {
    const { ctx, page } = await newPage(browser, base);
    await page.goto(`${base}/pt/orcamento/admin`, { waitUntil: "load", timeout: 60_000 });
    // Esperar a hidratação (a barra lateral só responde depois).
    await page
      .locator('nav[aria-label="Navegação do back office"] button[aria-expanded]')
      .waitFor({ timeout: 20_000 });
    await sleep(2500); // deixar o prefetch de idle acontecer, como na vida real
    await expandMore(page);

    for (const step of VIEW_STEPS) {
      try {
        const t0 = await page.evaluate(() => {
          window.__bench.mark = performance.now();
          window.__bench.longTasks.length = 0;
          return window.__bench.mark;
        });
        await clickNav(page, step.label);
        const settledAt = await waitSettled(page);
        const detail = await page.evaluate(
          ([readSrc, since]) => {
            const read = new Function("since", `return (${readSrc})(since)`);
            return { resources: read(since), longTasks: window.__bench.longTasks.slice() };
          },
          [String(READ_RESOURCES), t0],
        );

        const js = detail.resources.filter((r) => /\.js(\?|$)/.test(r.url));
        const api = detail.resources.filter((r) => r.url.includes("/api/"));
        const chunkSpan = js.length
          ? Math.max(...js.map((r) => r.end)) - Math.min(...js.map((r) => r.start))
          : 0;
        const apiSpan = api.length
          ? Math.max(...api.map((r) => r.end)) - Math.min(...api.map((r) => r.start))
          : 0;
        // Fases em SÉRIE, que é como a vista realmente aparece:
        // clique → pedir o chunk → recebê-lo → avaliar o módulo e montar →
        // só então o efeito dispara o fetch → dados → desenhar.
        const jsStart = js.length ? Math.min(...js.map((r) => r.start)) : null;
        const jsEnd = js.length ? Math.max(...js.map((r) => r.end)) : null;
        const apiStart = api.length ? Math.min(...api.map((r) => r.start)) : null;
        const apiEnd = api.length ? Math.max(...api.map((r) => r.end)) : null;
        const phases = {
          reagir: (jsStart ?? apiStart ?? settledAt) - t0,
          descarregar: chunkSpan,
          montar: apiStart != null && jsEnd != null ? Math.max(0, apiStart - jsEnd) : 0,
          dados: apiSpan,
          desenhar: settledAt - (apiEnd ?? jsEnd ?? t0),
        };
        const total = settledAt - t0;
        const blocking = detail.longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0);

        const key = step.label;
        if (!results.has(key))
          results.set(key, {
            label: key,
            total: [],
            chunk: [],
            api: [],
            blocking: [],
            chunkBytes: 0,
            apiBytes: 0,
            chunkNames: [],
            apiUrls: [],
            longTasks: [],
            phases: [],
          });
        const acc = results.get(key);
        acc.total.push(total);
        acc.chunk.push(chunkSpan);
        acc.api.push(apiSpan);
        acc.blocking.push(blocking);
        acc.phases.push(phases);
        if (run === 0) {
          acc.chunkBytes = js.reduce((s, r) => s + (r.transfer || r.decoded || 0), 0);
          acc.apiBytes = api.reduce((s, r) => s + (r.transfer || r.decoded || 0), 0);
          acc.chunkNames = await Promise.all(js.map((r) => labelChunk(r.url)));
          acc.apiUrls = api.map((r) => new URL(r.url).pathname);
          acc.longTasks = detail.longTasks.filter((t) => t.duration >= 50);
        }
      } catch (err) {
        // Um passo que falha não deita fora a medição toda — regista-se e segue.
        console.log(
          `   (a vista "${step.label}" falhou: ${String(err).split("\n")[0].slice(0, 90)})`,
        );
        await page
          .screenshot({ path: path.join(ROOT, `bench-falha-${step.id}.png`) })
          .catch(() => {});
      }
    }
    // ── "Mensagens" ──
    // Não é uma vista de topo: vive DENTRO de um pedido, no separador
    // "Fazer proposta" (id `comunicacao`), que carrega o ClientMessenger e o
    // registo de atividade. Medimos o caminho real: Pedidos → abrir o 1.º
    // pedido → separador.
    try {
      await clickNav(page, "Pedidos");
      await waitSettled(page);
      const card = page.locator("main button:has(p.font-semibold)").first();
      const tOpen = await page.evaluate(() => {
        window.__bench.mark = performance.now();
        window.__bench.longTasks.length = 0;
        return window.__bench.mark;
      });
      await card.click({ timeout: 10_000 });
      const openedAt = await waitSettled(page);
      const tTab = await page.evaluate(() => {
        window.__bench.mark = performance.now();
        window.__bench.longTasks.length = 0;
        return window.__bench.mark;
      });
      await page.locator('button:has-text("Fazer proposta")').first().click({ timeout: 10_000 });
      const tabAt = await waitSettled(page);
      const detail = await page.evaluate(
        ([readSrc, since]) => {
          const read = new Function("since", `return (${readSrc})(since)`);
          return { resources: read(since), longTasks: window.__bench.longTasks.slice() };
        },
        [String(READ_RESOURCES), tTab],
      );
      for (const [key, value] of [
        ["Abrir pedido", openedAt - tOpen],
        ["Mensagens (separador)", tabAt - tTab],
      ]) {
        if (!results.has(key))
          results.set(key, {
            label: key,
            total: [],
            chunk: [],
            api: [],
            blocking: [],
            chunkBytes: 0,
            apiBytes: 0,
            chunkNames: [],
            apiUrls: [],
            longTasks: [],
          });
        const acc = results.get(key);
        acc.total.push(value);
        acc.chunk.push(0);
        acc.api.push(0);
        acc.blocking.push(detail.longTasks.reduce((s2, t) => s2 + Math.max(0, t.duration - 50), 0));
        if (run === 0 && key === "Mensagens (separador)") {
          const js = detail.resources.filter((r) => /\.js(\?|$)/.test(r.url));
          const api = detail.resources.filter((r) => r.url.includes("/api/"));
          acc.chunkBytes = js.reduce((s2, r) => s2 + (r.transfer || r.decoded || 0), 0);
          acc.apiBytes = api.reduce((s2, r) => s2 + (r.transfer || r.decoded || 0), 0);
          acc.chunkNames = await Promise.all(js.map((r) => labelChunk(r.url)));
          acc.apiUrls = api.map((r) => new URL(r.url).pathname);
          acc.longTasks = detail.longTasks.filter((t) => t.duration >= 50);
          acc.chunk = [
            js.length ? Math.max(...js.map((r) => r.end)) - Math.min(...js.map((r) => r.start)) : 0,
          ];
          acc.api = [
            api.length
              ? Math.max(...api.map((r) => r.end)) - Math.min(...api.map((r) => r.start))
              : 0,
          ];
        }
      }
    } catch (err) {
      console.log(`   (não foi possível medir o detalhe do pedido: ${String(err).slice(0, 90)})`);
    }

    await ctx.close();
  }

  const PHASE_LABEL = {
    reagir: "reagir ao clique",
    descarregar: "descarregar o chunk",
    montar: "avaliar o módulo e montar",
    dados: "ir buscar dados",
    desenhar: "desenhar",
  };
  const rows = [...results.values()].map((r) => {
    const total = median(r.total);
    const ph = {};
    for (const k of Object.keys(PHASE_LABEL)) {
      ph[k] = median((r.phases ?? []).map((p) => p?.[k] ?? 0));
    }
    const worst = Object.entries(ph).sort((a, b) => b[1] - a[1])[0];
    return {
      ...r,
      total,
      chunk: median(r.chunk),
      api: median(r.api),
      ph,
      dominates: PHASE_LABEL[worst?.[0]] ?? "desenhar",
      blockingMs: median(r.blocking),
    };
  });

  heading(`2. MUDANÇA DE VISTA  (${label}) — mediana de ${RUNS} execuções`);
  console.log(
    "   Fases em série: clique → pedir o chunk → recebê-lo → avaliar+montar →\n" +
      "   o efeito dispara o fetch → dados → desenhar.\n",
  );
  console.log(
    "   vista               total   reagir  chunk  montar   dados  desenhar   o que manda",
  );
  for (const r of rows) {
    console.log(
      `   ${r.label.padEnd(20)} ${ms(r.total).padStart(7)} ${ms(r.ph.reagir).padStart(8)} ` +
        `${ms(r.ph.descarregar).padStart(6)} ${ms(r.ph.montar).padStart(7)} ` +
        `${ms(r.ph.dados).padStart(7)} ${ms(r.ph.desenhar).padStart(9)}   ${r.dominates}`,
    );
  }
  console.log("\n   Detalhe do que cada vista descarrega na primeira visita:");
  for (const r of rows) {
    console.log(
      `     ${r.label.padEnd(14)} JS ${kb(r.chunkBytes).padStart(10)}  dados ${kb(r.apiBytes).padStart(10)}  ${r.apiUrls.join(", ") || "(sem API)"}`,
    );
    if (r.chunkNames.filter(Boolean).length)
      console.log(`     ${" ".repeat(14)} chunks: ${r.chunkNames.join(", ")}`);
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. TAREFAS LONGAS
// ═══════════════════════════════════════════════════════════════════════════
function reportLongTasks(first, views, label) {
  heading(`3. TAREFAS LONGAS (>50 ms na thread principal) — ${label}`);
  const all = [
    ...first.longTasks.map((t) => ({ ...t, where: "primeiro carregamento" })),
    ...views.flatMap((v) => v.longTasks.map((t) => ({ ...t, where: `vista ${v.label}` }))),
  ].sort((a, b) => b.duration - a.duration);
  if (!all.length) {
    console.log("   Nenhuma. (Confirmar que o CPU não está a ser abrandado: --cpu=1)");
    return all;
  }
  console.log("   duração   quando                    contentor");
  for (const t of all.slice(0, 15)) {
    const attr = t.attribution?.[0];
    const who = attr ? `${attr.type}${attr.name ? ` "${attr.name}"` : ""}` : "window";
    console.log(
      `   ${ms(t.duration).padStart(8)}  ${t.where.padEnd(24)}  ${who}  @${Math.round(t.start)} ms`,
    );
  }
  const total = all.reduce((s, t) => s + Math.max(0, t.duration - 50), 0);
  console.log(`\n   Bloqueio acumulado acima de 50 ms: ${ms(total)} em ${all.length} tarefas.`);
  return all;
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. VOLUME REALISTA
// ═══════════════════════════════════════════════════════════════════════════
const NOMES = [
  "Maria & Tomás",
  "Sofia & Miguel",
  "Ana & Rui",
  "Inês & Pedro",
  "Beatriz & João",
  "Carolina & Diogo",
  "Marta & André",
  "Rita & Nuno",
  "Catarina & Bruno",
  "Joana & Tiago",
  "Leonor & Gonçalo",
  "Matilde & Francisco",
  "Teresa & Vasco",
  "Clara & Duarte",
];
const LOCAIS = [
  "Herdade dos Templários, Évora",
  "Quinta do Sobral, Alentejo",
  "Monte da Oliveirinha, Évora",
  "Quinta da Bela Vista, Sintra",
  "Herdade da Malhadinha, Beja",
  "Solar dos Canaviais, Évora",
];
const CATEGORIAS = ["particulares", "empresas"];
const TIPOS = {
  particulares: ["casamentos", "batizados", "aniversarios", "jantares_gala"],
  empresas: ["conferencias", "teambuilding", "lancamentos", "jantares_empresa"],
};
const ESTADOS = ["pendente", "em_revisao", "cotado", "aceite", "rejeitado"];

function seededRandom(seed) {
  let s = seed >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/**
 * Lê um pedido REAL de data/quotes.json para servir de molde.
 *
 * Sem isto, os pedidos gerados tinham menos campos do que os verdadeiros
 * (`priceBreakdown`, `addons`, `packageTier`, …) e qualquer ecrã que rebentasse
 * seria culpa dos dados de teste, não do produto. Partindo de um pedido real e
 * variando só o que distingue um cliente de outro, o que a medição encontra é
 * mesmo do produto.
 */
async function quoteTemplate() {
  try {
    const rows = JSON.parse(await fs.readFile(path.join(DATA_DIR, "quotes.json"), "utf8"));
    if (Array.isArray(rows) && rows.length) return rows[0];
  } catch {
    /* sem molde — seguimos com o mínimo */
  }
  return null;
}

function generateVolume(n, template = null) {
  const rnd = seededRandom(42);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const quotes = [];
  const proposals = [];
  const invoices = [];
  const tasks = [];
  const events = [];
  const contracts = [];

  for (let i = 0; i < n; i++) {
    const cat = pick(CATEGORIAS);
    const nome = `${pick(NOMES)} ${i}`;
    const id = `LIQ-BENCH${String(i).padStart(5, "0")}-${(i * 2654435761) % 0xffffffff}`;
    const day = 1 + Math.floor(rnd() * 27);
    const month = 1 + Math.floor(rnd() * 12);
    const year = 2026 + Math.floor(rnd() * 2);
    const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const submitted = new Date(Date.now() - Math.floor(rnd() * 400) * 86400000).toISOString();
    const status = pick(ESTADOS);
    const guests = 40 + Math.floor(rnd() * 260);

    quotes.push({
      // Começa por um pedido real (todos os campos que a interface espera) e
      // sobrepõe-se só o que varia de cliente para cliente.
      ...(template ?? {}),
      id,
      name: nome,
      email: `cliente${i}@exemplo.pt`,
      phone: `+351 9${10 + (i % 80)} ${100 + (i % 900)} ${100 + (i % 900)}`,
      company: cat === "empresas" ? `Empresa ${i} Lda.` : "",
      nif: "",
      guests,
      date,
      location: pick(LOCAIS),
      notes:
        "Pedido gerado para medição de desempenho. Descrição com algum comprimento, " +
        "como as reais costumam ter, incluindo detalhes de cerimónia, horários e " +
        "preferências de decoração que a Catarina lê na lista.",
      category: cat,
      eventType: pick(TIPOS[cat]),
      eventName: cat === "particulares" ? "Casamento" : "Evento corporativo",
      submittedAt: submitted,
      status,
      lastUpdated: submitted,
      guestList: [],
      finalPrice: status === "aceite" ? 3000 + Math.floor(rnd() * 20000) : undefined,
      tags: rnd() > 0.6 ? ["prioritário"] : [],
      activity: Array.from({ length: 3 + Math.floor(rnd() * 8) }, (_, k) => ({
        at: new Date(Date.parse(submitted) + k * 3600000).toISOString(),
        by: "Catarina",
        what: "Estado alterado / nota adicionada durante o acompanhamento do pedido.",
      })),
    });

    if (rnd() > 0.35) {
      const base = 2000 + Math.floor(rnd() * 18000);
      proposals.push({
        id: `prop-bench-${i}`,
        quoteId: id,
        clientName: nome,
        clientEmail: `cliente${i}@exemplo.pt`,
        currency: "EUR",
        lineItems: Array.from({ length: 3 + Math.floor(rnd() * 5) }, (_, k) => ({
          description: `Serviço ${k + 1} — decoração, coordenação e produção`,
          qty: 1,
          unitPrice: Math.floor(base / 6),
        })),
        vatRate: 0.23,
        subtotal: base,
        vat: base * 0.23,
        total: base * 1.23,
        status: pick(["rascunho", "enviada", "aceite", "rejeitada"]),
        createdAt: submitted,
        sentAt: submitted,
      });
    }

    if (rnd() > 0.5) {
      const amount = 1000 + Math.floor(rnd() * 9000);
      invoices.push({
        id: `inv-bench-${i}`,
        number: `FT 2026/${String(i + 1).padStart(4, "0")}`,
        quoteId: id,
        clientName: nome,
        clientEmail: `cliente${i}@exemplo.pt`,
        kind: pick(["sinal", "saldo", "total"]),
        amount,
        vatRate: 0.23,
        issuedAt: date,
        dueAt: date,
        paidAt: rnd() > 0.5 ? date : undefined,
        status: pick(["emitida", "paga"]),
        note: "",
      });
    }

    if (rnd() > 0.7) {
      tasks.push({
        id: `task-bench-${i}`,
        title: `Confirmar fornecedor para ${nome}`,
        done: rnd() > 0.5,
        priority: pick(["baixa", "normal", "alta"]),
        dueDate: date,
        quoteId: id,
        clientName: nome,
        assignee: "Catarina",
        area: pick(["Comercial", "Produção", "Decoração", "Financeiro"]),
        createdAt: submitted,
      });
    }

    events.push({
      id: `evt-bench-${i}`,
      title: `${nome} — ${cat === "particulares" ? "Casamento" : "Evento"}`,
      date,
      quoteId: id,
      kind: "evento",
      notes: "",
    });

    if (rnd() > 0.75) {
      contracts.push({
        id: `ct-bench-${i}`,
        quoteId: id,
        proposalId: `prop-bench-${i}`,
        clientName: nome,
        clientEmail: `cliente${i}@exemplo.pt`,
        termsVersion: "2026-01",
        termsSnapshot: "Condições gerais aceites pelo cliente (amostra de medição).",
        status: pick(["pendente", "aceite"]),
        createdAt: submitted,
        acceptedAt: submitted,
        acceptedName: nome,
      });
    }
  }
  return {
    "quotes.json": quotes,
    "proposals.json": proposals,
    "invoices.json": invoices,
    "tasks.json": tasks,
    "calendar-events.json": events,
    "contracts.json": contracts,
  };
}

/**
 * Um SIGKILL (ou uma falha de energia) a meio da secção de volume deixa os
 * dados de teste no sítio e a cópia de segurança por reclamar. Antes de começar,
 * se encontrarmos uma cópia abandonada, repomo-la — assim uma medição
 * interrompida nunca contamina a seguinte nem deixa lixo à espera de commit.
 */
async function recoverAbandonedBackup() {
  const leftovers = (await fs.readdir(ROOT).catch(() => [])).filter((f) =>
    f.startsWith(".bench-data-backup-"),
  );
  for (const dir of leftovers) {
    const full = path.join(ROOT, dir);
    console.log(`   A repor dados de uma medição interrompida (${dir})…`);
    for (const f of await fs.readdir(DATA_DIR).catch(() => [])) {
      await fs.rm(path.join(DATA_DIR, f), { force: true });
    }
    for (const f of await fs.readdir(full).catch(() => [])) {
      await fs.copyFile(path.join(full, f), path.join(DATA_DIR, f));
    }
    await fs.rm(full, { recursive: true, force: true });
  }
}

/**
 * Corre `fn` com os ficheiros de dados substituídos por dados de volume.
 * Faz cópia de segurança para uma pasta irmã e REPÕE sempre, aconteça o que
 * acontecer — incluindo Ctrl-C. Nada disto deve chegar a um commit.
 */
async function withVolume(n, fn) {
  await recoverAbandonedBackup();
  const backup = path.join(ROOT, `.bench-data-backup-${Date.now()}`);
  await fs.mkdir(backup, { recursive: true });
  const files = generateVolume(n, await quoteTemplate());
  const existing = await fs.readdir(DATA_DIR).catch(() => []);
  for (const f of existing) await fs.copyFile(path.join(DATA_DIR, f), path.join(backup, f));

  const restore = async () => {
    for (const f of await fs.readdir(DATA_DIR).catch(() => [])) {
      await fs.rm(path.join(DATA_DIR, f), { force: true });
    }
    for (const f of await fs.readdir(backup).catch(() => [])) {
      await fs.copyFile(path.join(backup, f), path.join(DATA_DIR, f));
    }
    await fs.rm(backup, { recursive: true, force: true });
  };
  const onExit = () => {
    // Reposição síncrona no caminho de emergência (Ctrl-C).
    try {
      for (const f of fsSync.readdirSync(backup)) {
        fsSync.copyFileSync(path.join(backup, f), path.join(DATA_DIR, f));
      }
      fsSync.rmSync(backup, { recursive: true, force: true });
    } catch {
      /* já reposto */
    }
  };
  process.on("SIGINT", onExit);
  process.on("SIGTERM", onExit);

  try {
    let bytes = 0;
    for (const [name, rows] of Object.entries(files)) {
      const json = JSON.stringify(rows, null, 2);
      bytes += Buffer.byteLength(json);
      await fs.writeFile(path.join(DATA_DIR, name), json);
    }
    console.log(
      `\n   Dados de volume escritos: ${Object.entries(files)
        .map(([f, r]) => `${r.length} ${f.replace(".json", "")}`)
        .join(", ")} (${kb(bytes)} em disco).`,
    );
    return await fn();
  } finally {
    process.off("SIGINT", onExit);
    process.off("SIGTERM", onExit);
    await restore();
    console.log("   Dados originais repostos.");
  }
}

/** Tempo de resposta das APIs de lista, isolado do browser. */
async function measureApiLatency(base, cookieHeader) {
  const endpoints = [
    "/api/propostas",
    "/api/faturas",
    "/api/tarefas",
    "/api/calendario",
    "/api/contratos",
    "/api/fornecedores",
  ];
  const rows = [];
  for (const ep of endpoints) {
    const times = [];
    let bytes = 0;
    for (let i = 0; i < Math.max(3, RUNS); i++) {
      const t = performance.now();
      const res = await fetch(`${base}${ep}`, { headers: { cookie: cookieHeader } });
      const body = await res.arrayBuffer();
      times.push(performance.now() - t);
      bytes = body.byteLength;
    }
    rows.push({ endpoint: ep, median: median(times), p95: p95(times), bytes });
  }
  console.log("\n   Latência das APIs de lista (sem browser):");
  console.log("     endpoint              mediana      p95      resposta");
  for (const r of rows) {
    console.log(
      `     ${r.endpoint.padEnd(20)} ${ms(r.median).padStart(8)} ${ms(r.p95).padStart(8)}  ${kb(r.bytes).padStart(10)}`,
    );
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. SITE PÚBLICO
// ═══════════════════════════════════════════════════════════════════════════
// Os orçamentos vêm de lighthouserc.json / lighthouserc.mobile.json. O lhci não
// corre aqui (precisa de rede para se instalar), por isso medimos as MESMAS
// métricas com o Playwright: LCP, CLS, bloqueio total e bytes. Não é um score
// de Lighthouse — é a matéria-prima dele.
const BUDGETS = {
  desktop: { lcp: 2500, cls: 0.1, tbt: 200, speedIndexish: 3400 },
  mobile: { lcp: 4000, cls: 0.1, tbt: 600 },
};

async function measurePublic(browser, base, label, throttle) {
  const pages = [
    { name: "home", url: `${base}/pt` },
    { name: "galeria", url: `${base}/pt/galeria` },
  ];
  const out = [];
  for (const p of pages) {
    const runs = [];
    for (let i = 0; i < RUNS; i++) {
      const { ctx, page } = await newPage(browser, null, { throttle });
      await page.goto(p.url, { waitUntil: "load", timeout: 60_000 });
      await sleep(3000); // deixar o LCP estabilizar e as animações arrancarem
      const d = await page.evaluate(
        ([readSrc]) => {
          const nav = performance.getEntriesByType("navigation")[0] || {};
          const read = new Function("since", `return (${readSrc})(since)`);
          return { bench: window.__bench, nav: { ttfb: nav.responseStart }, res: read(0) };
        },
        [String(READ_RESOURCES)],
      );
      runs.push(d);
      await ctx.close();
    }
    const js = runs[0].res.filter((r) => /\.js(\?|$)/.test(r.url));
    const img = runs[0].res.filter((r) => r.type === "img");
    const rec = {
      page: p.name,
      lcp: median(runs.map((r) => r.bench.lcp)),
      fcp: median(runs.map((r) => r.bench.fcp)),
      cls: median(runs.map((r) => r.bench.cls)),
      ttfb: median(runs.map((r) => r.nav.ttfb)),
      tbt: median(
        runs.map((r) => r.bench.longTasks.reduce((s, t) => s + Math.max(0, t.duration - 50), 0)),
      ),
      jsBytes: js.reduce((s, r) => s + (r.transfer || r.decoded || 0), 0),
      imgBytes: img.reduce((s, r) => s + (r.transfer || r.decoded || 0), 0),
      imgCount: img.length,
      longTasks: runs[0].bench.longTasks.filter((t) => t.duration >= 50),
    };
    rec.chunks = [];
    for (const j of js.sort((a, b) => (b.transfer || 0) - (a.transfer || 0)).slice(0, 6)) {
      rec.chunks.push({ bytes: j.transfer || j.decoded, label: await labelChunk(j.url) });
    }
    out.push(rec);
  }

  const budget = throttle > 1 ? BUDGETS.mobile : BUDGETS.desktop;
  const verdict = (v, max) => (v <= max ? "OK " : "FORA");
  heading(`5. SITE PÚBLICO — ${label}${throttle > 1 ? ` (CPU ${throttle}× mais lento)` : ""}`);
  console.log(
    "   página     LCP        orç.   CLS      orç.   TBT       orç.   JS         imagens",
  );
  for (const r of out) {
    console.log(
      `   ${r.page.padEnd(10)} ${ms(r.lcp).padStart(8)} ${verdict(r.lcp, budget.lcp)}  ` +
        `${r.cls.toFixed(3).padStart(6)} ${verdict(r.cls, budget.cls)}  ` +
        `${ms(r.tbt).padStart(8)} ${verdict(r.tbt, budget.tbt)}  ` +
        `${kb(r.jsBytes).padStart(10)} ${kb(r.imgBytes).padStart(10)} (${r.imgCount})`,
    );
  }
  for (const r of out) {
    if (r.chunks.length) {
      console.log(`\n   ${r.page} — maiores chunks:`);
      for (const c of r.chunks) console.log(`     ${kb(c.bytes).padStart(10)}  ${c.label}`);
    }
  }
  return { budget, pages: out };
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. PDF DA PROPOSTA
// ═══════════════════════════════════════════════════════════════════════════
// O gerador não está instrumentado (e não é meu para instrumentar), por isso o
// tempo é decomposto por DIFERENÇA: o mesmo documento com 0, 2, 8 e 20 fotos.
// A diferença entre eles é o custo por foto (fetch + sharp + embed); o que
// sobra com 0 fotos é o texto, as fontes e a estrutura do documento.
async function loadSamplePhotos(count) {
  const dir = path.join(ROOT, "public", "imagens");
  const all = (await fs.readdir(dir)).filter((f) => /\.jpe?g$/i.test(f));
  all.sort();
  const out = [];
  for (let i = 0; i < count; i++) {
    const buf = await fs.readFile(path.join(dir, all[i % all.length]));
    // Prefixo `data:` obrigatório. Sem ele, `fetchProposalImageBytes` só aceita
    // base64 solto se a string NÃO tiver "/" — e o alfabeto base64 tem "/", por
    // isso uma foto qualquer era confundida com um caminho de Storage e caía
    // fora do PDF sem dizer nada. Ver src/lib/proposal-storage.ts:406.
    out.push({
      b64: `data:image/jpeg;base64,${buf.toString("base64")}`,
      bytes: buf.length,
      name: all[i % all.length],
    });
  }
  return out;
}

function buildDoc(photos, coverCount = 2) {
  const cover = photos.slice(0, coverCount).map((p) => p.b64);
  const rest = photos.slice(coverCount);
  const boards = [];
  for (let i = 0; i < rest.length; i += 6) {
    boards.push({
      title: `Inspiração ${boards.length + 1}`,
      images: rest.slice(i, i + 6).map((p) => p.b64),
      annotation: "Paleta de tons naturais, verdes e brancos.",
    });
  }
  return {
    template: "decoracao",
    ref: "PO Decoração Casamento Bench · 12.09.2026",
    clientNames: "Sofia & Miguel",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Herdade dos Templários, Évora",
    guests: "150 pax",
    coverImages: cover,
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          { label: "Decor Cerimónia", desc: "Arco floral, corredor e cadeiras." },
          { label: "Decor Cocktail", desc: "Mesas altas, bar e zona lounge." },
          { label: "Decor Jantar", desc: "Centros de mesa, velas e toalhas." },
        ],
      },
      {
        letter: "b)",
        title: "Coordenação no dia",
        items: [
          { label: "Montagem", desc: "Equipa em obra desde as 8h." },
          { label: "Desmontagem", desc: "Recolha no dia seguinte." },
        ],
      },
    ],
    moodBoards: boards,
    budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "8.500,00 € + IVA",
    totalAmount: 8500,
    totalVatMode: "acrescer",
    vatRate: 0.23,
  };
}

async function measurePdf(base, cookieHeader, quoteId) {
  // O corpo do POST leva as fotos em base64: 12 fotos já são ~5 MB de JSON e o
  // Next recusa acima disso. Com 12 chega para separar o custo fixo do custo
  // por foto, que é o que interessa.
  const cases = [0, 2, 6, 12];
  const rows = [];
  const maxPhotos = Math.max(...cases);
  const pool = await loadSamplePhotos(maxPhotos);

  for (const n of cases) {
    const doc = buildDoc(pool.slice(0, n), Math.min(2, n));
    const body = JSON.stringify({ mode: "preview", doc });
    const times = [];
    let size = 0;
    let uploadBytes = Buffer.byteLength(body);
    for (let i = 0; i < Math.max(3, RUNS); i++) {
      const t = performance.now();
      const res = await fetch(`${base}/api/orcamento/${quoteId}/proposta-doc`, {
        method: "POST",
        headers: { "Content-Type": "application/json", cookie: cookieHeader },
        body,
      });
      const buf = await res.arrayBuffer();
      const dt = performance.now() - t;
      if (!res.ok) {
        console.log(`   AVISO: PDF com ${n} fotos devolveu ${res.status}.`);
        break;
      }
      times.push(dt);
      size = buf.byteLength;
    }
    if (!times.length) continue;
    rows.push({
      photos: n,
      cold: times[0],
      warm: median(times.slice(1).length ? times.slice(1) : times),
      pdfBytes: size,
      uploadBytes,
      srcBytes: pool.slice(0, n).reduce((s, p) => s + p.bytes, 0),
    });
  }

  heading("6. PDF DA PROPOSTA — ponta a ponta (POST /api/orcamento/:id/proposta-doc)");
  console.log("   fotos   1.ª chamada   já quente   PDF gerado   fotos originais   envio JSON");
  for (const r of rows) {
    console.log(
      `   ${String(r.photos).padStart(5)}   ${ms(r.cold).padStart(11)}   ${ms(r.warm).padStart(9)}   ` +
        `${kb(r.pdfBytes).padStart(10)}   ${kb(r.srcBytes).padStart(15)}   ${kb(r.uploadBytes).padStart(10)}`,
    );
  }
  const zero = rows.find((r) => r.photos === 0);
  const twenty = rows.find((r) => r.photos === 20);
  if (zero && twenty) {
    const perPhoto = (twenty.warm - zero.warm) / 20;
    console.log(
      `\n   Decomposição por diferença:\n` +
        `     · texto + fontes + estrutura ... ${ms(zero.warm)} (fixo, independente das fotos)\n` +
        `     · por cada foto ................ ${ms(perPhoto)} (descodificar + sharp + embutir)\n` +
        `     · arranque a frio do módulo ... ${ms(rows[0].cold - rows[0].warm)} (pdf-lib + sharp)`,
    );
  }
  return rows;
}

// ═══════════════════════════════════════════════════════════════════════════
// Diff entre dois ficheiros JSON
// ═══════════════════════════════════════════════════════════════════════════
async function runDiff(spec) {
  const [aPath, bPath] = String(spec).split(",");
  const a = JSON.parse(await fs.readFile(aPath, "utf8"));
  const b = JSON.parse(await fs.readFile(bPath, "utf8"));
  const line = (name, x, y, unit = "ms") => {
    // Uma secção que não foi corrida numa das medições simplesmente não aparece
    // (em vez de imprimir "NaN%", que não diz nada a ninguém).
    if (x == null || y == null || Number.isNaN(x) || Number.isNaN(y)) return;
    const delta = y - x;
    const pct = x ? ((delta / x) * 100).toFixed(1) : "—";
    const arrow = delta < 0 ? "▼" : delta > 0 ? "▲" : "=";
    console.log(
      `   ${name.padEnd(34)} ${String(Math.round(x)).padStart(8)} → ${String(Math.round(y)).padStart(8)} ${unit}  ${arrow} ${pct}%`,
    );
  };
  heading(`ANTES (${aPath})  →  DEPOIS (${bPath})`);
  line(
    "JS no primeiro carregamento",
    a.firstLoad?.jsBytes / 1024,
    b.firstLoad?.jsBytes / 1024,
    "KB",
  );
  line("Responde ao 1.º clique", a.firstLoad?.interactive, b.firstLoad?.interactive);
  line("Bloqueio total (arranque)", a.firstLoad?.totalBlocking, b.firstLoad?.totalBlocking);
  for (const va of a.views ?? []) {
    const vb = (b.views ?? []).find((v) => v.label === va.label);
    if (vb) line(`Vista ${va.label}`, va.total, vb.total);
  }
  for (const pa of a.pdf ?? []) {
    const pb = (b.pdf ?? []).find((p) => p.photos === pa.photos);
    if (pb) line(`PDF com ${pa.photos} fotos`, pa.warm, pb.warm);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Programa principal
// ═══════════════════════════════════════════════════════════════════════════
async function main() {
  if (args.diff) return runDiff(args.diff);

  const { chromium } = await import("playwright");
  const executablePath = findChromium();
  const browser = await chromium.launch({
    executablePath,
    headless: !HEADED,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });

  let server = null;
  let base = args.url ? String(args.url) : null;
  if (!base) {
    const port = await freePort();
    console.log(`A arrancar o servidor de produção na porta ${port}…`);
    server = await startServer(port);
    base = server.base;
  }
  console.log(`Servidor: ${base}`);
  console.log(`Chromium: ${executablePath ?? "(resolvido pelo Playwright)"}`);
  console.log(`Repetições: ${RUNS}   CPU: ${CPU_THROTTLE}×   Volume: ${VOLUME}`);

  const report = { at: new Date().toISOString(), base, runs: RUNS };
  try {
    const cookies = await loginCookies(base);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
    // Uma única autenticação no browser, reutilizada por todos os contextos —
    // senão a limitação de tentativas do /api/admin/login corta a medição a meio.
    await captureSession(browser, base);

    if (!SKIP.has("admin")) {
      report.firstLoad = await measureFirstLoad(browser, base, "dados de origem");
    }
    if (!SKIP.has("vistas")) {
      report.views = await measureViewSwitches(browser, base, "dados de origem");
    }
    if (report.firstLoad && report.views) {
      report.longTasks = reportLongTasks(report.firstLoad, report.views, "dados de origem");
    }

    if (!SKIP.has("volume") && VOLUME > 0) {
      heading(`4. COM VOLUME REAL — ${VOLUME} pedidos, propostas e faturas`);
      console.log(
        `   ATENÇÃO: esta secção substitui os ficheiros em\n` +
          `   ${DATA_DIR}\n` +
          `   e repõe-nos no fim (incluindo depois de uma interrupção). Confirme que\n` +
          `   é a pasta que espera — use --root=<cópia> para medir fora do projeto.`,
      );
      report.volume = await withVolume(VOLUME, async () => {
        const v = {};
        v.api = await measureApiLatency(base, cookieHeader);
        v.firstLoad = await measureFirstLoad(browser, base, `${VOLUME} pedidos`);
        v.views = await measureViewSwitches(browser, base, `${VOLUME} pedidos`);
        v.longTasks = reportLongTasks(v.firstLoad, v.views, `${VOLUME} pedidos`);
        return v;
      });
    }

    if (!SKIP.has("volume") && VOLUME === 0) {
      heading("4. COM VOLUME REAL — não corrida");
      console.log(
        "   Esta secção escreve em data/*.json, por isso é preciso pedi-la:\n" +
          "     node scripts/bench-back-office.mjs --volume=300 --root=<cópia do projeto>\n" +
          "   Sem --volume, a medição não escreve nada em lado nenhum.",
      );
    }

    if (!SKIP.has("publico")) {
      report.publicDesktop = await measurePublic(browser, base, "desktop", 1);
      report.publicMobile = await measurePublic(browser, base, "mobile", 4);
    }

    if (!SKIP.has("pdf")) {
      const quotes = JSON.parse(await fs.readFile(path.join(DATA_DIR, "quotes.json"), "utf8"));
      if (quotes[0]?.id) {
        report.pdf = await measurePdf(base, cookieHeader, quotes[0].id);
      } else {
        console.log("   Sem pedidos em data/quotes.json — a saltar o PDF.");
      }
    }

    if (args.json) {
      await fs.writeFile(String(args.json), JSON.stringify(report, null, 2));
      console.log(`\nNúmeros em bruto gravados em ${args.json}`);
    }
  } finally {
    await browser.close();
    if (server) {
      server.child.kill("SIGTERM");
      await sleep(500);
      server.child.kill("SIGKILL");
    }
  }
}

main().catch((err) => {
  console.error("\nA medição falhou:", err);
  process.exitCode = 1;
});
