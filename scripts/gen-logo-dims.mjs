import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
const SRC = path.join(process.cwd(), "public", "logos", "clientes");
const OUT = path.join(process.cwd(), "src", "lib", "logo-dims.json");
const EXT = new Set([".avif", ".png", ".jpg", ".jpeg"]);
const files = (await fs.readdir(SRC)).filter((f) => EXT.has(path.extname(f).toLowerCase())).sort();
const map = {};
// [largura, altura, densidade]. A densidade é a «tinta» do logótipo: a média da
// opacidade dentro da caixa (0–1). Um logótipo de traço fino com muito espaço
// por dentro (José de Mello, o Convento) tem pouca; um de letra grossa
// (Deloitte, EDIA) tem muita. É ela que deixa `logoHeight` acertar o PESO À
// VISTA e não só a área da caixa — ver src/lib/logo.ts.
for (const f of files) {
  try {
    const { data, info } = await sharp(path.join(SRC, f))
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let soma = 0;
    for (let i = 3; i < data.length; i += 4) soma += data[i];
    const dens = soma / 255 / (info.width * info.height);
    map[`/logos/clientes/${f}`] = [info.width, info.height, Math.round(dens * 1000) / 1000];
  } catch (e) {
    console.warn("skip", f, e.message);
  }
}
await fs.writeFile(OUT, JSON.stringify(map) + "\n");
console.log("logo-dims:", Object.keys(map).length);
