import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O SERVICE WORKER ESCREVE NO DISCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `public/sw.js` guarda as miniaturas da biblioteca de temas numa chave SEM o
 * token, para reabrir o seletor deixar de custar 1835 ms e 188 KB. Quem decide
 * o que entra nessa cache é uma expressão regular — e é ela que separa
 * "fotografias de inspiração" de "fotografias de um casamento concreto".
 *
 * Errá-la para o lado permissivo escreve no disco de quem trabalha as fotos de
 * uma proposta, ao lado da data e do local do casamento daquele casal. É a
 * mesma linha que o `sw.js` já traça ao recusar guardar `/portal` e
 * `/proposta`; este ficheiro é o que impede que ela se mova sem ninguém dar
 * por isso.
 *
 * Testa o ficheiro REAL: o `sw.js` não é um módulo (usa `self`), por isso as
 * duas funções são extraídas de lá e executadas. Uma cópia das regras aqui
 * podia divergir do que o browser corre, que é precisamente o que não pode
 * acontecer numa decisão de privacidade.
 */

const FONTE = readFileSync("public/sw.js", "utf-8");

function extrair<T>(nome: string): T {
  const inicio = FONTE.indexOf(`function ${nome}(`);
  expect(inicio, `\`${nome}\` desapareceu de public/sw.js`).toBeGreaterThan(-1);
  // Conta chavetas até fechar a função — o corpo tem literais de expressão
  // regular com chavetas dentro, mas nenhum com chavetas desemparelhadas.
  let profundidade = 0;
  let fim = inicio;
  for (let i = FONTE.indexOf("{", inicio); i < FONTE.length; i++) {
    if (FONTE[i] === "{") profundidade++;
    else if (FONTE[i] === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i + 1;
        break;
      }
    }
  }
  return new Function(`${FONTE.slice(inicio, fim)}; return ${nome};`)() as T;
}

const ehFotoDaBiblioteca = extrair<(u: URL) => boolean>("ehFotoDaBiblioteca");
const chaveSemToken = extrair<(u: URL) => string>("chaveSemToken");

const sb = (caminho: string) => new URL(`https://abc.supabase.co${caminho}`);

describe("service worker — o que pode ir para o disco", () => {
  it("guarda as derivadas pequenas da biblioteca de temas", () => {
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg"))).toBe(true);
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-micro/italia/a1.jpg"))).toBe(true);
    // Um bucket público (se a decisão do Pilar 2 for essa) tem outro verbo no
    // caminho e continua a ser a mesma fotografia.
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/public/theme-thumbs/italia/a1.jpg"))).toBe(
      true,
    );
  });

  /**
   * O TESTE QUE INTERESSA. Estas são as fotografias de um casamento concreto.
   */
  it("NUNCA guarda fotografias de uma proposta", () => {
    for (const bucket of ["proposal-assets", "proposal-thumbs"]) {
      expect(
        ehFotoDaBiblioteca(sb(`/storage/v1/object/sign/${bucket}/LIQ-ABC/capa.jpg`)),
        `${bucket} passou o filtro — as fotos de um casal iriam para o disco`,
      ).toBe(false);
    }
  });

  it("não guarda os ORIGINAIS da biblioteca — são ~576 KB cada", () => {
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-assets/italia/a1.jpg"))).toBe(
      false,
    );
  });

  /** Um nome de bucket que só COMEÇA por `theme-` não é um dos dois. */
  it("não se deixa enganar por nomes parecidos", () => {
    for (const p of [
      "/storage/v1/object/sign/theme-thumbs-privado/x/a.jpg",
      "/storage/v1/object/sign/outro/theme-thumbs/a.jpg",
      "/storage/v1/object/sign/theme-micros/x/a.jpg",
      // Sem o prefixo do Storage não é o Storage.
      "/theme-thumbs/italia/a1.jpg",
    ]) {
      expect(ehFotoDaBiblioteca(sb(p)), `${p} passou o filtro`).toBe(false);
    }
  });

  it("só ficheiros de imagem", () => {
    expect(ehFotoDaBiblioteca(sb("/storage/v1/object/sign/theme-thumbs/italia/lista.json"))).toBe(
      false,
    );
  });

  describe("a chave", () => {
    /** É isto, e só isto, que faz o token deixar de partir a cache. */
    it("é o caminho SEM os parâmetros — dois tokens dão a mesma chave", () => {
      const a = sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg?token=AAA");
      const b = sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg?token=BBB&x=1");
      expect(chaveSemToken(a)).toBe(chaveSemToken(b));
      expect(chaveSemToken(a)).toBe(
        "https://abc.supabase.co/storage/v1/object/sign/theme-thumbs/italia/a1.jpg",
      );
    });

    /** Duas fotos diferentes continuam a ser duas entradas. */
    it("não junta fotografias diferentes", () => {
      expect(chaveSemToken(sb("/storage/v1/object/sign/theme-thumbs/italia/a1.jpg"))).not.toBe(
        chaveSemToken(sb("/storage/v1/object/sign/theme-thumbs/italia/a2.jpg")),
      );
    });
  });
});
