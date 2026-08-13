/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O SCROLL DA GALERIA, EM VÍDEO — PARA SE VER, NÃO SÓ PARA SE LER
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/video-galeria.mjs [url-base] [pasta-de-saida]
 *
 * Grava uma travessia da galeria nas MESMAS condições da medição (4G lento,
 * CPU 4x, telemóvel e secretária). Uma tabela mostra que os bytes desceram; um
 * vídeo mostra se a fotografia já lá está quando se chega a ela — que é a
 * pergunta a que esta missão tem de responder.
 *
 * Para comparar antes e depois: correr contra dois servidores (dois builds) e
 * pôr os ficheiros lado a lado. Os nomes levam o perfil e o carimbo que se
 * passar na pasta de saída.
 *
 * NOTA HONESTA sobre o que o vídeo é. O Playwright grava a partir do
 * compositor do Chromium, não de um ecrã: a cadência do ficheiro não é a
 * cadência que um telemóvel mostraria. Serve para ver O QUE aparece e QUANDO
 * — buracos, cor lisa, blur, fotografia — e não para contar frames.
 */

import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3000";
const OUT =
  process.argv[3] && !process.argv[3].startsWith("http") ? process.argv[3] : "video-galeria";

const REDE_4G_LENTO = {
  offline: false,
  downloadThroughput: (1.6 * 1024 * 1024) / 8,
  uploadThroughput: (750 * 1024) / 8,
  latency: 150,
};

const PERFIS = [
  { nome: "telemovel", ctx: { ...devices["Pixel 7"], deviceScaleFactor: 3 } },
  { nome: "secretaria", ctx: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 } },
];

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch();

for (const perfil of PERFIS) {
  const pasta = `${OUT}/${perfil.nome}`;
  mkdirSync(pasta, { recursive: true });
  const ctx = await browser.newContext({
    ...perfil.ctx,
    recordVideo: { dir: pasta, size: perfil.ctx.viewport },
  });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send("Network.enable");
  await cdp.send("Network.emulateNetworkConditions", REDE_4G_LENTO);
  await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 });

  await page.goto(`${BASE}/galeria`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  // Um pouco parado no topo: é onde se vê se a primeira janela tem placeholder.
  await page.waitForTimeout(3000);
  // Uma travessia de ~20 ecrãs, à velocidade de quem procura (não de quem lê).
  await page.evaluate(async () => {
    for (let i = 0; i < 20; i++) {
      window.scrollBy(0, window.innerHeight * 0.9);
      await new Promise((r) => setTimeout(r, 400));
    }
  });
  await page.waitForTimeout(1500);
  await ctx.close(); // fecha o contexto para o vídeo ser escrito
  process.stderr.write(`→ ${pasta}/\n`);
}

await browser.close();
