import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ÍCONES TÊM DE SE VER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ícone anterior era o logótipo inteiro — emblema e as nove letras de
 * "LÍQUEN EVENTS" — encolhido num quadrado preto. Nada nele estava partido: o
 * ficheiro existia, tinha o tamanho certo, o browser mostrava-o. Só que a
 * tinta ocupava 2,1% do quadrado e o que se via no separador era um borrão.
 *
 * É o modo de falhar contra o qual este repositório já tem rede noutros
 * sítios: aquilo que existe, não dá erro, e não serve. Daí um teste que mede
 * o que os olhos veem — quanta tinta há, de que cor, e sobre que fundo — em
 * vez de se limitar a confirmar que os ficheiros lá estão.
 */

const RAIZ = process.cwd();

/** O verde de marca do emblema, medido em public/logo-liquen.png. */
const VERDE = { r: 95, g: 124, b: 102 };

interface Icone {
  caminho: string;
  lado: number;
  /** Percentagem mínima do quadrado que tem de ser desenho. */
  tintaMinima: number;
}

/**
 * Os limiares não são redondos por acaso.
 *
 * Os ícones normais medem 16,6% de tinta; os 12% dão margem para o desenho
 * mudar sem deixarem passar um logótipo perdido no meio do quadrado. O
 * `maskable` mede 7,7% porque o Android recorta-o e obriga a margens largas —
 * o limiar dele é mais baixo pela mesma razão.
 */
const ICONES: Icone[] = [
  { caminho: "src/app/icon.png", lado: 512, tintaMinima: 12 },
  { caminho: "src/app/apple-icon.png", lado: 180, tintaMinima: 12 },
  { caminho: "public/icon-192.png", lado: 192, tintaMinima: 12 },
  { caminho: "public/icon-512.png", lado: 512, tintaMinima: 12 },
  { caminho: "public/icon-maskable-512.png", lado: 512, tintaMinima: 5 },
];

async function analisar(caminho: string) {
  const { data, info } = await sharp(join(RAIZ, caminho))
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;

  const fundo = [data[0], data[1], data[2]];
  let tinta = 0;
  let transparentes = 0;
  let somaR = 0;
  let somaG = 0;
  let somaB = 0;

  for (let i = 0; i < width * height; i++) {
    const p = i * channels;
    if (data[p + 3] < 250) transparentes++;
    const distancia =
      Math.abs(data[p] - fundo[0]) +
      Math.abs(data[p + 1] - fundo[1]) +
      Math.abs(data[p + 2] - fundo[2]);
    if (distancia > 60) {
      tinta++;
      somaR += data[p];
      somaG += data[p + 1];
      somaB += data[p + 2];
    }
  }

  return {
    width,
    height,
    fundo,
    transparentes,
    percentagemTinta: (100 * tinta) / (width * height),
    corMedia: tinta ? { r: somaR / tinta, g: somaG / tinta, b: somaB / tinta } : null,
  };
}

describe("ícones do sítio", () => {
  it.each(ICONES)("$caminho é quadrado e do tamanho declarado", async (ic) => {
    const a = await analisar(ic.caminho);
    expect(a.width).toBe(ic.lado);
    expect(a.height).toBe(ic.lado);
  });

  it.each(ICONES)("$caminho tem desenho que chegue para se ver", async (ic) => {
    const a = await analisar(ic.caminho);
    expect(
      a.percentagemTinta,
      `${ic.caminho}: só ${a.percentagemTinta.toFixed(1)}% do quadrado é desenho. ` +
        "Um ícone com pouca tinta é um borrão a 16 px, que foi exactamente a queixa " +
        "que originou este teste. Correr `npm run gen:favicons`.",
    ).toBeGreaterThanOrEqual(ic.tintaMinima);
  });

  it.each(ICONES)("$caminho é o emblema A CORES, não a versão a branco", async (ic) => {
    const a = await analisar(ic.caminho);
    expect(a.corMedia).not.toBeNull();
    const { r, g, b } = a.corMedia!;
    // Verde: a componente verde domina as outras duas. Um desenho a branco ou
    // a preto tem as três componentes juntas e não passa aqui.
    expect(
      g,
      `${ic.caminho}: a cor média do desenho é rgb(${r.toFixed(0)}, ${g.toFixed(0)}, ${b.toFixed(0)}), ` +
        `que não é o verde de marca rgb(${VERDE.r}, ${VERDE.g}, ${VERDE.b}).`,
    ).toBeGreaterThan(Math.max(r, b) + 8);
  });

  it.each(ICONES)("$caminho é opaco", async (ic) => {
    // O iOS compõe o ícone sobre PRETO. Um emblema verde com fundo
    // transparente ficaria verde sobre preto — 2,2:1 de contraste, ilegível.
    // O mesmo vale para o `maskable`, que o Android compõe sobre a cor do
    // sistema.
    const a = await analisar(ic.caminho);
    expect(a.transparentes, `${ic.caminho} tem ${a.transparentes} píxeis não opacos`).toBe(0);
  });

  it.each(ICONES)("$caminho assenta em fundo claro", async (ic) => {
    // O separador do Chrome e o cartão de sítio do Android são escuros. Um
    // ícone de fundo escuro desaparece lá dentro — era o caso do antigo,
    // rgb(8, 8, 8).
    const a = await analisar(ic.caminho);
    const luminancia = (a.fundo[0] + a.fundo[1] + a.fundo[2]) / 3;
    expect(luminancia, `${ic.caminho}: fundo rgb(${a.fundo.join(", ")})`).toBeGreaterThan(200);
  });

  it("o favicon.ico traz 16, 32 e 48", () => {
    // Sem isto, o browser que só sabe ler .ico fica com o tamanho errado
    // redimensionado por ele — e a redução dele não tem o engrossamento que o
    // gerador faz aos 16 px.
    const buf = readFileSync(join(RAIZ, "src/app/favicon.ico"));
    expect(buf.readUInt16LE(0), "campo reservado do cabeçalho ICO").toBe(0);
    expect(buf.readUInt16LE(2), "tipo: 1 = ícone").toBe(1);
    const n = buf.readUInt16LE(4);
    const lados: number[] = [];
    for (let i = 0; i < n; i++) {
      const e = 6 + 16 * i;
      lados.push(buf.readUInt8(e) || 256);
      const bytes = buf.readUInt32LE(e + 8);
      const inicio = buf.readUInt32LE(e + 12);
      expect(inicio + bytes, "uma entrada aponta para fora do ficheiro").toBeLessThanOrEqual(
        buf.length,
      );
      // Assinatura PNG: os browsers actuais lêem PNG dentro de ICO, e é assim
      // que o gerador os escreve.
      expect(buf.subarray(inicio, inicio + 8).toString("hex")).toBe("89504e470d0a1a0a");
    }
    expect(lados.sort((a, b) => a - b)).toEqual([16, 32, 48]);
  });
});
