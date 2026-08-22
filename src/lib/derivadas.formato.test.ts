import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS DERIVADAS SAEM TODAS NO MESMO FORMATO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do briefing da biblioteca: «AVIF e WebP com fallback».
 *
 * Um WebP com a mesma qualidade percebida pesa 25 a 35% menos do que um JPEG
 * mozjpeg — nas 100 imagens que a lista de temas puxa, a diferença entre
 * ~0,9 MB e ~0,6 MB. E não precisa de fallback: é suportado por todos os
 * navegadores desde 2020, Safari incluído desde o iOS 14.
 *
 * ── O QUE ISTO GUARDA, E PORQUÊ NÃO SE PODE VER A OLHO ──────────────────
 *
 * Há CINCO sítios que fabricam ou carregam uma derivada. Se um deles codificar
 * num formato e anunciar outro no cabeçalho, o navegador desenha um ícone
 * partido — e só naquele caminho, que pode ser o menos percorrido dos cinco.
 * Um cabeçalho que mente sobre uma imagem é dos defeitos mais caros de
 * encontrar a olho.
 */

const fonte = (nome: string) =>
  readFileSync(fileURLToPath(new URL(`./${nome}`, import.meta.url)), "utf8");

describe("o formato das derivadas", () => {
  it("nenhuma derivada sai em JPEG", () => {
    const s = fonte("derivadas.ts");
    // CONTROLO POSITIVO: sem isto, um ficheiro que deixasse de codificar
    // imagens passava sem provar nada.
    expect(s, "derivadas.ts deixou de codificar?").toMatch(/\.webp\(\{/);
    expect(
      [...s.matchAll(/\.jpeg\(\{[^)]*\)/g)].map((m) => m[0]),
      "Uma derivada em JPEG ao lado das outras em WebP: metade da biblioteca " +
        "fica a pesar mais, e ninguém dá por isso.",
    ).toEqual([]);
  });

  it("e nenhuma se anuncia como JPEG", () => {
    const s = fonte("derivadas.ts");
    expect(
      [...s.matchAll(/opcoesDeCarregamento\("image\/jpeg"/g)].map((m) => m[0]),
      "Um cabeçalho `image/jpeg` sobre bytes WebP é como o navegador acaba a " +
        "desenhar um ícone partido.",
    ).toEqual([]);
  });

  /**
   * A QUALIDADE DO WEBP NÃO É A MESMA ESCALA DO JPEG.
   *
   * Um WebP q75 tem a qualidade percebida de um JPEG q80 e pesa menos. Passar
   * os 78/65/80 do JPEG cá para dentro dava ficheiros maiores do que o
   * necessário — que é o contrário disto.
   */
  it("a qualidade leva o desconto da escala, e nunca cai abaixo do chão", () => {
    const s = fonte("derivadas.ts");
    expect(s).toContain("desconto: 5");
    expect(s, "um chão de qualidade evita que uma micro de q65 caia a q40").toContain(
      "Math.max(40,",
    );
  });
});
