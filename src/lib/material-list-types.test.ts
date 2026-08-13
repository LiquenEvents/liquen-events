import { describe, it, expect } from "vitest";
import { quantidadePara, porCadaQuantos } from "./material-list-types";

/**
 * A conta que decide quantos sacos do lixo vão na carrinha.
 *
 * Errá-la por baixo é a única falha que interessa: uma unidade a mais volta na
 * carrinha, uma a menos manda alguém a uma loja no meio de uma quinta.
 */
describe("quantidadePara", () => {
  it("arredonda para CIMA — 120 pessoas a 1 por cada 50 dão 3", () => {
    // Dois sacos deixavam a última meia centena sem saco.
    expect(quantidadePara({ qty: 2, qtyPerPax: 1 / 50 }, 120)).toBe(3);
  });

  it("a quantidade fixa é o MÍNIMO, não o valor a substituir", () => {
    // Num evento de 10 pessoas a conta dá 1, mas dois sacos são precisos só
    // para o lixo da montagem, antes de haver convidados nenhuns.
    expect(quantidadePara({ qty: 2, qtyPerPax: 1 / 50 }, 10)).toBe(2);
  });

  it("sem fração, a quantidade é a fixa — dois panos são dois panos", () => {
    expect(quantidadePara({ qty: 6 }, 300)).toBe(6);
    expect(quantidadePara({ qty: 6, qtyPerPax: 0 }, 300)).toBe(6);
  });

  it("sem número de convidados, não inventa: fica pela quantidade fixa", () => {
    // O pedido pode ter "ainda a definir" no nº de pessoas. Escalar por 0 dava
    // zero sacos, que é pior do que dar os dois de base.
    expect(quantidadePara({ qty: 2, qtyPerPax: 1 / 50 }, 0)).toBe(2);
    expect(quantidadePara({ qty: 2, qtyPerPax: 1 / 50 }, Number.NaN)).toBe(2);
  });

  it("escala mesmo em eventos grandes", () => {
    expect(quantidadePara({ qty: 2, qtyPerPax: 1 / 50 }, 500)).toBe(10);
  });
});

describe("porCadaQuantos", () => {
  it("devolve o N legível a partir da fração, para o ecrã não mostrar 0.02", () => {
    expect(porCadaQuantos(1 / 50)).toBe(50);
    expect(porCadaQuantos(1 / 3)).toBe(3);
  });

  it("sem fração não há N", () => {
    expect(porCadaQuantos(undefined)).toBeNull();
    expect(porCadaQuantos(0)).toBeNull();
  });
});
