#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS ÍCONES DO SÍTIO, A PARTIR DO LOGÓTIPO A CORES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A queixa, textual: "quero que o favicon da Líquen seja com muito mais
 * qualidade e quero que seja o colorido e que se veja melhor".
 *
 * As três coisas tinham a mesma causa. O ícone era o LOGÓTIPO COMPLETO —
 * emblema mais "LÍQUEN EVENTS" — encolhido para dentro de um quadrado preto
 * de 256 px. MEDIDO no ficheiro antigo: a tinta ocupava 2,1% da área do
 * quadrado. Aos 16 px de um separador de browser sobravam três píxeis de
 * altura para nove letras, e o que se via era um borrão. Era também a versão
 * a branco sobre preto, e não a de marca.
 *
 * O que este guião faz:
 *
 *   1. Recorta o EMBLEMA (só o líquen) de public/logo-liquen.png. A palavra
 *      não cabe num quadrado de 16 px, e o emblema sozinho é reconhecível —
 *      é a mesma decisão que qualquer marca toma para o ícone.
 *   2. Encontra-o por MEDIÇÃO: varre as linhas com tinta, parte a imagem nos
 *      blocos separados por bandas vazias, e fica com o primeiro. Nada de
 *      coordenadas à mão, que se estragam em silêncio no dia em que alguém
 *      exportar o logótipo outra vez. (A lição é da mesma família da do
 *      logótipo desviado nas peças de anúncio: o número mágico preso a um
 *      ficheiro é o defeito, não a solução.)
 *   3. Escreve os seis ficheiros, cada um com a margem que o seu sítio pede.
 *
 * Correr com `npm run gen:favicons` depois de mudar o logótipo.
 */
import sharp from "sharp";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORIGEM = path.join(RAIZ, "public", "logo-liquen.png");

/**
 * O fundo dos ícones.
 *
 * Branco, e não o preto de antes, por duas razões medidas e não de gosto:
 *
 *   • o emblema de marca é verde #5F7C66, que sobre preto tem um contraste de
 *     2,2:1 — abaixo do mínimo de qualquer critério de legibilidade. Sobre
 *     branco tem 4,6:1.
 *   • o separador do Chrome e o cartão de sítio que ela fotografou são
 *     ESCUROS. Um ícone de fundo preto desaparece lá dentro; um de fundo
 *     claro recorta-se contra ele.
 *
 * É também o `background_color` que o manifest.ts já declara, portanto o
 * ecrã de arranque da aplicação instalada e o ícone passam a condizer.
 */
const FUNDO = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * Quanto do lado do quadrado é que o emblema ocupa, por tipo de ícone.
 *
 * Os `maskable` do Android são recortados por uma máscara que o fabricante
 * escolhe, e a única zona garantida é o círculo central com 80% do lado. Daí
 * os 0,58: o emblema é mais largo do que alto, e 0,58 de largura deixa a
 * diagonal dentro desse círculo com folga.
 *
 * Os outros vão a 0,86 — o máximo antes de o desenho encostar ao rebordo.
 * MEDIDO: a tinta passa a ocupar 16,6% do quadrado, contra os 2,1% do ícone
 * antigo. Oito vezes mais desenho no mesmo espaço.
 */
const OCUPACAO = { normal: 0.86, maskable: 0.58 };

/**
 * O emblema, recortado à tinta.
 *
 * Devolve um PNG com fundo transparente e sem uma única linha de vazio à
 * volta, para que quem compõe controle a margem toda.
 */
async function emblema() {
  const { data, info } = await sharp(ORIGEM)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: W, height: H, channels: C } = info;

  // "Tinta" é pixel opaco que não é quase-branco. O fundo do ficheiro é
  // branco em parte da área e transparente noutra — as duas condições juntas
  // apanham os dois casos.
  const temTinta = (x, y) => {
    const i = (y * W + x) * C;
    if (data[i + 3] <= 16) return false;
    return !(data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235);
  };

  const linhaTemTinta = new Array(H).fill(false);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (temTinta(x, y)) {
        linhaTemTinta[y] = true;
        break;
      }
    }
  }

  // Partir em blocos separados por bandas de linhas vazias. No logótipo saem
  // três: o emblema, o acento do "Í", e a palavra. O emblema é o primeiro.
  const blocos = [];
  let inicio = -1;
  for (let y = 0; y < H; y++) {
    if (linhaTemTinta[y] && inicio < 0) inicio = y;
    else if (!linhaTemTinta[y] && inicio >= 0) {
      blocos.push([inicio, y - 1]);
      inicio = -1;
    }
  }
  if (inicio >= 0) blocos.push([inicio, H - 1]);
  if (blocos.length < 2) {
    throw new Error(
      `Só encontrei ${blocos.length} bloco(s) em ${ORIGEM}. Esperava pelo menos ` +
        "dois (emblema e palavra). O logótipo mudou de forma — confirmar antes de gerar.",
    );
  }

  const [topo, fundo] = blocos[0];
  let x0 = W;
  let x1 = -1;
  for (let y = topo; y <= fundo; y++) {
    for (let x = 0; x < W; x++) {
      if (temTinta(x, y)) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }

  const largura = x1 - x0 + 1;
  const altura = fundo - topo + 1;
  console.log(`emblema medido: ${largura}x${altura} px em (${x0}, ${topo})`);

  return {
    largura,
    altura,
    png: await sharp(ORIGEM)
      .ensureAlpha()
      .extract({ left: x0, top: topo, width: largura, height: altura })
      .png()
      .toBuffer(),
  };
}

/** Um ícone quadrado de `lado` px, com o emblema centrado. */
async function icone(emb, lado, ocupacao) {
  // O emblema é mais largo do que alto; a ocupação manda na dimensão maior,
  // senão um emblema achatado sairia com margens desiguais.
  const escala = (lado * ocupacao) / Math.max(emb.largura, emb.altura);
  const w = Math.round(emb.largura * escala);
  const h = Math.round(emb.altura * escala);

  let desenho = await sharp(emb.png).resize(w, h, { kernel: "lanczos3", fit: "fill" }).toBuffer();

  // ── ENGROSSAR O TRAÇO, SÓ AOS 16 PX ──────────────────────────────────────
  // O líquen é desenho de linha fina. A 16 px os ramos exteriores caem abaixo
  // de um pixel de espessura e o `lanczos` devolve-os a uns 30% de opacidade:
  // cinzento claro sobre branco, ou seja, nada. Compor a forma deslocada de
  // 1 px devolve-lhes cor cheia.
  //
  // MEDIDO A OLHO, e o resultado corrigiu-me: com os quatro deslocamentos e
  // aplicado também aos 32, o desenho fecha-se e vira uma mancha verde sem
  // ramos — pior do que o problema. Com dois deslocamentos e só aos 16, os
  // ramos ganham corpo e a silhueta aguenta-se. Acima de 16 o traço já tem
  // espessura que chegue e qualquer dilatação só engorda.
  if (lado <= 16) {
    desenho = await sharp({
      create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } },
    })
      .composite([
        { input: desenho, left: 1, top: 0 },
        { input: desenho, left: 0, top: 1 },
        { input: desenho, left: 0, top: 0 },
      ])
      .png()
      .toBuffer();
  }

  let img = sharp({
    create: { width: lado, height: lado, channels: 4, background: FUNDO },
  })
    .composite([
      {
        input: desenho,
        left: Math.round((lado - w) / 2),
        top: Math.round((lado - h) / 2),
      },
    ])
    .png({ compressionLevel: 9 });

  // Nos tamanhos pequenos o lanczos deixa o traço do líquen — que é fino —
  // esbatido. Uma passagem leve de nitidez devolve-lhe o contorno sem criar
  // halos visíveis. Acima de 64 px não é preciso e só acrescentaria ruído.
  if (lado <= 64)
    img = sharp(await img.toBuffer())
      .sharpen({ sigma: 0.6 })
      .png({ compressionLevel: 9 });

  return img.toBuffer();
}

/**
 * Um .ico com vários tamanhos, cada um guardado como PNG.
 *
 * O sharp não escreve .ico, e o formato é simples de mais para justificar uma
 * dependência: cabeçalho de 6 bytes, uma entrada de 16 bytes por tamanho, e a
 * seguir os PNG inteiros. PNG dentro de ICO é suportado por tudo o que hoje
 * abre um sítio (Vista em diante, e todos os browsers actuais).
 */
function empacotarIco(pngs) {
  const n = pngs.length;
  const cabecalho = Buffer.alloc(6);
  cabecalho.writeUInt16LE(0, 0); // reservado
  cabecalho.writeUInt16LE(1, 2); // 1 = ícone
  cabecalho.writeUInt16LE(n, 4);

  const entradas = Buffer.alloc(16 * n);
  let deslocamento = 6 + 16 * n;
  pngs.forEach(({ lado, buf }, i) => {
    const e = 16 * i;
    entradas.writeUInt8(lado >= 256 ? 0 : lado, e + 0); // 0 significa 256
    entradas.writeUInt8(lado >= 256 ? 0 : lado, e + 1);
    entradas.writeUInt8(0, e + 2); // paleta: nenhuma
    entradas.writeUInt8(0, e + 3); // reservado
    entradas.writeUInt16LE(1, e + 4); // planos
    entradas.writeUInt16LE(32, e + 6); // bits por pixel
    entradas.writeUInt32LE(buf.length, e + 8);
    entradas.writeUInt32LE(deslocamento, e + 12);
    deslocamento += buf.length;
  });

  return Buffer.concat([cabecalho, entradas, ...pngs.map((p) => p.buf)]);
}

async function main() {
  const emb = await emblema();

  const destinos = [
    // O `icon.png` do App Router serve o <link rel="icon"> em todos os
    // tamanhos que o browser peça, portanto vale a pena ser grande.
    { caminho: "src/app/icon.png", lado: 512, ocupacao: OCUPACAO.normal },
    // 180 é o que o iOS pede. Sem transparência: o iOS compõe sobre preto e
    // um ícone transparente ficaria com o emblema verde sobre escuro.
    { caminho: "src/app/apple-icon.png", lado: 180, ocupacao: OCUPACAO.normal },
    { caminho: "public/icon-192.png", lado: 192, ocupacao: OCUPACAO.normal },
    { caminho: "public/icon-512.png", lado: 512, ocupacao: OCUPACAO.normal },
    { caminho: "public/icon-maskable-512.png", lado: 512, ocupacao: OCUPACAO.maskable },
  ];

  for (const d of destinos) {
    const buf = await icone(emb, d.lado, d.ocupacao);
    writeFileSync(path.join(RAIZ, d.caminho), buf);
    console.log(
      `${d.caminho.padEnd(32)} ${d.lado}x${d.lado}  ${(buf.length / 1024).toFixed(1)} KB`,
    );
  }

  // 48 além dos clássicos 16 e 32: é o que o Windows usa nos atalhos e o que
  // alguns leitores de feeds pedem. Três tamanhos num ficheiro de poucos KB.
  const LADOS_ICO = [16, 32, 48];
  const pngs = [];
  for (const lado of LADOS_ICO) {
    pngs.push({ lado, buf: await icone(emb, lado, OCUPACAO.normal) });
  }
  const ico = empacotarIco(pngs);
  writeFileSync(path.join(RAIZ, "src/app/favicon.ico"), ico);
  console.log(
    `${"src/app/favicon.ico".padEnd(32)} ${LADOS_ICO.join("/")}  ${(ico.length / 1024).toFixed(1)} KB`,
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
