import { describe, it, expect } from "vitest";
import {
  aplicarFila,
  fechoPendente,
  juntarAFila,
  resolverConflito,
  lerFila,
  escreverFila,
  type MarcacaoPendente,
} from "./material-offline";

/**
 * A fila é o que separa "sem rede" de "perdi as marcações".
 *
 * Duas horas numa quinta são quarenta marcações. Estes testes prendem as duas
 * coisas que as perdem: a fila crescer sem controlo até estoirar a quota, e um
 * conflito resolvido pelo relógio errado.
 */

const marca = (over: Partial<MarcacaoPendente> = {}): MarcacaoPendente => ({
  id: "m1",
  eventId: "e1",
  itemId: "escadote",
  accao: "loaded",
  markedAt: "2026-09-12T08:00:00.000Z",
  actor: "Catarina",
  ...over,
});

describe("juntarAFila", () => {
  it("marcar e desmarcar o mesmo item deixa só a última", () => {
    // Sem isto, marcar e desmarcar cinco vezes enchia a fila com dez entradas
    // e o servidor recebia as duas respostas à mesma pergunta.
    let fila: MarcacaoPendente[] = [];
    fila = juntarAFila(fila, marca({ id: "a", accao: "loaded" }));
    fila = juntarAFila(fila, marca({ id: "b", accao: "unloaded" }));
    fila = juntarAFila(fila, marca({ id: "c", accao: "loaded" }));
    expect(fila).toHaveLength(1);
    expect(fila[0].id).toBe("c");
  });

  it("itens diferentes não se atropelam", () => {
    let fila: MarcacaoPendente[] = [];
    fila = juntarAFila(fila, marca({ id: "a", itemId: "escadote" }));
    fila = juntarAFila(fila, marca({ id: "b", itemId: "extensao" }));
    expect(fila).toHaveLength(2);
  });

  it("notas e consumos ACUMULAM — cada um diz uma coisa diferente", () => {
    // Substituir uma nota pela seguinte perdia "só levámos 2 extensões".
    let fila: MarcacaoPendente[] = [];
    fila = juntarAFila(fila, marca({ id: "a", accao: "note", valor: "faltava uma" }));
    fila = juntarAFila(fila, marca({ id: "b", accao: "note", valor: "a terceira está partida" }));
    expect(fila).toHaveLength(2);
  });
});

describe("resolverConflito", () => {
  it("ganha quem marcou mais tarde, pelo relógio de QUEM MARCOU", () => {
    // O telemóvel pode estar offline há uma hora: a marcação dele é mais
    // ANTIGA do que a de quem marcou agora, mesmo chegando ao servidor depois.
    const local = marca({ markedAt: "2026-09-12T08:00:00.000Z" });
    expect(resolverConflito(local, { markedAt: "2026-09-12T09:00:00.000Z" })).toMatchObject({
      ganha: "servidor",
    });
    expect(resolverConflito(local, { markedAt: "2026-09-12T07:00:00.000Z" })).toMatchObject({
      ganha: "local",
    });
  });

  it("a marcação que perde fica registada, não desaparece", () => {
    const local = marca({ markedAt: "2026-09-12T07:00:00.000Z" });
    const r = resolverConflito(local, { markedAt: "2026-09-12T09:00:00.000Z" });
    expect(r.perdida).toBe(local);
  });

  it("sem nada no servidor, o local ganha", () => {
    expect(resolverConflito(marca(), null)).toMatchObject({ ganha: "local" });
  });
});

describe("armazenamento", () => {
  it("um armazenamento avariado não rebenta o ecrã", () => {
    // Modo privado, quota cheia: continua-se a trabalhar, só sem fila.
    const partido = {
      getItem: () => {
        throw new Error("sem acesso");
      },
      setItem: () => {
        throw new Error("sem espaço");
      },
    };
    expect(lerFila(partido)).toEqual([]);
    expect(() => escreverFila(partido, [marca()])).not.toThrow();
  });

  it("lixo guardado não vira uma fila inventada", () => {
    expect(lerFila({ getItem: () => "isto não é json" })).toEqual([]);
    expect(lerFila({ getItem: () => '{"nao":"array"}' })).toEqual([]);
  });

  it("dá a volta completa", () => {
    const guardado: Record<string, string> = {};
    const store = {
      getItem: (k: string) => guardado[k] ?? null,
      setItem: (k: string, v: string) => {
        guardado[k] = v;
      },
    };
    escreverFila(store, [marca({ id: "x" })]);
    expect(lerFila(store)).toHaveLength(1);
    expect(lerFila(store)[0].id).toBe("x");
  });
});

describe("aplicarFila", () => {
  const item = (id: string, loadedAt?: string) => ({ id, loadedAt });

  it("uma marcação por enviar sobrevive à resposta do servidor", () => {
    // O defeito que isto fixa: marcar enquanto o primeiro pedido ia a caminho,
    // e a resposta dele — que ainda não sabia da marcação — apagá-la do ecrã.
    // Numa quinta com rede lenta é exactamente quando acontece.
    const doServidor = [item("i1"), item("i2")];
    const fila = [marca({ itemId: "i1", accao: "loaded", markedAt: "2026-09-12T08:00:00.000Z" })];
    const out = aplicarFila(doServidor, fila, "e1");
    expect(out[0].loadedAt).toBe("2026-09-12T08:00:00.000Z");
    expect(out[1].loadedAt).toBeUndefined();
  });

  it("desmarcar por enviar também vence o servidor", () => {
    const doServidor = [item("i1", "2026-09-12T07:00:00.000Z")];
    const fila = [marca({ itemId: "i1", accao: "unloaded", markedAt: "2026-09-12T08:00:00.000Z" })];
    expect(aplicarFila(doServidor, fila, "e1")[0].loadedAt).toBeUndefined();
  });

  it("com várias na fila, fica a última", () => {
    const fila = [
      marca({ id: "b", itemId: "i1", accao: "unloaded", markedAt: "2026-09-12T09:00:00.000Z" }),
      marca({ id: "a", itemId: "i1", accao: "loaded", markedAt: "2026-09-12T08:00:00.000Z" }),
    ];
    expect(aplicarFila([item("i1")], fila, "e1")[0].loadedAt).toBeUndefined();
  });

  it("a fila de OUTRO evento não se mete nesta", () => {
    const fila = [marca({ itemId: "i1", eventId: "outro" })];
    expect(aplicarFila([item("i1")], fila, "e1")[0].loadedAt).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FECHO DO CARREGAMENTO VIAJA NA MESMA FILA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Dar por carregada» é o último gesto do carregamento — e portanto o mais
 * provável de apanhar uma quinta sem rede: é o que se faz já com tudo lá
 * dentro, ao portão. Por isso vai na fila como tudo o resto, em vez de exigir
 * ligação.
 *
 * Não é sobre nenhuma linha: leva `itemId` vazio. É essa diferença que estes
 * testes guardam, dos dois lados — que ele não se meta nas linhas, e que as
 * linhas não o escondam.
 */
const fecho = (over: Partial<MarcacaoPendente> = {}): MarcacaoPendente =>
  marca({ id: "f1", itemId: "", accao: "fechado", valor: "carregada", ...over });

describe("o fecho do carregamento", () => {
  it("não toca em linha nenhuma", () => {
    const itens = [
      { id: "escadote", loadedAt: undefined as string | undefined },
      { id: "", loadedAt: undefined as string | undefined },
    ];
    const out = aplicarFila(itens, [fecho()], "e1");
    expect(out[0].loadedAt).toBeUndefined();
    // Nem sequer numa linha com id vazio, que é o caso que a filtragem por
    // `itemId` sozinha deixaria passar.
    expect(out[1].loadedAt).toBeUndefined();
  });

  it("fechar e reabrir deixa UMA entrada, e é a última", () => {
    let fila: MarcacaoPendente[] = [];
    fila = juntarAFila(fila, fecho({ id: "a", valor: "carregada" }));
    fila = juntarAFila(fila, fecho({ id: "b", valor: "preparada" }));
    fila = juntarAFila(fila, fecho({ id: "c", valor: "carregada" }));
    expect(fila).toHaveLength(1);
    expect(fila[0].valor).toBe("carregada");
  });

  it("convive com as marcações das linhas sem as substituir", () => {
    let fila: MarcacaoPendente[] = [];
    fila = juntarAFila(fila, marca({ id: "a", itemId: "escadote", accao: "loaded" }));
    fila = juntarAFila(fila, fecho({ id: "f" }));
    expect(fila).toHaveLength(2);
  });

  it("`fechoPendente` devolve o último pelo relógio de quem marcou", () => {
    const fila = [
      fecho({ id: "b", valor: "preparada", markedAt: "2026-09-12T09:00:00.000Z" }),
      fecho({ id: "a", valor: "carregada", markedAt: "2026-09-12T08:00:00.000Z" }),
    ];
    expect(fechoPendente(fila, "e1")?.valor).toBe("preparada");
  });

  it("sem fecho na fila, não inventa nenhum", () => {
    expect(fechoPendente([marca()], "e1")).toBeNull();
  });

  it("o fecho de OUTRO evento não fecha este", () => {
    expect(fechoPendente([fecho({ eventId: "outro" })], "e1")).toBeNull();
  });
});
