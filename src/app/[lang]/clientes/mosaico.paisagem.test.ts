import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOSAICO DE "MOMENTOS DOS NOSSOS EVENTOS" SÓ ACEITA FOTOGRAFIAS EM PAISAGEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUÊ. As células do mosaico são largas e baixas, e a imagem entra com
 * `object-cover`. Uma fotografia em retrato metida numa célula dessas não é
 * reduzida — é CORTADA a uma faixa horizontal estreita tirada do meio. O
 * enquadramento desaparece, e o que sobra é quase sempre irreconhecível: um
 * pedaço de parede, um ombro, um borrão. Era exactamente o que se via na célula
 * grande da esquerda.
 *
 * O QUE ACONTECEU. O comentário do `MOSAIC_POOL` afirmava "Landscape event
 * frames" e quatro das catorze fotografias eram retrato, com proporção 0.67:
 * `EW1_1408`, `JOAO_E_PEDRO_1Y1A3439`, `428694133-…` e `JOAO_E_PEDRO_1Y1A3204`.
 * A afirmação estava escrita no código, e ninguém a tinha medido.
 *
 * É a mesma família de defeito que apareceu várias vezes neste projecto: um
 * comentário que descreve uma garantia que não existe. Por isso este teste ABRE
 * OS FICHEIROS e mede-os, em vez de confiar no que está escrito ao lado deles.
 *
 * O LIMIAR. 1.2 — não 1.0. Uma fotografia quadrada também não serve numa célula
 * larga (é cortada na mesma), e uma margem acima de 1.0 evita que alguém
 * acrescente uma "quase quadrada" achando que passa. As fotografias reais deste
 * conjunto andam em 1.5 (3:2, o formato natural de uma máquina), portanto o
 * limiar não aperta nada do que é legítimo.
 */

const PAGINA = join(process.cwd(), "src/app/[lang]/clientes/page.tsx");
const RACIO_MINIMO = 1.2;

/** Os caminhos dentro do `MOSAIC_POOL`, lidos da fonte. */
function fotosDoMosaico(): string[] {
  const fonte = readFileSync(PAGINA, "utf8");
  const bloco = /const MOSAIC_POOL = \[([\s\S]*?)\];/.exec(fonte)?.[1];
  if (!bloco) return [];
  return [...bloco.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("mosaico dos clientes: só fotografias em paisagem", () => {
  const fotos = fotosDoMosaico();

  it("a lista foi mesmo encontrada (não passa por vacuidade)", () => {
    // Se a expressão deixar de casar — alguém renomeia a constante, muda a
    // formatação — o teste abaixo percorreria uma lista vazia e passaria sempre.
    expect(fotos.length).toBeGreaterThanOrEqual(10);
    expect(fotos.every((f) => f.startsWith("/imagens/"))).toBe(true);
  });

  it.each(fotosDoMosaico())("%s é em paisagem", async (caminho) => {
    const ficheiro = join(process.cwd(), "public", caminho);
    const { width, height } = await sharp(ficheiro).metadata();
    expect(width, `${caminho}: sem largura`).toBeTruthy();
    expect(height, `${caminho}: sem altura`).toBeTruthy();
    const racio = width! / height!;
    expect(
      racio,
      `${caminho} tem ${width}x${height} (rácio ${racio.toFixed(2)}). ` +
        "Numa célula larga do mosaico isto é cortado a uma faixa estreita do meio " +
        "e fica irreconhecível. Escolhe uma fotografia em paisagem.",
    ).toBeGreaterThanOrEqual(RACIO_MINIMO);
  });
});
