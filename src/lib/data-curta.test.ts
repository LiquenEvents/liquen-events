import { describe, expect, it } from "vitest";
import { dataCurta } from "./data-curta";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DATA QUE CHEGAVA AO ECRÃ EM FORMATO DE BASE DE DADOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma auditoria ao back office apanhou a coluna «Data do evento» da tabela de
 * Pedidos a mostrar `2028-08-13`. Era o único sítio da aplicação onde o formato
 * da base chegava à frente de alguém.
 *
 * E, ao juntar as duas cópias que a casa tinha deste formato, apareceu um
 * defeito latente na segunda: fazia `new Date(iso)`, que para uma data sem hora
 * é MEIA-NOITE UTC. É o clássico erro de um dia — não se via em Portugal no
 * horário de verão, e via-se em qualquer sítio a oeste de Greenwich.
 */
describe("a data curta em português", () => {
  it("escreve o mês por palavras, e não o formato da base", () => {
    expect(dataCurta("2028-08-13")).toBe("13 ago 2028");
    expect(dataCurta("2027-05-22")).toBe("22 mai 2027");
  });

  /**
   * O CASO DO DIA A MENOS. Com `new Date("2028-01-01")` o instante é meia-noite
   * UTC; a meio-dia está a doze horas de cada fronteira, e nenhum fuso do mundo
   * o empurra para o dia anterior nem para o seguinte.
   */
  it("não perde um dia por causa do fuso — nem no primeiro de janeiro", () => {
    expect(dataCurta("2028-01-01")).toContain("1 jan 2028");
    expect(dataCurta("2027-12-31")).toContain("31 dez 2027");
  });

  it("sem data, devolve vazio — não «Invalid Date»", () => {
    expect(dataCurta(undefined)).toBe("");
    expect(dataCurta(null)).toBe("");
    expect(dataCurta("")).toBe("");
  });

  it("uma data que não se consegue ler devolve-se tal e qual", () => {
    // Esconder o que lá está impede quem olha de perceber porque é que está
    // estranha — e é a diferença entre um dado mau visível e um dado mau mudo.
    expect(dataCurta("nem-uma-data")).toBe("nem-uma-data");
  });
});
