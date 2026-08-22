import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { CACHE_DAS_FOTOS, opcoesDeCarregamento } from "./cache-das-fotos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NENHUM CARREGAMENTO FICA SEM CABEÇALHO DE CACHE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do briefing: «CDN com `Cache-Control: immutable`».
 *
 * Não havia UM `cacheControl` em todo o `src/`, e o Supabase assume uma hora
 * quando ninguém lhe diz outra coisa: abrir a biblioteca de manhã e voltar a
 * abri-la depois do almoço volta a descarregar as 25 capas e as 75 tiras.
 *
 * O que se prende aqui é o que não se pode garantir a olho: que o próximo
 * `upload` que alguém escrever passe pela mesma porta. Um sítio esquecido não
 * dá erro nenhum — dá uma hora de cache, calada.
 */

const ficheiro = (nome: string) =>
  readFileSync(fileURLToPath(new URL(`./${nome}`, import.meta.url)), "utf8");

describe("o cabeçalho de cache das fotografias", () => {
  it("é um número de segundos, e não uma frase", () => {
    // O Supabase transforma este valor no `max-age` do `Cache-Control`. Passar
    // «public, max-age=…» grava a frase inteira dentro do `max-age`, e o
    // resultado é um cabeçalho inválido que os navegadores ignoram — que dá
    // exactamente no mesmo que não ter nenhum.
    expect(CACHE_DAS_FOTOS).toMatch(/^\d+$/);
    expect(Number(CACHE_DAS_FOTOS)).toBeGreaterThanOrEqual(60 * 60 * 24 * 30);
  });

  it("as opções trazem sempre o cache, e o `upsert` é `false` por omissão", () => {
    expect(opcoesDeCarregamento("image/jpeg")).toEqual({
      contentType: "image/jpeg",
      upsert: false,
      cacheControl: CACHE_DAS_FOTOS,
    });
    expect(opcoesDeCarregamento("image/png", true).upsert).toBe(true);
  });

  /**
   * O GUARDA.
   *
   * Se alguém acrescentar um `upload` de fotografia com as opções escritas à
   * mão, isto grita. É o mesmo desenho do guarda que liga a lista de páginas ao
   * gerador do PDF: uma leitura do ficheiro, e uma frase que diz o que fazer.
   */
  it.each(["derivadas.ts", "proposal-storage.ts", "theme-storage.ts"])(
    "%s não escreve opções de carregamento à mão",
    (nome) => {
      const fonte = ficheiro(nome);
      // CONTROLO POSITIVO: sem isto, um ficheiro que deixasse de carregar
      // fotografias passava o teste sem provar nada.
      expect(fonte, `${nome} deixou de carregar fotografias?`).toContain("opcoesDeCarregamento(");
      const aMao = [...fonte.matchAll(/\.upload\([^)]*\{[^}]*contentType/g)];
      expect(
        aMao.map((m) => m[0]),
        `Há um \`upload\` com as opções à mão em ${nome}. Usa \`opcoesDeCarregamento\` — ` +
          `sem ele o ficheiro fica com uma hora de cache, sem ninguém dar por isso.`,
      ).toEqual([]);
    },
  );
});
