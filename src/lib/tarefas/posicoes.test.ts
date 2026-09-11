import { describe, expect, it } from "vitest";
import { ESPACO, ordemGuardada, posicoesDepoisDeMover } from "./posicoes";

/**
 * O que estes casos guardam, por ordem de importância:
 *
 *  1. que largar uma linha entre duas custa UMA gravação — é a razão de o
 *     campo ser um número e não um índice;
 *  2. que a lista guardada é sempre a lista que se vê, mesmo quando o caminho
 *     barato não serve (nenhuma posição, posições trocadas, espaço esgotado);
 *  3. e que o resultado é ESTÁVEL: gravar, reler e ordenar devolve a mesma
 *     ordem — sem isto, a ordem que ela arruma desfaz-se ao recarregar, que é
 *     o defeito que este ficheiro existe para não ter.
 */

/** Um mapa de posições, no formato que a função pede. */
const mapa = (pares: Record<string, number | undefined>) => (id: string) => pares[id];

describe("as posições da ordem manual", () => {
  /* Os casos daqui para baixo escrevem 1024, 2048 e 3072 à mão, porque um
     teste que recalcula o que está a provar não prova nada. O preço é que se
     alguém mexer no `ESPACO` eles passam a mentir em silêncio — e é isso que
     esta linha impede: falha aqui, uma vez, com o número novo à frente, em vez
     de falhar em vinte sítios sem dizer porquê. */
  it("o degrau é o que os casos abaixo assumem que ele é", () => {
    expect(ESPACO).toBe(1024);
  });

  it("a primeira arrumação numera a lista de raiz, com degraus de 1024", () => {
    const escritas = posicoesDepoisDeMover(["c", "a", "b"], mapa({}), "c");
    expect(escritas).toEqual([
      { id: "c", posicao: 1024 },
      { id: "a", posicao: 2048 },
      { id: "b", posicao: 3072 },
    ]);
  });

  it("com a lista já numerada, largar entre duas custa UMA gravação", () => {
    // A ordem nova é a, c, b — o «c» veio do fim para o meio.
    const escritas = posicoesDepoisDeMover(
      ["a", "c", "b"],
      mapa({ a: 1024, b: 2048, c: 3072 }),
      "c",
    );
    expect(escritas).toEqual([{ id: "c", posicao: 1536 }]);
  });

  it("para o topo, fica um degrau à frente da primeira", () => {
    const escritas = posicoesDepoisDeMover(
      ["c", "a", "b"],
      mapa({ a: 2048, b: 3072, c: 4096 }),
      "c",
    );
    expect(escritas).toEqual([{ id: "c", posicao: 1024 }]);
  });

  it("para o topo com a primeira encostada ao zero, fica a meio caminho", () => {
    const escritas = posicoesDepoisDeMover(["b", "a"], mapa({ a: 512, b: 4096 }), "b");
    expect(escritas).toEqual([{ id: "b", posicao: 256 }]);
  });

  it("para o fim, fica um degrau depois da última", () => {
    const escritas = posicoesDepoisDeMover(
      ["a", "b", "c"],
      mapa({ a: 1024, b: 2048, c: 512 }),
      "c",
    );
    expect(escritas).toEqual([{ id: "c", posicao: 3072 }]);
  });

  it("quando o espaço entre as vizinhas se esgota, renumera a lista toda", () => {
    // Duas posições a um milionésimo uma da outra: a média já não as distingue
    // com folga nenhuma, e o caminho barato deixa de ser de confiança.
    const escritas = posicoesDepoisDeMover(
      ["a", "c", "b"],
      mapa({ a: 1024, b: 1024.000001, c: 5000 }),
      "c",
    );
    // O «a» já estava no 1024, que é o número que a escada de raiz lhe dá:
    // fica de fora, e o que se grava são só as duas que mudam mesmo.
    expect(escritas).toEqual([
      { id: "c", posicao: 1024 * 2 },
      { id: "b", posicao: 1024 * 3 },
    ]);
  });

  it("uma lista onde falta uma posição renumera-se, em vez de gravar uma média a torto", () => {
    const escritas = posicoesDepoisDeMover(
      ["a", "c", "b"],
      mapa({ a: 1024, b: undefined, c: 3072 }),
      "c",
    );
    expect(escritas.map((e) => e.id)).toEqual(["c", "b"]);
    expect(escritas).toEqual([
      { id: "c", posicao: 2048 },
      { id: "b", posicao: 3072 },
    ]);
  });

  it("renumerar não regrava quem já está no número certo", () => {
    const escritas = posicoesDepoisDeMover(
      ["a", "b", "c"],
      mapa({ a: 1024, b: 2048, c: undefined }),
      "c",
    );
    expect(escritas).toEqual([{ id: "c", posicao: 3072 }]);
  });

  it("largar uma tarefa no sítio onde já está não grava nada", () => {
    const escritas = posicoesDepoisDeMover(
      ["a", "b", "c"],
      mapa({ a: 1024, b: 2048, c: 3072 }),
      "b",
    );
    expect(escritas).toEqual([]);
  });

  it("uma tarefa que não está na ordem não manda gravar nada", () => {
    expect(posicoesDepoisDeMover(["a", "b"], mapa({ a: 1024, b: 2048 }), "z")).toEqual([]);
  });

  it("a ordem sobrevive a uma volta completa: gravar, reler, ordenar", () => {
    const tarefas = [
      { id: "a", posicao: 1024 },
      { id: "b", posicao: 2048 },
      { id: "c", posicao: 3072 },
    ];
    const nova = ["a", "c", "b"];
    for (const escrita of posicoesDepoisDeMover(nova, mapa({ a: 1024, b: 2048, c: 3072 }), "c")) {
      tarefas.find((t) => t.id === escrita.id)!.posicao = escrita.posicao;
    }
    expect(ordemGuardada(tarefas)).toEqual(nova);
  });
});

describe("a ordem guardada", () => {
  it("põe quem nunca foi arrumada no topo, como o `ordenarTarefas` faz", () => {
    expect(
      ordemGuardada([
        { id: "velha", posicao: 1024 },
        { id: "nova" },
        { id: "outra-velha", posicao: 512 },
      ]),
    ).toEqual(["nova", "outra-velha", "velha"]);
  });

  it("uma lista sem posições nenhumas fica pela ordem que entrou", () => {
    expect(ordemGuardada([{ id: "a" }, { id: "b" }])).toEqual(["a", "b"]);
  });
});
