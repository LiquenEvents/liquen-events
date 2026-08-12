import { test, expect, type CDPSession, type Page } from "@playwright/test";
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MEDIÇÃO DO CARREGAMENTO — a mesma régua para o antes e para o depois
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso real: 49 fotografias de casamento, 4–10 MB cada, com 6 concluídas ao
 * fim de bastante tempo e a barra nos 12%.
 *
 * Este ficheiro não tem `expect`s de valor: NÃO é um teste que passa ou falha,
 * é um instrumento. Escreve o que mediu num JSON e é a partir desse JSON que se
 * escrevem o UPLOAD-BEFORE.md e o UPLOAD-AFTER.md. Um instrumento que falhasse
 * a meio deixava de medir, que é o contrário do que aqui se quer.
 *
 * ── O que se estrangula, e porquê estes números ────────────────────────────
 * «Slow 4G» do Chrome: 1,6 Mbit/s a descer, 750 kbit/s a SUBIR, 150 ms de ida
 * e volta. O que manda aqui é a SUBIDA — é por ela que passam as fotografias —
 * e 750 kbit/s é o que uma rede de escritório dá quando alguém está a fazer
 * uma chamada de vídeo ao lado. CPU a 1/4 porque o computador dela não é este.
 *
 * ── Porque é que o Storage é de mentira ────────────────────────────────────
 * Ver `scripts/supabase-de-teste.mjs`. Em duas palavras: sem ele a rota
 * responde 503 antes de sair um byte, e a latência do Storage verdadeiro
 * variaria entre as duas corridas e tornaria a comparação inútil.
 */

const FOTOS = process.env.MEDICAO_FOTOS ?? "e2e/fotos-de-teste";
const SAIDA = "e2e/medicoes";

/** Chrome «Slow 4G». Em bytes por segundo, que é o que o CDP quer. */
const REDE = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};
const CPU = 4;

interface Medicao {
  etiqueta: string;
  fotos: number;
  bytesNoDisco: number;
  /** Bytes que saíram MESMO do navegador (corpos dos pedidos de escrita). */
  bytesEnviados: number;
  /** Quanto do que saiu foi para uma função da aplicação vs directo ao Storage. */
  bytesParaFuncao: number;
  bytesParaStorage: number;
  msTotal: number;
  msPrimeiraCelulaComConteudo: number | null;
  msPorFoto: number[];
  concorrenciaMaxima: number;
  pedidosDeEscrita: number;
  longTasks: { quantas: number; msTotal: number; msMaior: number };
  nosNoDom: { antes: number; durante: number; depois: number };
  contasDoStorage: unknown;
}

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await page.getByLabel(/O teu email/i).fill("catarina@liquen-events.com");
  await page.locator('input[name="password"]').fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar com palavra-passe$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 15000,
    });
    return true;
  } catch {
    return false;
  }
}

/** Abre a Biblioteca de Temas e entra num tema novo, só deste teste. */
async function abrirTemaNovo(page: Page, nome: string): Promise<void> {
  await page.goto("/orcamento/admin");
  await page.evaluate(() => localStorage.setItem("liquen-admin-view", "temas"));
  await page.goto("/orcamento/admin");
  // A vista dos temas ou está vazia (e oferece «Criar tema» no lugar do vazio)
  // ou já tem cartões (e oferece «Novo tema» no cabeçalho). As duas abrem o
  // mesmo formulário — por isso aceita-se qualquer uma.
  await page
    .getByRole("button", { name: /^(Novo tema|Criar tema)$/ })
    .first()
    .click({ timeout: 20000 });
  // O rótulo traz um asterisco de campo obrigatório («Nome do tema*»), por isso
  // não pode ser `exact`.
  await page
    .getByLabel(/Nome do tema/)
    .first()
    .fill(nome);
  await page
    .getByRole("button", { name: /^Criar tema$/ })
    .first()
    .click();
  // Criar um tema ENTRA nele — não é preciso abrir o cartão a seguir.
  await expect(page.getByRole("button", { name: /Adicionar fotos/ })).toBeVisible({
    timeout: 20000,
  });
}

/** Liga os medidores dentro da página: long tasks e primeira célula com imagem. */
async function instrumentar(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as {
      __longTasks: number[];
      __t0: number;
      __primeiraCelula: number | null;
    };
    w.__longTasks = [];
    w.__primeiraCelula = null;

    // ── OS BYTES QUE SAEM MESMO ────────────────────────────────────────────
    //
    // Contados AQUI, e não do lado do Playwright, porque o Playwright não
    // guarda o corpo de um `multipart` com ficheiros grandes: `postDataBuffer()`
    // devolve `null` e a medição dava zero — foi o que deu à primeira.
    //
    // Somam-se os tamanhos dos `Blob` que vão no corpo. Fica de fora o cabeçalho
    // do multipart (algumas centenas de bytes por parte), que é ruído ao lado de
    // uma fotografia. Não se copia nada: lê-se `.size`, que já é conhecido.
    const pesar = (corpo: unknown): number => {
      if (!corpo) return 0;
      if (corpo instanceof Blob) return corpo.size;
      if (typeof FormData !== "undefined" && corpo instanceof FormData) {
        let n = 0;
        for (const [, v] of corpo.entries()) n += v instanceof Blob ? v.size : String(v).length;
        return n;
      }
      if (typeof corpo === "string") return corpo.length;
      if (corpo instanceof ArrayBuffer) return corpo.byteLength;
      return 0;
    };
    const wb = window as unknown as { __bytes: { url: string; n: number }[] };
    wb.__bytes = [];
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = (entrada: RequestInfo | URL, init?: RequestInit) => {
      try {
        const url =
          typeof entrada === "string"
            ? entrada
            : entrada instanceof URL
              ? entrada.href
              : entrada.url;
        const metodo = (init?.method ?? (entrada instanceof Request ? entrada.method : "GET"))
          .toString()
          .toUpperCase();
        if (metodo === "POST" || metodo === "PUT") {
          const n = pesar(init?.body);
          if (n > 0) wb.__bytes.push({ url, n });
        }
      } catch {
        /* medir nunca pode partir o que se está a medir */
      }
      return fetchOriginal(entrada as RequestInfo, init);
    };

    try {
      new PerformanceObserver((lista) => {
        for (const e of lista.getEntries()) w.__longTasks.push(e.duration);
      }).observe({ entryTypes: ["longtask"] });
    } catch {
      /* sem suporte a longtask — o relatório di-lo */
    }
  });
}

async function medir(
  page: Page,
  cdp: CDPSession,
  etiqueta: string,
  ficheiros: string[],
  bytesNoDisco: number,
): Promise<Medicao> {
  // ── Contadores de rede, do lado do Playwright ──
  //
  // Contam-se os CORPOS DOS PEDIDOS de escrita, que é o que sobe pelo canal
  // estreito. O que desce (as miniaturas que voltam) não é o problema deste
  // percurso e mediria outra coisa.
  let bytesParaFuncao = 0;
  let bytesParaStorage = 0;
  let pedidosDeEscrita = 0;
  let emVoo = 0;
  let concorrenciaMaxima = 0;
  const acabouEm = new Map<string, number>();
  const comecouEm = new Map<string, number>();
  const duracoes: number[] = [];

  const ehEscrita = (metodo: string) => metodo === "POST" || metodo === "PUT";

  const aoPedir = (req: import("@playwright/test").Request) => {
    const url = req.url();
    if (!ehEscrita(req.method())) return;
    const paraStorage = url.includes(":54321");
    const paraUpload = url.includes("/api/temas/") && url.includes("/imagens");
    if (!paraStorage && !paraUpload) return;
    pedidosDeEscrita += 1;
    emVoo += 1;
    concorrenciaMaxima = Math.max(concorrenciaMaxima, emVoo);
    comecouEm.set(req.url() + pedidosDeEscrita, Date.now());
    (req as unknown as { __id: string }).__id = url + pedidosDeEscrita;
  };
  const aoResponder = (req: import("@playwright/test").Request) => {
    if (!ehEscrita(req.method())) return;
    const url = req.url();
    if (!url.includes(":54321") && !(url.includes("/api/temas/") && url.includes("/imagens")))
      return;
    emVoo = Math.max(0, emVoo - 1);
    const id = (req as unknown as { __id?: string }).__id;
    const t0 = id ? comecouEm.get(id) : undefined;
    if (t0) duracoes.push(Date.now() - t0);
    acabouEm.set(url, Date.now());
  };

  page.on("request", aoPedir);
  page.on("requestfinished", aoResponder);
  page.on("requestfailed", aoResponder);

  const nosNoDom = { antes: 0, durante: 0, depois: 0 };
  nosNoDom.antes = await page.evaluate(() => document.querySelectorAll("*").length);

  // ── Estrangular só agora ──
  // A ligação e o CPU ficam normais até aqui de propósito: o que se quer medir
  // é o carregamento, não o tempo de entrar no back office.
  await cdp.send("Network.emulateNetworkConditions", REDE);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: CPU });

  const t0 = Date.now();
  await page.evaluate(() => {
    const w = window as unknown as { __t0: number; __primeiraCelula: number | null };
    w.__t0 = performance.now();
    w.__primeiraCelula = null;
    // A primeira célula da grelha com IMAGEM verdadeira (não o esqueleto) — é
    // o número que responde a «quanto tempo até eu ver alguma coisa?».
    const obs = new MutationObserver(() => {
      if (w.__primeiraCelula !== null) return;
      const img = document.querySelector<HTMLImageElement>("main img[src]");
      if (img) w.__primeiraCelula = performance.now() - w.__t0;
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });

  await page.setInputFiles('input[type="file"]', ficheiros);

  // Enquanto sobe, uma amostra do DOM a meio.
  await page.waitForTimeout(8000);
  nosNoDom.durante = await page.evaluate(() => document.querySelectorAll("*").length);

  // ── Esperar pelo fim ──
  // O fim é a barra de progresso desaparecer. Tecto generoso: o «antes» é
  // exactamente o caso que demora de mais, e cortá-lo mediria o corte.
  await expect(page.getByRole("progressbar", { name: /Progresso do carregamento/i })).toBeHidden({
    timeout: 40 * 60_000,
  });
  const msTotal = Date.now() - t0;

  nosNoDom.depois = await page.evaluate(() => document.querySelectorAll("*").length);
  const dentro = await page.evaluate(() => {
    const w = window as unknown as {
      __longTasks: number[];
      __primeiraCelula: number | null;
      __bytes: { url: string; n: number }[];
    };
    return {
      longTasks: w.__longTasks ?? [],
      primeiraCelula: w.__primeiraCelula,
      bytes: w.__bytes ?? [],
    };
  });
  for (const { url, n } of dentro.bytes) {
    if (url.includes(":54321")) bytesParaStorage += n;
    else if (url.includes("/api/temas/") && url.includes("/imagens")) bytesParaFuncao += n;
  }

  await cdp.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: -1,
    uploadThroughput: -1,
    latency: 0,
  });
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 });

  page.off("request", aoPedir);
  page.off("requestfinished", aoResponder);
  page.off("requestfailed", aoResponder);

  const contas = await (await fetch("http://localhost:54321/__contas")).json();

  return {
    etiqueta,
    fotos: ficheiros.length,
    bytesNoDisco,
    bytesEnviados: bytesParaFuncao + bytesParaStorage,
    bytesParaFuncao,
    bytesParaStorage,
    msTotal,
    msPrimeiraCelulaComConteudo: dentro.primeiraCelula,
    msPorFoto: duracoes,
    concorrenciaMaxima,
    pedidosDeEscrita,
    longTasks: {
      quantas: dentro.longTasks.length,
      msTotal: Math.round(dentro.longTasks.reduce((a, b) => a + b, 0)),
      msMaior: Math.round(Math.max(0, ...dentro.longTasks)),
    },
    nosNoDom,
    contasDoStorage: contas,
  };
}

test("mede o carregamento de 49 fotografias @medicao", async ({ page, browser }) => {
  test.setTimeout(60 * 60_000);
  const etiqueta = process.env.MEDICAO_ETIQUETA ?? "antes";

  await instrumentar(page);
  const entrou = await login(page);
  expect(entrou, "o back office abriu").toBe(true);

  const nomes = (await readdir(FOTOS)).filter((f) => f.endsWith(".jpg")).sort();
  const ficheiros = nomes.map((n) => join(FOTOS, n));
  const resumo = JSON.parse(await readFile(join(FOTOS, "resumo.json"), "utf8"));

  await fetch("http://localhost:54321/__reset", { method: "POST" });
  await abrirTemaNovo(page, `Medição ${etiqueta} ${Date.now().toString(36)}`);

  const cdp = (await browser.newBrowserCDPSession)
    ? await page.context().newCDPSession(page)
    : await page.context().newCDPSession(page);

  const m = await medir(page, cdp, etiqueta, ficheiros, resumo.bytesTotais);

  await mkdir(SAIDA, { recursive: true });
  await writeFile(join(SAIDA, `${etiqueta}.json`), JSON.stringify(m, null, 2));

  console.log("\n===== MEDIÇÃO =====");
  console.log(JSON.stringify(m, null, 2));
});
