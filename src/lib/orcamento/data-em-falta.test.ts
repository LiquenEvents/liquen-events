import { describe, expect, it } from "vitest";
import type { Quote, QuoteStatus } from "./types";
import { faltaADataDoEvento, ESTADOS_QUE_EXIGEM_DATA } from "./data-em-falta";

/**
 * F-15 da auditoria. O que este ficheiro guarda não é «avisa quando não há
 * data» — é a FRONTEIRA, que é a parte que se parte sozinha:
 *
 *   · avisar cedo de mais põe uma etiqueta em quase todos os pedidos novos, e
 *     uma etiqueta que está em todo o lado deixa de se ver;
 *   · avisar tarde de menos cala-se exactamente no «aceite», que é o estado em
 *     que a falta passa a custar dinheiro.
 */

const pedido = (date: string | null, status: QuoteStatus) =>
  ({ date, status }) as Pick<Quote, "date" | "status">;

describe("um pedido que anda para a frente sem data", () => {
  it("avisa quando a proposta já seguiu", () => {
    expect(faltaADataDoEvento(pedido(null, "cotado"))).toBe(true);
  });

  it("avisa TAMBÉM quando já foi ganho — é aí que custa dinheiro", () => {
    // A produção nasce ao ganhar e não há dia onde a pendurar. Se o aviso
    // parasse no «cotado», desaparecia no pior momento.
    expect(faltaADataDoEvento(pedido(null, "aceite"))).toBe(true);
  });

  it("cala-se num pedido acabado de chegar — ainda é cedo", () => {
    expect(faltaADataDoEvento(pedido(null, "pendente"))).toBe(false);
    expect(faltaADataDoEvento(pedido(null, "em_revisao"))).toBe(false);
  });

  it("cala-se num pedido perdido — acabou", () => {
    expect(faltaADataDoEvento(pedido(null, "rejeitado"))).toBe(false);
  });

  it("não se deixa enganar por um campo com espaços", () => {
    // O campo é texto gravado de um `<input type="date">`. Uma cadeia de
    // espaços existe e não marca dia nenhum.
    expect(faltaADataDoEvento(pedido("   ", "cotado"))).toBe(true);
    expect(faltaADataDoEvento(pedido("", "cotado"))).toBe(true);
  });

  it("cala-se quando há data, em qualquer estado", () => {
    for (const s of ["pendente", "em_revisao", "cotado", "aceite", "rejeitado"] as QuoteStatus[]) {
      expect(faltaADataDoEvento(pedido("2027-06-12", s)), `estado ${s}`).toBe(false);
    }
  });

  it("a lista de estados que exigem data não cresce sem alguém decidir", () => {
    // Acrescentar `pendente` aqui é a maneira fácil de estragar isto — e é
    // silenciosa: nenhum outro teste cai.
    expect([...ESTADOS_QUE_EXIGEM_DATA].sort()).toEqual(["aceite", "cotado"]);
  });
});
