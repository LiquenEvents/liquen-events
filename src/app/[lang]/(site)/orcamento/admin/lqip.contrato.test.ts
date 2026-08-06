import { describe, expect, it } from "vitest";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { LQIP_EDGE, LQIP_MAX_CHARS, LQIP_QUALITY, planResize } from "./image-worker";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LQIP CABE MESMO NUMA STRING CURTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A promessa do Pilar 3 é que a fotografia aparece a 0 ms porque viaja DENTRO
 * do JSON que já se estava a buscar. Essa promessa tem um preço, e o preço é
 * bytes: cada linha da resposta passa a levar o LQIP às costas, e a resposta é
 * servida a cada abertura da biblioteca.
 *
 * Se o LQIP crescesse, a "optimização" passava a custar mais do que poupava —
 * e não custava numa imagem, custava em TODAS, a cada abertura. Este ficheiro é
 * o que impede isso de acontecer sem ninguém dar por ela.
 *
 * ── Porque é que isto usa `sharp` e não o browser ──────────────────────────
 * O encode acontece no browser (`OffscreenCanvas.convertToBlob`), e o jsdom não
 * o sabe fazer. O que se mede aqui é a única coisa que interessa e que não
 * depende do encoder: **quantos bytes tem uma fotografia real reduzida a
 * `LQIP_EDGE` px e encodada a `LQIP_QUALITY`**. O WebP do Chromium e o do
 * `sharp` são o mesmo formato com o mesmo alvo de qualidade; a ordem de
 * grandeza é a mesma, e é da ordem de grandeza que o tecto trata.
 *
 * Se um dia o encoder do browser sair muito acima disto, quem o apanha é o
 * `LQIP_MAX_CHARS` em tempo de execução — devolve `null` e a célula fica como
 * está hoje. Nunca uma resposta pesada em silêncio.
 */

const FOTOS = "public/imagens";

/** Uma amostra pequena e ESTÁVEL — ordenada, para o número não dançar entre
 *  execuções e uma regressão de 3× se ver. */
function amostra(n: number): string[] {
  return readdirSync(FOTOS)
    .filter((f) => /\.jpe?g$/i.test(f))
    .sort()
    .slice(0, n);
}

async function lqipDataUri(ficheiro: string): Promise<string> {
  const buf = await sharp(join(FOTOS, ficheiro))
    .rotate()
    .resize({ width: LQIP_EDGE, height: LQIP_EDGE, fit: "inside" })
    .webp({ quality: Math.round(LQIP_QUALITY * 100) })
    .toBuffer();
  return `data:image/webp;base64,${buf.toString("base64")}`;
}

describe("LQIP — a imagem que viaja dentro do JSON", () => {
  it("uma fotografia real cabe MUITO abaixo do tecto, e diz-se por quanto", async () => {
    const ficheiros = amostra(12);
    expect(ficheiros.length, "sem fotografias em public/imagens para medir").toBeGreaterThan(5);

    const tamanhos = await Promise.all(ficheiros.map((f) => lqipDataUri(f).then((u) => u.length)));
    const maior = Math.max(...tamanhos);
    const media = Math.round(tamanhos.reduce((a, b) => a + b, 0) / tamanhos.length);

    expect(
      maior,
      `O maior LQIP de ${ficheiros.length} fotografias reais tem ${maior} caracteres ` +
        `(média ${media}), contra um tecto de ${LQIP_MAX_CHARS}. Se isto falhou, o LQIP ` +
        `deixou de ser barato — e passa a pesar em cada linha de cada resposta.`,
    ).toBeLessThan(LQIP_MAX_CHARS);

    // A margem também importa: um LQIP a roçar o tecto passa a ser recusado em
    // tempo de execução (devolve `null`) numa fotografia mais detalhada, e o
    // efeito seria umas células com placeholder e outras sem, sem razão visível.
    expect(
      maior,
      `Margem curta: ${maior} de ${LQIP_MAX_CHARS}. Uma fotografia mais detalhada passa o tecto ` +
        `e fica sem placeholder nenhum.`,
    ).toBeLessThan(LQIP_MAX_CHARS * 0.7);
  });

  /**
   * O que o LQIP substitui: 20 KB de miniatura que só chegam depois de a rede
   * responder. A relação entre os dois é a razão de tudo isto existir.
   */
  it("é ordens de grandeza mais barato do que a miniatura que substitui", async () => {
    const f = amostra(1)[0];
    const lqip = (await lqipDataUri(f)).length;
    const miniatura = (
      await sharp(join(FOTOS, f))
        .rotate()
        .resize({ width: 400, height: 400, fit: "inside" })
        .jpeg({ quality: 72 })
        .toBuffer()
    ).length;

    expect(
      lqip * 20,
      `LQIP ${lqip} B contra miniatura ${miniatura} B — menos de 20× de diferença deixa de ` +
        `justificar inline.`,
    ).toBeLessThan(miniatura);
  });

  it("16 px é do LADO MAIOR, e a proporção mantém-se", () => {
    // 4:3 de um telemóvel.
    expect(planResize(4032, 3024, LQIP_EDGE)).toEqual({ w: 16, h: 12 });
    // Vertical, que é a orientação da maioria da biblioteca dela.
    expect(planResize(3024, 4032, LQIP_EDGE)).toEqual({ w: 12, h: 16 });
    // Uma foto já minúscula não é AMPLIADA — seria inventar pixéis para nada.
    expect(planResize(10, 8, LQIP_EDGE)).toEqual({ w: 10, h: 8 });
  });
});
