/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GERA AS PEÇAS PARA STORIES E PUBLICAÇÕES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/gen-criativos.mjs [url-base]
 *
 * Sai em /meta-ads/criativos/, prontas a carregar no Gestor de Anúncios ou a
 * publicar à mão:
 *
 *   <variante>-<gancho>-916.jpg   1080x1920   Reels e Stories
 *   <variante>-<gancho>-45.jpg    1080x1350   feed
 *
 * ── PORQUE É QUE ISTO EXISTE ───────────────────────────────────────────────
 * /meta-ads/criativos.md descreve dez conceitos com guião, texto e
 * especificações. Descrever não é ter: sem ficheiros, a campanha não arranca.
 * Isto produz as peças ESTÁTICAS a partir do que já existe — as fotografias
 * dela e os ganchos do catálogo. Os conceitos com movimento continuam a
 * precisar de filmagem, e continuam marcados como tal nesse documento.
 *
 * ── PORQUE É QUE DESENHA NO BROWSER E NÃO COM O `sharp` ───────────────────
 * Por causa da tipografia. As peças têm de sair na Inter e na Playfair, que
 * são as faces da marca, e essas chegam pelo `next/font` — não há ficheiro
 * `.ttf` nenhum no repositório para o `sharp` embutir. Esta máquina só tem
 * DejaVu e FreeSans, e uma peça de marca desenhada em DejaVu não é uma peça
 * de marca.
 *
 * Por isso abre-se uma página REAL do sítio (que já traz as `@font-face`
 * certas), substitui-se o corpo pelo desenho da peça, e fotografa-se. A
 * tipografia sai exactamente igual à do sítio.
 *
 * ── AS ZONAS SEGURAS, QUE SÃO A PARTE QUE TODA A GENTE FALHA ──────────────
 * Num story de 1080x1920 a app do Instagram desenha por cima:
 *   • 250 px no topo    — foto de perfil, nome da conta, "Patrocinado"
 *   • 420 px no fundo   — legenda, botão de acção, "Saiba mais"
 *   • 120 px à direita  — gostos, comentários, partilhas
 *
 * Sobra uma faixa de 1080x1250. TODO o texto vive lá dentro, e o guião
 * desenha as margens a tracejado numa versão `-guia` para se poder conferir.
 */

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const BASE = process.argv.find((a) => a.startsWith("http")) || "http://127.0.0.1:3130";
const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SAIDA = path.join(RAIZ, "meta-ads", "criativos");

/** As zonas que a app tapa, em pixels de uma peça de 1080x1920. */
const SEGURA = { topo: 250, fundo: 420, direita: 120, esquerda: 60 };

const FORMATOS = [
  { id: "916", largura: 1080, altura: 1920, rotulo: "Reels e Stories" },
  // No feed a app não tapa nada por cima da imagem; o texto do anúncio fica
  // POR BAIXO. Por isso a zona segura aqui é só uma margem de composição.
  { id: "45", largura: 1080, altura: 1350, rotulo: "feed" },
];

/**
 * Lê o catálogo por expressão regular, como o guião de medição faz. É TS e
 * não se importa daqui; o que se extrai é pouco e estável.
 */
function lerVariantes() {
  const src = readFileSync(path.join(RAIZ, "src/lib/meta/variantes.ts"), "utf8");
  const blocos = src.split(/^\s{4}slug:\s*"/m).slice(1);
  const out = [];
  for (const bloco of blocos) {
    const slug = /^([a-z0-9-]+)"/.exec(bloco)?.[1];
    if (!slug) continue;
    const capa = /^\s{4}capa:\s*"([^"]+)"/m.exec(bloco)?.[1];
    const soEm = /^\s{4}soEm:\s*"(pt|en)"/m.exec(bloco)?.[1];
    // O bloco `pt:` vai até ao `en:`; dentro dele, os dois ganchos por ordem.
    const idioma = soEm === "en" ? "en" : "pt";
    const inicio = bloco.indexOf(`    ${idioma}: {`);
    const parte = bloco.slice(inicio, inicio + 2600);
    const titulos = [...parte.matchAll(/titulo:\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    const apoios = [...parte.matchAll(/apoio:\s*\n?\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
    if (!capa || titulos.length < 2) continue;
    out.push({
      slug,
      capa,
      idioma,
      ganchos: [
        { id: "a", titulo: titulos[0], apoio: apoios[0] ?? "" },
        { id: "b", titulo: titulos[1], apoio: apoios[1] ?? "" },
      ],
    });
  }
  return out;
}

/** O desenho da peça, em HTML. Corre dentro da página. */
function desenhar({ formato, capaUrl, logoUrl, titulo, apoio, cta, segura, guia }) {
  const eStory = formato.id === "916";
  // No story o texto assenta no fundo da faixa segura; no feed, com margem.
  const fundoDoTexto = eStory ? segura.fundo : 110;
  document.documentElement.style.background = "#0c0e0b";
  document.body.style.cssText = "margin:0;padding:0;overflow:hidden;background:#0c0e0b";
  document.body.innerHTML = `
    <div id="peca" style="
      position:relative;width:${formato.largura}px;height:${formato.altura}px;
      overflow:hidden;background:#0c0e0b;">
      <!-- O ENQUADRAMENTO DO STORY, que não é o mesmo do feed.
           Uma fotografia em paisagem cortada para 9:16 mostra a ALTURA TODA
           (o corte é só nos lados). Nestas fotografias o casamento está na
           metade de baixo do enquadramento — e a metade de baixo do story é
           precisamente a que a app tapa com a legenda e o botão. Resultado
           sem isto: a faixa visível ficava com céu e telhado, e a festa ia
           toda para debaixo da interface.
           A ampliação de 1,32 com origem em baixo puxa o assunto para dentro
           da zona segura. No feed não é preciso: a app não tapa nada. -->
      <img src="${capaUrl}" style="
        position:absolute;inset:0;width:100%;height:100%;object-fit:cover;
        ${eStory ? "transform:scale(1.32);transform-origin:50% 78%;" : ""}" />
      <div style="
        position:absolute;inset:0;
        background:linear-gradient(to top,
          rgba(0,0,0,.88) 0%,
          rgba(0,0,0,.72) ${eStory ? 28 : 34}%,
          rgba(0,0,0,.30) ${eStory ? 55 : 62}%,
          rgba(0,0,0,.10) 100%);"></div>

      <img src="${logoUrl}" style="
        position:absolute;left:${segura.esquerda}px;top:${eStory ? segura.topo : 70}px;
        width:210px;height:auto;" />

      <div style="
        position:absolute;left:${segura.esquerda}px;
        right:${eStory ? segura.direita + segura.esquerda : segura.esquerda}px;
        bottom:${fundoDoTexto}px;">
        <div style="
          font-family:var(--font-inter),system-ui,sans-serif;
          font-weight:700;text-transform:uppercase;
          font-size:${eStory ? 76 : 68}px;line-height:1.04;
          letter-spacing:-0.01em;color:#fff;
          text-shadow:0 2px 24px rgba(0,0,0,.45);">${titulo}</div>
        ${
          apoio
            ? `<div style="
          margin-top:26px;font-family:var(--font-inter),system-ui,sans-serif;
          font-size:${eStory ? 32 : 30}px;line-height:1.42;color:rgba(255,255,255,.88);
          max-width:${eStory ? 820 : 900}px;
          text-shadow:0 2px 18px rgba(0,0,0,.4);">${apoio}</div>`
            : ""
        }
        <div style="
          margin-top:${eStory ? 40 : 36}px;display:inline-block;
          border:2px solid rgba(255,255,255,.85);padding:${eStory ? "20px 40px" : "18px 36px"};
          font-family:var(--font-inter),system-ui,sans-serif;
          font-size:${eStory ? 26 : 24}px;letter-spacing:.22em;text-transform:uppercase;
          color:#fff;">${cta}</div>
      </div>

      ${
        guia
          ? `<div style="position:absolute;inset:0;pointer-events:none">
        <div style="position:absolute;left:0;right:0;top:0;height:${segura.topo}px;
          background:rgba(255,0,0,.18);border-bottom:2px dashed rgba(255,80,80,.9)"></div>
        <div style="position:absolute;left:0;right:0;bottom:0;height:${segura.fundo}px;
          background:rgba(255,0,0,.18);border-top:2px dashed rgba(255,80,80,.9)"></div>
        <div style="position:absolute;top:0;bottom:0;right:0;width:${segura.direita}px;
          background:rgba(255,0,0,.18);border-left:2px dashed rgba(255,80,80,.9)"></div>
      </div>`
          : ""
      }
    </div>`;
}

async function main() {
  mkdirSync(SAIDA, { recursive: true });
  const variantes = lerVariantes();
  if (variantes.length === 0) {
    console.error("Não consegui ler o catálogo de variantes.");
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  let escritas = 0;

  for (const v of variantes) {
    const cta = v.idioma === "en" ? "Message us" : "Falar connosco";
    for (const g of v.ganchos) {
      for (const formato of FORMATOS) {
        // O guia com as zonas tapadas sai SÓ para o primeiro par, e é para
        // conferir o enquadramento — não para publicar.
        const comGuia = v.slug === variantes[0].slug && g.id === "a";
        for (const guia of comGuia ? [false, true] : [false]) {
          const contexto = await browser.newContext({
            viewport: { width: formato.largura, height: formato.altura },
            deviceScaleFactor: 1,
          });
          const pagina = await contexto.newPage();
          // Uma página REAL do sítio: é ela que traz as @font-face da marca.
          await pagina.goto(`${BASE}/s/${v.slug}`, { waitUntil: "load", timeout: 60000 });
          // ESPERAR PELA HIDRATAÇÃO ANTES DE ESCREVER. Sem isto, o React monta
          // depois do nosso `innerHTML` e apaga o desenho todo — e o sintoma é
          // o guião ficar à espera de um `#peca` que existiu durante meio
          // segundo. Aconteceu, e só em algumas das peças, que é o pior modo
          // de falhar.
          await pagina.waitForTimeout(1500);
          await pagina.evaluate(desenhar, {
            formato,
            capaUrl: BASE + encodeURI(v.capa),
            logoUrl: `${BASE}/logo-liquen-branco.png`,
            titulo: g.titulo,
            apoio: g.apoio,
            cta,
            segura: SEGURA,
            guia,
          });
          // Espera pelas fontes E pela fotografia — sem isto sai texto no
          // recurso do sistema e um rectângulo preto no lugar da imagem.
          await pagina.evaluate(async () => {
            await document.fonts.ready;
            const img = document.querySelector("#peca img");
            if (img && !img.complete) await img.decode().catch(() => {});
          });
          await pagina.waitForTimeout(400);

          const nome = `${v.slug}-${g.id}-${formato.id}${guia ? "-guia" : ""}.jpg`;
          await pagina.locator("#peca").screenshot({
            path: path.join(SAIDA, nome),
            type: "jpeg",
            quality: 88,
          });
          console.log(`${nome}  ${formato.largura}x${formato.altura}  (${formato.rotulo})`);
          escritas++;
          await contexto.close();
        }
      }
    }
  }

  await browser.close();
  console.log(`\n${escritas} peças em meta-ads/criativos/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
