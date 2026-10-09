import "server-only";
import sharp from "sharp";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS CINCO CORES DA PROPOSTA — tiradas das fotografias de inspiração
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O documento dela: «Cinco cores extraídas automaticamente das fotografias de
 * inspiração dessa proposta (quantização das imagens, descartando os tons
 * quase pretos e quase brancos e as cores demasiado parecidas entre si)».
 *
 * Como se faz:
 *   1. cada fotografia é reduzida a 48 × 48 pixéis (chega para a cor e custa
 *      milissegundos), e juntam-se os pixéis de todas;
 *   2. descartam-se os quase pretos e os quase brancos;
 *   3. «corte pela mediana»: a caixa de cores com mais pixéis parte-se ao meio
 *      pelo canal onde varia mais, até haver dezasseis caixas; a cor de cada
 *      caixa é a média dos seus pixéis;
 *   4. das dezasseis, ficam as cinco com mais pixéis que não sejam parecidas
 *      com uma já escolhida;
 *   5. ordenam-se da mais clara para a mais escura, como no exemplo.
 *
 * Não há sorteio em lado nenhum: as mesmas fotografias dão sempre as mesmas
 * cinco cores, e a proposta reenviada não muda de paleta.
 */

type Rgb = readonly [number, number, number];

const LADO = 48;
const CAIXAS = 16;
const QUANTAS = 5;

/** Luminância percebida, de 0 a 255. */
const luz = ([r, g, b]: Rgb) => 0.299 * r + 0.587 * g + 0.114 * b;

/** Distância entre duas cores (euclidiana pesada pelo olho). */
const distancia = (a: Rgb, b: Rgb) =>
  Math.sqrt(2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2);

/** As cores, em `#RRGGBB`, da mais clara para a mais escura. Vazio se não houver fotos. */
export async function paletaDasFotos(fotos: readonly Buffer[]): Promise<string[]> {
  const pixeis: Rgb[] = [];
  for (const b of fotos) {
    try {
      const { data } = await sharp(b, { failOn: "none" })
        .rotate()
        .resize(LADO, LADO, { fit: "cover" })
        .removeAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });
      for (let i = 0; i + 2 < data.length; i += 3) {
        const c: Rgb = [data[i], data[i + 1], data[i + 2]];
        const l = luz(c);
        if (l > 22 && l < 240) pixeis.push(c);
      }
    } catch {
      // Uma foto que não se lê não tem cor para dar; as outras chegam.
    }
  }
  return escolher(pixeis);
}

/** O corte pela mediana e a escolha — separado para se poder testar sem imagens. */
export function escolher(pixeis: readonly Rgb[]): string[] {
  if (!pixeis.length) return [];
  let caixas: Rgb[][] = [[...pixeis]];
  while (caixas.length < CAIXAS) {
    // Parte-se a caixa mais povoada que ainda tenha mais de um pixel.
    caixas.sort((a, b) => b.length - a.length);
    const maior = caixas[0];
    if (maior.length < 2) break;
    // Sem `Math.max(...lista)`: com setenta fotografias são 160 mil pixéis, e
    // espalhá-los como argumentos rebenta a pilha.
    const amp = (c: 0 | 1 | 2) => {
      let lo = 255;
      let hi = 0;
      for (const p of maior) {
        if (p[c] < lo) lo = p[c];
        if (p[c] > hi) hi = p[c];
      }
      return hi - lo;
    };
    const canal = ([1, 2] as const).reduce<0 | 1 | 2>((m, k) => (amp(k) > amp(m) ? k : m), 0);
    const ordenada = [...maior].sort((a, b) => a[canal] - b[canal]);
    const meio = Math.floor(ordenada.length / 2);
    caixas = [ordenada.slice(0, meio), ordenada.slice(meio), ...caixas.slice(1)];
  }
  const cores = caixas
    .filter((c) => c.length)
    .map((c) => ({
      cor: [0, 1, 2].map((k) =>
        Math.round(c.reduce((s, p) => s + p[k], 0) / c.length),
      ) as unknown as Rgb,
      peso: c.length,
    }))
    .sort((a, b) => b.peso - a.peso);

  const escolhidas: Rgb[] = [];
  for (const { cor } of cores) {
    if (escolhidas.every((e) => distancia(e, cor) > 60)) escolhidas.push(cor);
    if (escolhidas.length === QUANTAS) break;
  }
  return escolhidas
    .sort((a, b) => luz(b) - luz(a))
    .map(
      (c) =>
        `#${c
          .map((v) => v.toString(16).padStart(2, "0"))
          .join("")
          .toUpperCase()}`,
    );
}
