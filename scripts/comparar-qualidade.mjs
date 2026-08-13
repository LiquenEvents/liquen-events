/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A COMPRESSÃO CUSTOU ALGUMA COISA? — SSIM CONTRA O ORIGINAL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *   node scripts/comparar-qualidade.mjs [--amostra N] [--larguras 384,768]
 *
 * Baixar bytes é fácil; baixar bytes SEM SE VER é o trabalho. Este script não
 * pergunta "ficou mais pequeno" — pergunta "ficou diferente", e responde com um
 * número por fotografia.
 *
 * ── O QUE É O SSIM, E PORQUÊ ESTE E NÃO O PSNR ────────────────────────────
 * O PSNR mede o erro médio por píxel, o que castiga igualmente uma diferença
 * que ninguém vê (ruído fino no céu) e uma que salta à vista (um degrau numa
 * transição suave). O SSIM compara ESTRUTURA — luminância, contraste e
 * correlação local em janelas — que é muito mais próximo do que o olho nota.
 *
 * Leitura da escala, para fotografia:
 *   > 0,98  indistinguível em condições normais de visualização
 *   > 0,95  diferença só visível ao alternar as duas imagens no mesmo sítio
 *   < 0,90  visível
 *
 * ── COMO SE COMPARA JUSTAMENTE ────────────────────────────────────────────
 * Cada candidato é comparado com o ORIGINAL reduzido à MESMA largura com o
 * mesmo redimensionador (Lanczos do sharp) e guardado sem perdas. Assim o que
 * está a ser medido é só o custo do CODEC — não o custo de reduzir a
 * fotografia, que qualquer variante paga por igual.
 */

import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";

const arg = (nome, omissao) => {
  const i = process.argv.indexOf(nome);
  return i >= 0 ? process.argv[i + 1] : omissao;
};
const N = Number(arg("--amostra", 12));
const LARGURAS = String(arg("--larguras", "384,768,1024")).split(",").map(Number);

const DIR = "public/imagens";

/** Média, variância e covariância em janelas 8x8 — o SSIM clássico. */
function ssim(a, b, largura, altura) {
  const C1 = (0.01 * 255) ** 2;
  const C2 = (0.03 * 255) ** 2;
  const J = 8;
  let soma = 0;
  let janelas = 0;
  for (let y = 0; y + J <= altura; y += J) {
    for (let x = 0; x + J <= largura; x += J) {
      let mA = 0,
        mB = 0;
      for (let j = 0; j < J; j++) {
        for (let i = 0; i < J; i++) {
          const p = (y + j) * largura + (x + i);
          mA += a[p];
          mB += b[p];
        }
      }
      const n = J * J;
      mA /= n;
      mB /= n;
      let vA = 0,
        vB = 0,
        cov = 0;
      for (let j = 0; j < J; j++) {
        for (let i = 0; i < J; i++) {
          const p = (y + j) * largura + (x + i);
          const dA = a[p] - mA;
          const dB = b[p] - mB;
          vA += dA * dA;
          vB += dB * dB;
          cov += dA * dB;
        }
      }
      vA /= n - 1;
      vB /= n - 1;
      cov /= n - 1;
      soma += ((2 * mA * mB + C1) * (2 * cov + C2)) / ((mA * mA + mB * mB + C1) * (vA + vB + C2));
      janelas++;
    }
  }
  return janelas ? soma / janelas : 0;
}

/** Cinzentos crus de um buffer, à largura pedida. */
async function cinzentos(buf) {
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  return { data, largura: info.width, altura: info.height };
}

const VARIANTES = [
  { nome: "webp q65 (o que havia)", enc: (s) => s.webp({ quality: 65 }) },
  { nome: "webp q72", enc: (s) => s.webp({ quality: 72 }) },
  { nome: "webp q75", enc: (s) => s.webp({ quality: 75 }) },
  { nome: "avif q52 e3 (o novo)", enc: (s) => s.avif({ quality: 52, effort: 3 }) },
  { nome: "avif q60 e3", enc: (s) => s.avif({ quality: 60, effort: 3 }) },
];

const todos = (await fs.readdir(DIR)).filter((f) => /\.(jpe?g|png|webp)$/i.test(f));
const passo = Math.max(1, Math.floor(todos.length / N));
const amostra = Array.from({ length: N }, (_, i) => todos[i * passo]).filter(Boolean);

const acumulado = {};
for (const v of VARIANTES) acumulado[v.nome] = { ssim: 0, bytes: 0, n: 0 };

for (const w of LARGURAS) {
  for (const f of amostra) {
    const input = await fs.readFile(path.join(DIR, f));
    const base = sharp(input).resize(w, null, { withoutEnlargement: true }).toColourspace("srgb");
    // A referência: a MESMA redução, guardada sem perdas.
    const ref = await base.clone().png({ compressionLevel: 0 }).toBuffer();
    const r = await cinzentos(ref);
    for (const v of VARIANTES) {
      const buf = await v.enc(base.clone()).toBuffer();
      const c = await cinzentos(buf);
      if (c.largura !== r.largura || c.altura !== r.altura) continue;
      acumulado[v.nome].ssim += ssim(r.data, c.data, r.largura, r.altura);
      acumulado[v.nome].bytes += buf.length;
      acumulado[v.nome].n++;
    }
  }
}

console.log(`amostra: ${amostra.length} fotos × ${LARGURAS.join("/")} px\n`);
console.log(["variante".padEnd(24), "SSIM".padStart(8), "KB/ficheiro".padStart(13)].join(""));
for (const v of VARIANTES) {
  const a = acumulado[v.nome];
  if (!a.n) continue;
  console.log(
    [
      v.nome.padEnd(24),
      (a.ssim / a.n).toFixed(4).padStart(8),
      (a.bytes / a.n / 1024).toFixed(1).padStart(13),
    ].join(""),
  );
}
