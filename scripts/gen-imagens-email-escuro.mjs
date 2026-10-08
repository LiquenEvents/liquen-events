#!/usr/bin/env node
/**
 * As imagens do email que tinham de servir nos DOIS modos (achado n.º 28 da
 * auditoria): no modo escuro, o logótipo aparecia numa placa branca e os
 * ícones das redes, pretos, sumiam no fundo preto.
 *
 * Não se desenha nada de novo — trabalha-se sobre os ficheiros que já existem:
 *
 *   · o LOGÓTIPO perde a placa branca: o corpo das letras e da árvore fica
 *     opaco e com a cor de sempre, e só a orla (o anti-serrilhado contra o
 *     branco) passa a transparência. Em fundo branco fica como sempre; em
 *     fundo escuro deixa de haver placa, sem fio claro à volta;
 *   · os ÍCONES mantêm a forma (o canal alfa) e trocam o preto pelo cinzento
 *     #6e6e73 da carta dela — o tom que ela já dá às legendas dos ícones —,
 *     que tem contraste de sobra nos dois fundos (4,9:1 no branco, 4,2:1 no
 *     preto; o mínimo para gráficos é 3:1).
 *
 * Corre-se UMA vez sobre os originais (que ficam no histórico do git):
 *   node scripts/gen-imagens-email-escuro.mjs
 * e o `email-logo.ts` regenera-se a partir do logótipo novo (o comentário dele
 * explica porquê é uma constante).
 */
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = join(dirname(fileURLToPath(import.meta.url)), "..");
const pasta = join(raiz, "public", "email");

// ── O logótipo ──────────────────────────────────────────────────────────────
/**
 * A partir de onde um píxel é «corpo» (letras, árvore) e não orla. Medido no
 * ficheiro: o verde-sálvia do corpo afasta-se ~0,59 do branco, o dourado ~0,82,
 * e o anti-serrilhado fica abaixo de 0,5.
 *
 * Porquê não a «cor para transparência» pura: tornava semi-transparentes as
 * cores CLARAS do desenho (o sálvia da árvore e do «EVENTS»), que no fundo
 * escuro ficavam quase pretas. Assim o corpo fica opaco e com a cor de sempre,
 * e cada píxel da orla toma a cor do corpo mais próximo, com a transparência
 * exacta que, POSTA SOBRE BRANCO, dá o píxel de antes.
 */
const CORPO = 0.5;
{
  const ficheiro = join(pasta, "logo-liquen-email.png");
  const { data, info } = await sharp(ficheiro)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width: L, height: A } = info;
  const n = L * A;
  const afastamento = (p) =>
    Math.max(255 - data[p * 4], 255 - data[p * 4 + 1], 255 - data[p * 4 + 2]) / 255;

  // A cor do corpo mais próximo de cada píxel — busca em largura a partir de
  // todos os píxeis do corpo ao mesmo tempo.
  const origem = new Int32Array(n).fill(-1);
  const fila = [];
  for (let p = 0; p < n; p++) {
    if (afastamento(p) >= CORPO) {
      origem[p] = p;
      fila.push(p);
    }
  }
  for (let q = 0; q < fila.length; q++) {
    const p = fila[q];
    const x = p % L;
    const y = (p - x) / L;
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= L || ny >= A) continue;
      const v = ny * L + nx;
      if (origem[v] !== -1) continue;
      origem[v] = origem[p];
      fila.push(v);
    }
  }

  const saida = Buffer.alloc(n * 4);
  for (let p = 0; p < n; p++) {
    const a = afastamento(p);
    if (a === 0) continue; // fundo: transparente
    if (a >= CORPO) {
      saida[p * 4] = data[p * 4];
      saida[p * 4 + 1] = data[p * 4 + 1];
      saida[p * 4 + 2] = data[p * 4 + 2];
      saida[p * 4 + 3] = 255;
      continue;
    }
    const k = origem[p];
    // α tal que k·α + branco·(1−α) = o, pelo canal que mais se afasta.
    let alfa = 0;
    for (let c = 0; c < 3; c++) {
      const tinta = data[k * 4 + c];
      if (tinta < 250) alfa = Math.max(alfa, (255 - data[p * 4 + c]) / (255 - tinta));
    }
    saida[p * 4] = data[k * 4];
    saida[p * 4 + 1] = data[k * 4 + 1];
    saida[p * 4 + 2] = data[k * 4 + 2];
    saida[p * 4 + 3] = Math.round(Math.min(1, alfa) * 255);
  }
  const png = await sharp(saida, { raw: { width: L, height: A, channels: 4 } })
    .png({ compressionLevel: 9, palette: true, colors: 128 })
    .toBuffer();
  writeFileSync(ficheiro, png);
  console.log(`logótipo: ${png.length} bytes`);
}

// ── Os ícones das redes ─────────────────────────────────────────────────────
const CINZA = [0x6e, 0x6e, 0x73];
for (const nome of ["social-facebook.png", "social-instagram.png", "social-linkedin.png"]) {
  const ficheiro = join(pasta, nome);
  const { data, info } = await sharp(readFileSync(ficheiro))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  for (let i = 0; i < data.length; i += 4) {
    data[i] = CINZA[0];
    data[i + 1] = CINZA[1];
    data[i + 2] = CINZA[2];
  }
  const png = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(ficheiro, png);
  console.log(`${nome}: ${png.length} bytes`);
}
