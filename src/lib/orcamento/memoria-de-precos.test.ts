import { describe, it, expect } from "vitest";
import type { Proposal, Quote } from "./types";
import {
  chaveDoServico,
  historicoDe,
  linhasCobradas,
  oQueCostumaIncluir,
} from "./memoria-de-precos";

let n = 0;
function proposta(
  itens: string[],
  precos: (number | null)[],
  over: Partial<Proposal> = {},
): Proposal {
  n += 1;
  return {
    id: `P-${n}`,
    quoteId: over.quoteId ?? `Q-${n}`,
    clientName: "Casal",
    clientEmail: "c@e.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 0,
    vat: 0,
    total: 0,
    status: "enviada",
    createdAt: "2026-01-01T00:00:00.000Z",
    doc: { budgetItems: itens, budgetAmounts: precos } as Proposal["doc"],
    ...over,
  };
}

const pedido = (id: string, guests: number, location = "Évora"): Quote =>
  ({ id, guests, location }) as Quote;

describe("agrupar o mesmo serviço escrito de maneiras diferentes", () => {
  it("ignora acentos, maiúsculas, pontuação e palavras vazias", () => {
    expect(chaveDoServico("Decoração da Cerimónia")).toBe(chaveDoServico("decoracao cerimonia"));
    expect(chaveDoServico("Arranjos de mesa")).toBe(chaveDoServico("ARRANJOS  MESA!"));
  });

  it("a ordem das palavras não separa o que é o mesmo", () => {
    expect(chaveDoServico("Mesa dos doces")).toBe(chaveDoServico("Doces da mesa"));
  });

  it("serviços diferentes continuam diferentes", () => {
    expect(chaveDoServico("Arranjos de mesa")).not.toBe(chaveDoServico("Arco floral"));
  });
});

describe("que linhas contam", () => {
  it("só as de propostas que chegaram a sair", () => {
    // Um rascunho tem preços a meio de serem pensados: deixá-los entrar fazia a
    // memória lembrar-se de números que nunca foram propostos a ninguém.
    const linhas = linhasCobradas(
      [
        proposta(["Flores"], [1000], { status: "enviada", quoteId: "Q1" }),
        proposta(["Flores"], [9999], { status: "rascunho", quoteId: "Q1" }),
      ],
      [pedido("Q1", 120)],
    );
    expect(linhas).toHaveLength(1);
    expect(linhas[0].preco).toBe(1000);
  });

  it("ignora linhas sem nome ou sem preço", () => {
    const linhas = linhasCobradas(
      [proposta(["Flores", "", "Sem preço"], [1000, 500, null], { quoteId: "Q1" })],
      [pedido("Q1", 120)],
    );
    expect(linhas.map((l) => l.nome)).toEqual(["Flores"]);
  });
});

describe("quanto já cobrei por isto", () => {
  const historico = (quantos: number, preco: number, guests = 120, location = "Évora") =>
    Array.from({ length: quantos }, (_, i) =>
      proposta(["Arranjos de mesa"], [preco + i * 100], {
        quoteId: `Q-${location}-${guests}-${i}`,
      }),
    );
  const pedidos = (quantos: number, guests = 120, location = "Évora") =>
    Array.from({ length: quantos }, (_, i) =>
      pedido(`Q-${location}-${guests}-${i}`, guests, location),
    );

  it("dá o intervalo, a mediana e quantos casos", () => {
    const linhas = linhasCobradas(historico(5, 800), pedidos(5));
    const h = historicoDe("arranjos mesa", { guests: 120, location: "Évora" }, linhas)!;
    expect(h.casos).toBe(5);
    expect(h.min).toBe(800);
    expect(h.max).toBe(1200);
    expect(h.mediana).toBe(1000);
  });

  it("cala-se com um caso só — não é memória, é anedota", () => {
    const linhas = linhasCobradas(historico(1, 800), pedidos(1));
    expect(historicoDe("arranjos mesa", { guests: 120 }, linhas)).toBeNull();
  });

  it("não diz nada sobre um serviço que nunca cobrou", () => {
    const linhas = linhasCobradas(historico(5, 800), pedidos(5));
    expect(historicoDe("Fogo de artifício", { guests: 120 }, linhas)).toBeNull();
  });

  it("prefere eventos da mesma dimensão", () => {
    // Um arranjo para 60 pessoas e um para 300 não são o mesmo trabalho.
    const linhas = linhasCobradas(
      [...historico(4, 500, 60), ...historico(4, 2000, 300)],
      [...pedidos(4, 60), ...pedidos(4, 300)],
    );
    const h = historicoDe("arranjos mesa", { guests: 300 }, linhas)!;
    expect(h.min).toBeGreaterThanOrEqual(2000);
  });

  it("afina por região quando há casos que cheguem, e di-lo", () => {
    const linhas = linhasCobradas(
      [...historico(4, 3000, 120, "Faro"), ...historico(6, 900, 120, "Évora")],
      [...pedidos(4, 120, "Faro"), ...pedidos(6, 120, "Évora")],
    );
    const h = historicoDe("arranjos mesa", { guests: 120, location: "Faro" }, linhas)!;
    expect(h.regiao).toBe("Faro");
    expect(h.min).toBeGreaterThanOrEqual(3000);
  });

  it("alarga quando a região não chega, e assume-o", () => {
    const linhas = linhasCobradas(
      [...historico(1, 3000, 120, "Faro"), ...historico(6, 900, 120, "Évora")],
      [...pedidos(1, 120, "Faro"), ...pedidos(6, 120, "Évora")],
    );
    const h = historicoDe("arranjos mesa", { guests: 120, location: "Faro" }, linhas)!;
    expect(h.regiao).toBeNull();
  });
});

describe("o que costumo incluir e falta aqui", () => {
  /** Cinco propostas iguais para 120 pax, todas com os mesmos três serviços. */
  const cinco = () =>
    Array.from({ length: 5 }, (_, i) =>
      proposta(["Arranjos de mesa", "Arco floral", "Decoração de cerimónia"], [500, 800, 1200], {
        quoteId: `Q${i}`,
      }),
    );
  const cincoPedidos = () => Array.from({ length: 5 }, (_, i) => pedido(`Q${i}`, 120));

  it("aponta o que aparece em quase todas e falta nesta", () => {
    const faltas = oQueCostumaIncluir(
      ["Arranjos de mesa"],
      { guests: 120 },
      cinco(),
      cincoPedidos(),
    );
    expect(faltas.map((f) => f.nome).sort()).toEqual(["Arco floral", "Decoração de cerimónia"]);
    expect(faltas[0].em).toBe(5);
    expect(faltas[0].de).toBe(5);
  });

  it("cala-se sobre o que já lá está, mesmo escrito de outra maneira", () => {
    const faltas = oQueCostumaIncluir(
      ["arranjos mesa", "ARCO FLORAL", "decoracao da cerimonia"],
      { guests: 120 },
      cinco(),
      cincoPedidos(),
    );
    expect(faltas).toHaveLength(0);
  });

  it("um serviço que entra em metade das propostas não é um esquecimento", () => {
    // É uma escolha. Apontá-lo transformava a lista num ruído permanente.
    const propostas = [
      ...cinco(),
      ...Array.from({ length: 5 }, (_, i) =>
        proposta(["Arranjos de mesa"], [500], { quoteId: `R${i}` }),
      ),
    ];
    const pedidos = [
      ...cincoPedidos(),
      ...Array.from({ length: 5 }, (_, i) => pedido(`R${i}`, 120)),
    ];
    const faltas = oQueCostumaIncluir(["Arranjos de mesa"], { guests: 120 }, propostas, pedidos);
    expect(faltas).toHaveLength(0);
  });

  it("uma proposta que repete o mesmo serviço não faz sozinha um hábito", () => {
    const repetida = [
      proposta(["Flores", "Flores", "Flores"], [100, 100, 100], { quoteId: "Q1" }),
      proposta(["Arranjos"], [200], { quoteId: "Q2" }),
      proposta(["Arranjos"], [200], { quoteId: "Q3" }),
    ];
    const pedidos = [pedido("Q1", 120), pedido("Q2", 120), pedido("Q3", 120)];
    const faltas = oQueCostumaIncluir(["Arranjos"], { guests: 120 }, repetida, pedidos);
    // "Flores" aparece numa proposta de três — longe do limiar.
    expect(faltas).toHaveLength(0);
  });

  it("sem propostas que cheguem não diz nada", () => {
    expect(oQueCostumaIncluir([], { guests: 120 }, [], [])).toEqual([]);
  });
});
