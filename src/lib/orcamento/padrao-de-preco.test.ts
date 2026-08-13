import { describe, it, expect } from "vitest";
import { round2 } from "@/lib/money";
import type { Quote, QuoteStatus } from "./types";
import { MINIMO_PARA_COMPARAR, foraDoPadrao, padraoPara } from "./padrao-de-preco";

/**
 * O padrão fala em BRUTO — é o total com IVA da proposta que lhe é dado a
 * comparar. Os pedidos deste ficheiro guardam o preço em `quotedPrice`, que é
 * LÍQUIDO, por isso as expectativas passam por aqui em vez de repetirem o
 * mesmo preço nos dois papéis.
 */
const comIva = (liquido: number) => round2(liquido * 1.23);

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
    expect(p.mediana).toBeGreaterThanOrEqual(comIva(8_000));
    expect(p.mediana).toBeLessThanOrEqual(comIva(12_000));
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
    expect(p.mediana).toBe(comIva(10_000));
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
    expect(p.mediana).toBe(comIva(20_000));
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

describe("a base do dinheiro", () => {
  /**
   * O padrão fala em BRUTO, porque é em bruto que lhe perguntam.
   *
   * Quem chama (a Conferência e o Painel Interno) passa o total COM IVA da
   * proposta — é o número que está no ecrã dela. O histórico, esse, guarda o
   * `quotedPrice`, que é o campo "Preço final (SEM IVA)". Comparar um com o
   * outro é comparar 12.300 com 10.000 e chamar-lhe uma diferença de preço.
   */
  it("o `quotedPrice` do histórico é líquido e entra no padrão já com IVA", () => {
    const p = padraoPara({ guests: 120, location: "Évora" }, historico(10, 120, 10_000))!;
    expect(p.mediana).toBe(12_300);
    expect(p.min).toBe(12_300);
    expect(p.max).toBe(12_300);
  });

  it("um `priceBreakdown` (que já é bruto) entra pelo total, sem ser inflacionado", () => {
    // Aqui a armadilha é a oposta: `priceBreakdown.total` JÁ tem IVA. Somar-lhe
    // outros 23% punha os pedidos sem preço fechado 23% acima dos outros, no
    // mesmo intervalo.
    const semPrecoFechado = historico(10, 120, 0, {
      quotedPrice: undefined,
      priceBreakdown: { subtotal: 10_000, iva: 2_300, total: 12_300 } as Quote["priceBreakdown"],
    });
    expect(padraoPara({ guests: 120, location: "Évora" }, semPrecoFechado)?.mediana).toBe(12_300);
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
    expect(foraDoPadrao(comIva(10_000), p)).toBeNull();
  });

  it("sem padrão não há aviso nenhum", () => {
    expect(foraDoPadrao(3_000, null)).toBeNull();
  });
});
