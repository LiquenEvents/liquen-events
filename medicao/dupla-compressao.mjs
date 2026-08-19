/**
 * A miniatura de 400 px (q78) é reencodada para a célula do PDF (q84).
 * Quanto custa essa segunda compressão, medido contra o caminho directo?
 */
import sharp from "sharp";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "public", "imagens");
const nomes = readdirSync(DIR).filter((f) => /\.jpe?g$/i.test(f)).sort().slice(0, 6);

// Célula típica de mood board: 243×365 px (134,8×202,1 pt a 130 DPI).
const CELULA = { w: 243, h: 365 };

async function paraCaixa(buf, w, h, q = 84) {
  return sharp(buf).rotate().resize(w, h, { fit: "cover", position: "centre" })
    .jpeg({ quality: q, progressive: false, chromaSubsampling: "4:2:0", mozjpeg: false })
    .toBuffer();
}

let somaDif = 0, n = 0;
for (const nome of nomes) {
  const orig = readFileSync(path.join(DIR, nome));
  const meta = await sharp(orig).metadata();
  // caminho A: original → célula
  const directo = await paraCaixa(orig, CELULA.w, CELULA.h);
  // caminho B: original → miniatura 400 q78 → célula
  const thumb = await sharp(orig).rotate().resize(400, 400, { fit: "inside" }).jpeg({ quality: 78 }).toBuffer();
  const tmeta = await sharp(thumb).metadata();
  const cobre = tmeta.width >= CELULA.w && tmeta.height >= CELULA.h;
  const viaThumb = await paraCaixa(thumb, CELULA.w, CELULA.h);
  // diferença média por pixel (0–255) entre os dois resultados
  const a = await sharp(directo).raw().toBuffer();
  const b = await sharp(viaThumb).raw().toBuffer();
  let soma = 0, max = 0;
  for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); soma += d; if (d > max) max = d; }
  const medio = soma / a.length;
  somaDif += medio; n++;
  console.log(
    `${nome.padEnd(28)} original ${meta.width}x${meta.height}  miniatura ${tmeta.width}x${tmeta.height} (${cobre ? "COBRE a célula" : "não cobre"})  ` +
    `directo ${(directo.length/1024).toFixed(1)}KB  via-miniatura ${(viaThumb.length/1024).toFixed(1)}KB  ` +
    `diferença média ${medio.toFixed(2)}/255  máxima ${max}`,
  );
}
console.log(`\nMédia das diferenças: ${(somaDif/n).toFixed(2)}/255 (${(somaDif/n/255*100).toFixed(2)}%)`);
