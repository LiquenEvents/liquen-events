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
import sharp from "sharp";
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
 * ═══════════════════════════════════════════════════════════════════════════
 * O LOGÓTIPO, RECORTADO — E PORQUE É QUE ISTO É PRECISO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A dona olhou para as peças e disse: "parece que o logo não está central,
 * parece que está mais para a direita". Estava. E a culpa não era da
 * centragem — era do ficheiro.
 *
 * MEDIDO em public/logo-liquen-branco.png com o `trim` do sharp:
 *
 *     ficheiro                3747 x 2238
 *     tinta (o desenho)       2146 x 1084
 *     transparente à esquerda  866 px
 *     transparente à direita   735 px
 *
 * São 131 px a mais de vazio do lado esquerdo. Ou seja: a CAIXA do ficheiro
 * estava perfeitamente centrada, e o DESENHO lá dentro está 65,5 px à direita
 * do centro dessa caixa — o que, desenhado a 560 px de largura, dá cerca de
 * 10 px de desvio para a direita numa peça de 1080. Perfeitamente visível, e
 * foi o que ela viu.
 *
 * A correcção não é empurrar a imagem 10 px para a esquerda — isso seria um
 * número mágico preso a este ficheiro, que se estraga em silêncio no dia em
 * que alguém exportar o logótipo outra vez. Recorta-se o transparente e
 * usa-se a TINTA: a partir daí o centro do desenho é o centro do elemento,
 * por construção.
 *
 * Efeito lateral, e foi o que obrigou aos dois ajustes seguintes: com o
 * recorte, a largura pedida passa a ser a do DESENHO e já não a da caixa. O
 * mesmo número desenha um logótipo muito maior. Ver LARGURA_LOGO.
 *
 * Vai como `data:` em vez de ficheiro novo em public/: é usado só aqui, e um
 * ficheiro a mais no repositório é mais um sítio onde as duas versões do
 * logótipo podem divergir.
 */
/**
 * A largura a que o DESENHO do logótipo sai, numa peça de 1080.
 *
 * Este número andou às voltas, e a razão foi minha: a meio do percurso ele
 * mudou de significado sem eu dar por isso. Antes do recorte, a largura era a
 * da CAIXA do ficheiro, e o desenho lá dentro ocupava 2146 dos 3747 px — ou
 * seja, 57%. Depois do recorte é o desenho que mede o que aqui se pede.
 *
 * O percurso, convertido tudo para largura de DESENHO, que é a única que se vê:
 *
 *     pedido           caixa   desenho   reacção
 *     210                210       120   "maior"
 *     360                360       206   "bem maior e no meio em cima"
 *     560                560       320   só se queixou da centragem
 *     560 (recortado)      -       560   "mais pequeno um bocadinho"
 *     480                  -       480   "continua muito grande"
 *     340                  -       340
 *
 * A linha que interessa é a terceira: aos 320 de desenho ela olhou para as
 * peças e a única coisa que apontou foi o desvio para a direita. Portanto o
 * tamanho estava aceite, e o salto para 560 foi um acidente do recorte, não
 * um pedido. 340 volta a esse tamanho com uma nudge para cima.
 *
 * Zona segura: 340 numa peça de 1080 deixa 370 px de cada lado.
 */
const LARGURA_LOGO = 340;

async function logoRecortado() {
  const origem = path.join(RAIZ, "public", "logo-liquen-branco.png");
  const buf = await sharp(origem).trim({ threshold: 1 }).png().toBuffer();
  return `data:image/png;base64,${buf.toString("base64")}`;
}

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
function desenhar({ formato, capaUrl, logoUrl, larguraLogo, titulo, apoio, cta, segura, guia }) {
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
      <!-- Um véu leve NO TOPO, só para o logótipo se ler. Sem ele, o logótipo
           branco sobre um céu claro ao entardecer — que é metade destas
           fotografias — ficava lavado, e um logótipo que não se lê é o mesmo
           que não estar lá. Pára antes do meio da peça, portanto não escurece
           a fotografia onde ela interessa. -->
      <div style="
        position:absolute;left:0;right:0;top:0;height:${eStory ? 46 : 40}%;
        background:linear-gradient(to bottom,
          rgba(0,0,0,.42) 0%, rgba(0,0,0,.20) 45%, rgba(0,0,0,0) 100%);"></div>

      <!-- O LOGOTIPO: CENTRADO EM CIMA. A largura vem de LARGURA_LOGO, que
           tem o historico das medidas ao lado dela; aqui chega por parametro
           porque esta funcao corre DENTRO da pagina e nao ve o modulo.
           Centrado com left:50% mais translateX(-50%) e nao com margin:auto,
           porque o elemento e position:absolute.
           (Sem plicas invertidas neste comentario: ele vive DENTRO de um
           template literal, e uma plica invertida aqui fecha-o a meio. Foi o
           que aconteceu a primeira vez.) -->
      <img src="${logoUrl}" style="
        position:absolute;left:50%;transform:translateX(-50%);
        top:${eStory ? segura.topo + 40 : 80}px;
        width:${larguraLogo}px;height:auto;" />

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
  const logoUrl = await logoRecortado();
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
          //
          // ── E TEM DE SER A DO IDIOMA CERTO ──────────────────────────────
          // A variante internacional só é servida em inglês, portanto
          // `/s/portugal` responde 404. Eu navegava para lá na mesma: a
          // fotografia carregava (é um URL absoluto), o desenho fazia-se, e o
          // que faltava eram as fontes — a página de erro não as traz. As
          // quatro peças de `portugal` saíram durante dias com o serifado
          // que o Chromium usa por omissão, e ninguém reparou porque as
          // outras dezoito estavam certas.
          //
          // Verificar o estado da resposta, e não só navegar, é o que impede
          // isto de voltar em silêncio.
          const caminho = v.idioma === "en" ? `/en/s/${v.slug}` : `/s/${v.slug}`;
          const resposta = await pagina.goto(`${BASE}${caminho}`, {
            waitUntil: "load",
            timeout: 60000,
          });
          if (!resposta || !resposta.ok()) {
            throw new Error(
              `${caminho} respondeu ${resposta ? resposta.status() : "nada"}. Sem a página ` +
                "certa não há fontes de marca, e a peça sai com o tipo de letra errado.",
            );
          }
          // ESPERAR PELA HIDRATAÇÃO ANTES DE ESCREVER. Sem isto, o React monta
          // depois do nosso `innerHTML` e apaga o desenho todo — e o sintoma é
          // o guião ficar à espera de um `#peca` que existiu durante meio
          // segundo. Aconteceu, e só em algumas das peças, que é o pior modo
          // de falhar.
          await pagina.waitForTimeout(1500);
          await pagina.evaluate(desenhar, {
            formato,
            capaUrl: BASE + encodeURI(v.capa),
            logoUrl,
            larguraLogo: LARGURA_LOGO,
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
