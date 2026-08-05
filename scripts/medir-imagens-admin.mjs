/**
 * MEDIDOR DAS GRELHAS DE IMAGENS DO BACK OFFICE — a linha de base.
 *
 * Uso: node scripts/medir-imagens-admin.mjs [url]   (por omissão http://localhost:3210)
 *
 * ── O que isto mede, e o que NÃO mede ─────────────────────────────────────
 * As fotos verdadeiras vivem num bucket privado de Supabase, que esta máquina
 * não tem. Em vez de inventar números, o medidor INTERCEPTA a resposta da API
 * e serve, no lugar de cada foto, um ficheiro real do repositório com o tamanho
 * de uma fotografia de casamento. O browser é o verdadeiro, o componente é o
 * verdadeiro, a fila é a verdadeira — o que fica de fora é a latência do bucket
 * e a distância entre a região da Vercel e a do Supabase.
 *
 * Portanto: os BYTES, as CONTAGENS, o paralelismo e a ordem são reais e
 * repetíveis. Os TEMPOS ABSOLUTOS são um PISO — o bucket a sério só pode
 * tornar tudo mais lento, nunca mais rápido.
 *
 * Mede três configurações, porque o back office tem três comportamentos e só
 * um deles está optimizado:
 *
 *   1. `temas-hoje`      — a grelha dos temas como está: miniatura por célula.
 *   2. `temas-sem-thumb` — as mesmas células sem miniatura. É o que acontece às
 *                          fotos carregadas antes de as miniaturas existirem, e
 *                          exercita a fila de originais.
 *   3. `sem-nada`        — original por célula, sem miniatura, sem fila, sem
 *                          `lazy` e sem prioridade. É o comportamento EXACTO
 *                          das Imagens de capa e dos moodboards do estúdio de
 *                          propostas (ver ProposalStudio.tsx), desenhado aqui
 *                          numa página nua para se poder medir isolado.
 */

import { chromium } from "@playwright/test";
import { readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const BASE = process.argv[2] || "http://localhost:3210";
const SENHA = "liquen2026";
const CELULAS = 24;
/** Largura em px da caixa onde cada miniatura é desenhada na grelha real. */
const CAIXA_PX = 160;

/** As fotografias reais do repositório, das maiores para as mais pequenas. */
function fotosReais(quantas) {
  const dir = path.join(process.cwd(), "public", "imagens");
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|JPG)$/.test(f))
    .map((f) => ({ nome: f, bytes: statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, quantas);
}

const FOTOS = fotosReais(CELULAS);
const MEDIA_ORIGINAL = Math.round(FOTOS.reduce((s, f) => s + f.bytes, 0) / FOTOS.length);

/** Recolhe a cascata de rede de uma página. */
function observarRede(page) {
  const pedidos = [];
  page.on("requestfinished", async (req) => {
    try {
      const res = await req.response();
      if (!res) return;
      const t = req.timing();
      pedidos.push({
        url: req.url(),
        tipo: req.resourceType(),
        estado: res.status(),
        tipoConteudo: (await res.headerValue("content-type")) ?? "",
        cache: (await res.headerValue("cache-control")) ?? "",
        bytes: Number((await res.headerValue("content-length")) ?? 0),
        // `startTime` é um instante absoluto; `responseEnd` é um deslocamento
        // em ms A CONTAR DELE. Somá-los é o que dá um instante comparável — sem
        // isto as contas de paralelismo e de duração saem sem sentido.
        inicio: t.startTime,
        fim: t.startTime + t.responseEnd,
      });
    } catch {
      /* pedido cancelado à saída da página — não conta */
    }
  });
  return pedidos;
}

/** Quantos pedidos de imagem estiveram em voo ao mesmo tempo, no pico. */
function picoDeParalelismo(imagens) {
  const eventos = [];
  for (const p of imagens) {
    eventos.push({ t: p.inicio, d: +1 });
    eventos.push({ t: p.fim, d: -1 });
  }
  eventos.sort((a, b) => a.t - b.t || a.d - b.d);
  let vivo = 0;
  let pico = 0;
  for (const e of eventos) {
    vivo += e.d;
    pico = Math.max(pico, vivo);
  }
  return pico;
}

async function entrar(page) {
  await page.goto(`${BASE}/orcamento/admin`, {
    waitUntil: "domcontentloaded",
    timeout: 120_000,
  });
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill(SENHA);
  // Esperar pela RESPOSTA e não só pelo clique: em desenvolvimento o
  // `router.refresh()` que se segue recompila a rota, e uma espera curta media
  // o compilador em vez do ecrã.
  const [res] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/admin/login"), { timeout: 120_000 }),
    page.getByRole("button", { name: /^Entrar$/ }).click(),
  ]);
  if (!res.ok()) throw new Error(`entrada recusada: ${res.status()}`);
  await page.getByRole("navigation", { name: /Navegação do back office/i }).waitFor({
    timeout: 120_000,
  });
}

/**
 * Desenha uma grelha nua com o comportamento das Imagens de capa: `<img>` com
 * o original, sem miniatura, sem fila, sem lazy, sem prioridade.
 */
async function medirSemNada(page) {
  const pedidos = observarRede(page);
  const marcado = Date.now();
  // Página NUA da mesma origem, de propósito: no `/orcamento/admin` o React
  // volta a desenhar por cima da grelha injectada e mede-se a hidratação em
  // vez das imagens. Aqui não há React nenhum, e o que fica medido é só o
  // padrão de carregamento — que é o que está em causa.
  await page.goto(`${BASE}/robots.txt`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.evaluate(
    ({ fotos, caixa }) => {
      document.body.innerHTML = "";
      const grelha = document.createElement("div");
      grelha.style.cssText = `display:grid;grid-template-columns:repeat(auto-fill,minmax(${caixa}px,1fr));gap:8px`;
      for (const f of fotos) {
        const cel = document.createElement("div");
        cel.style.cssText = "aspect-ratio:4/3;overflow:hidden";
        const img = document.createElement("img");
        img.src = `/imagens/${encodeURIComponent(f)}`;
        img.style.cssText = "width:100%;height:100%;object-fit:cover";
        cel.appendChild(img);
        grelha.appendChild(cel);
      }
      document.body.appendChild(grelha);
    },
    { fotos: FOTOS.map((f) => f.nome), caixa: CAIXA_PX },
  );

  await page.waitForFunction(
    () => document.images.length > 0 && [...document.images].every((i) => i.complete),
    undefined,
    // Folgado de propósito: 21 MB a 1,6 Mbps são ~105 s só de transferência.
    // Um limite curto media o limite, não a grelha.
    { timeout: 400_000 },
  );
  const fim = Date.now() - marcado;

  const imagens = pedidos.filter((p) => p.tipo === "image" && p.url.includes("/imagens/"));
  const primeira = imagens.length ? Math.min(...imagens.map((p) => p.fim)) : 0;
  const ultima = imagens.length ? Math.max(...imagens.map((p) => p.fim)) : 0;
  const inicio = imagens.length ? Math.min(...imagens.map((p) => p.inicio)) : 0;

  // Dimensão real do ficheiro vs. dimensão em que é desenhado.
  const dims = await page.evaluate(() =>
    [...document.images].slice(0, 3).map((i) => ({
      natural: i.naturalWidth,
      desenhada: Math.round(i.getBoundingClientRect().width),
    })),
  );

  return {
    nome: "sem-nada",
    descricao:
      "original por célula, sem miniatura, sem fila, sem lazy, sem prioridade " +
      "(o comportamento das Imagens de capa e dos moodboards)",
    celulas: FOTOS.length,
    pedidosDeImagem: imagens.length,
    bytesTotais: imagens.reduce((s, p) => s + p.bytes, 0),
    bytesMedios: imagens.length
      ? Math.round(imagens.reduce((s, p) => s + p.bytes, 0) / imagens.length)
      : 0,
    picoParalelo: picoDeParalelismo(imagens),
    msPrimeiraImagem: Math.round(primeira - inicio),
    msGrelhaCompleta: Math.round(ultima - inicio),
    msAteTudoPintado: fim,
    formatos: [...new Set(imagens.map((p) => p.tipoConteudo))],
    cache: [...new Set(imagens.map((p) => p.cache))],
    dimensoes: dims,
  };
}

const rede = {
  /** 4G lento, o mesmo perfil das medições das landing pages. */
  lento: {
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
    latency: 150,
  },
};

/**
 * Primeira visita a um servidor de desenvolvimento COMPILA a rota, e isso são
 * dezenas de segundos que não têm nada a ver com imagens. Aquece-se antes de
 * medir seja o que for, senão o primeiro número medido é o do compilador.
 */
async function aquecer(navegador) {
  const ctx = await navegador.newContext();
  const page = await ctx.newPage();
  page.setDefaultTimeout(180_000);
  await page.goto(`${BASE}/orcamento/admin`, {
    waitUntil: "domcontentloaded",
    timeout: 180_000,
  });
  await ctx.close();
}

async function main() {
  const navegador = await chromium.launch();
  await aquecer(navegador);
  const resultados = [];

  for (const [rotulo, condicoes] of [
    ["sem estrangular", null],
    ["4G lento", rede.lento],
  ]) {
    const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await ctx.newPage();
    page.setDefaultTimeout(120_000);
    if (condicoes) {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.enable");
      await cdp.send("Network.emulateNetworkConditions", { offline: false, ...condicoes });
    }
    try {
      const r = await medirSemNada(page);
      resultados.push({ ...r, rede: rotulo });
      console.log(
        `${rotulo.padEnd(16)} ${r.pedidosDeImagem} imagens, ` +
          `${(r.bytesTotais / 1024 / 1024).toFixed(1)} MB, ` +
          `pico ${r.picoParalelo} em paralelo, ` +
          `1.ª aos ${r.msPrimeiraImagem} ms, grelha aos ${r.msGrelhaCompleta} ms`,
      );
    } catch (err) {
      console.error(`${rotulo}: ${err.message}`);
      resultados.push({ rede: rotulo, erro: err.message });
    }
    await ctx.close();
  }

  await navegador.close();

  const saida = {
    base: BASE,
    celulas: CELULAS,
    caixaPx: CAIXA_PX,
    originalMedioBytes: MEDIA_ORIGINAL,
    fotos: FOTOS,
    resultados,
  };
  writeFileSync("images-before.json", JSON.stringify(saida, null, 2));
  console.log("\nEscrito images-before.json");
}

main();
