import { describe, it, expect } from "vitest";
import type { Quote, QuoteStatus } from "./types";
import { MINIMO_PARA_COMPARAR, foraDoPadrao, padraoPara } from "./padrao-de-preco";

let n = 0;
function pedido(guests: number, preco: number, over: Partial<Quote> = {}): Quote {
  n += 1;
  return {
    id: `LQ-${n}`,
    submittedAt: "2026-01-01T00:00:00.000Z",
    status: "aceite" as QuoteStatus,
    name: `Casal ${n}`,
    guests,
    quotedPrice: preco,
    location: "Évora",
    ...over,
  } as Quote;
}

/** N pedidos parecidos, para haver material que chegue. */
const historico = (quantos: number, guests: number, preco: number, over: Partial<Quote> = {}) =>
  Array.from({ length: quantos }, () => pedido(guests, preco, over));

describe("quando é que há padrão", () => {
  it("cala-se com menos casos do que o mínimo", () => {
    // Uma "média" de dois casamentos é uma coincidência, e um aviso assente
    // numa coincidência ensina-se a ignorar em duas semanas.
    const poucos = historico(MINIMO_PARA_COMPARAR - 1, 120, 10_000);
    expect(padraoPara({ guests: 120, location: "Évora" }, poucos)).toBeNull();
  });

  it("com casos que cheguem, dá o intervalo e a mediana", () => {
    const h = [
      ...historico(3, 120, 8_000),
      ...historico(3, 120, 12_000),
      ...historico(2, 120, 10_000),
    ];
    const p = padraoPara({ guests: 120, location: "Évora" }, h)!;
    expect(p.casos).toBe(8);
    expect(p.mediana).toBeGreaterThanOrEqual(8_000);
    expect(p.mediana).toBeLessThanOrEqual(12_000);
    expect(p.min).toBeLessThanOrEqual(p.mediana);
    expect(p.max).toBeGreaterThanOrEqual(p.mediana);
  });

  it("sem número de convidados não há com que comparar", () => {
    expect(padraoPara({ guests: 0, location: "Évora" }, historico(20, 120, 10_000))).toBeNull();
    expect(padraoPara({ location: "Évora" }, historico(20, 120, 10_000))).toBeNull();
  });
});

describe("o que entra na conta", () => {
  it("só eventos de dimensão parecida", () => {
    const h = [...historico(10, 300, 30_000), ...historico(6, 120, 10_000)];
    const p = padraoPara({ guests: 120, location: "Évora" }, h)!;
    // Os de 300 pax ficam de fora: 300 está muito acima da tolerância de 120.
    expect(p.casos).toBe(6);
    expect(p.mediana).toBe(10_000);
  });

  it("ignora pedidos que nunca tiveram preço, e os arquivados", () => {
    const h = [
      ...historico(6, 120, 10_000),
      ...historico(10, 120, 99_000, { status: "pendente" }),
      ...historico(10, 120, 99_000, { archived: true }),
    ];
    const p = padraoPara({ guests: 120, location: "Évora" }, h)!;
    expect(p.casos).toBe(6);
  });

  it("um negócio perdido continua a contar — o preço foi mesmo cobrado", () => {
    const h = historico(6, 120, 10_000, { status: "rejeitado" });
    expect(padraoPara({ guests: 120, location: "Évora" }, h)?.casos).toBe(6);
  });
});

describe("região", () => {
  it("prefere a mesma região quando há casos que cheguem, e di-lo", () => {
    const h = [
      ...historico(6, 120, 20_000, { location: "Faro" }),
      ...historico(20, 120, 8_000, { location: "Évora" }),
    ];
    const p = padraoPara({ guests: 120, location: "Faro" }, h)!;
    expect(p.regiao).toBe("Faro");
    expect(p.mediana).toBe(20_000);
  });

  it("alarga ao país quando a região não chega — e assume-o", () => {
    // Alargar em silêncio faria um aviso sobre o Algarve com números do
    // Alentejo, e ela não teria como saber.
    const h = [
      ...historico(2, 120, 20_000, { location: "Faro" }),
      ...historico(20, 120, 8_000, { location: "Évora" }),
    ];
    const p = padraoPara({ guests: 120, location: "Faro" }, h)!;
    expect(p.regiao).toBeNull();
  });
});

describe("o aviso", () => {
  it("apanha o zero a menos e o zero a mais", () => {
    const p = padraoPara({ guests: 120, location: "Évora" }, historico(10, 120, 10_000));
    expect(foraDoPadrao(1_000, p)?.lado).toBe("abaixo");
    expect(foraDoPadrao(100_000, p)?.lado).toBe("acima");
  });

  it("cala-se dentro do habitual", () => {
    const p = padraoPara({ guests: 120, location: "Évora" }, historico(10, 120, 10_000));
    expect(foraDoPadrao(10_000, p)).toBeNull();
  });

  it("sem padrão não há aviso nenhum", () => {
    expect(foraDoPadrao(3_000, null)).toBeNull();
  });
});
