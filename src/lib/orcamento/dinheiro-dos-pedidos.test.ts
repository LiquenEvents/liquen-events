import { describe, expect, it } from "vitest";
import type { Quote } from "./types";
import {
  contasDosPedidos,
  ultimaEnviada,
  valorDoPedido,
  type PropostaParaContas,
} from "./dinheiro-dos-pedidos";

function pedido(over: Partial<Quote>): Quote {
  return {
    id: "q1",
    name: "TESTE",
    email: "t@example.pt",
    status: "pendente",
    submittedAt: "2026-01-01T10:00:00Z",
    ...over,
  } as Quote;
}

function proposta(over: Partial<PropostaParaContas>): PropostaParaContas {
  return {
    quoteId: "q1",
    status: "enviada",
    total: 0,
    subtotal: 0,
    vatRate: 0.23,
    createdAt: "2026-01-02T10:00:00Z",
    ...over,
  };
}

describe("valorDoPedido", () => {
  it("sem proposta, é o preço final à taxa da estimativa (23 % por omissão)", () => {
    expect(valorDoPedido(pedido({ quotedPrice: 10000 }))).toEqual({
      liquido: 10000,
      comIva: 12300,
    });
  });

  it("com proposta enviada, a taxa é a que o cliente viu na proposta", () => {
    const p = proposta({ subtotal: 10000, total: 10600, vatRate: 0.06 });
    expect(valorDoPedido(pedido({ quotedPrice: 10000 }), [p]).comIva).toBe(10600);
  });

  it("o valor confirmado ao marcar Ganho manda sobre o total da proposta", () => {
    // Negociou-se: a proposta dizia 10 000 + IVA, fechou-se por 9 000.
    const p = proposta({ subtotal: 10000, total: 12300 });
    expect(valorDoPedido(pedido({ quotedPrice: 9000 }), [p])).toEqual({
      liquido: 9000,
      comIva: 11070,
    });
  });

  it("sem preço final escrito, vale o total da última proposta enviada", () => {
    const p = proposta({ subtotal: 5000, total: 6150 });
    expect(valorDoPedido(pedido({}), [p])).toEqual({ liquido: 5000, comIva: 6150 });
  });

  it("um rascunho não conta: sem preço e só com rascunho, vale zero", () => {
    const p = proposta({ status: "rascunho", subtotal: 5000, total: 6150 });
    expect(valorDoPedido(pedido({}), [p])).toEqual({ liquido: 0, comIva: 0 });
  });
});

describe("ultimaEnviada", () => {
  it("é a última por ENVIO, e não por criação", () => {
    const antiga = proposta({
      total: 100,
      createdAt: "2026-01-05T00:00:00Z",
      sentAt: "2026-01-06T00:00:00Z",
    });
    const nova = proposta({
      total: 200,
      createdAt: "2026-01-01T00:00:00Z",
      sentAt: "2026-01-10T00:00:00Z",
    });
    expect(ultimaEnviada([antiga, nova])?.total).toBe(200);
  });
});

describe("contasDosPedidos — manda o estado do pedido", () => {
  it("um pedido em Ganho com a proposta ainda «enviada» conta como ganho", () => {
    const q = pedido({ status: "aceite", quotedPrice: 10000 });
    const p = proposta({ status: "enviada", subtotal: 10000, total: 12300 });
    const c = contasDosPedidos([q], [p]);
    expect(c.ganho).toEqual({ valor: 12300, n: 1, comValor: 1 });
    expect(c.aEspera).toEqual({ valor: 0, n: 0 });
  });

  it("à espera é só «Proposta enviada» — o ganho não entra lá", () => {
    const c = contasDosPedidos([
      pedido({ id: "a", status: "aceite", quotedPrice: 1000 }),
      pedido({ id: "b", status: "cotado", quotedPrice: 2000 }),
      pedido({ id: "c", status: "rejeitado", quotedPrice: 3000 }),
      pedido({ id: "d", status: "pendente", quotedPrice: 4000 }),
    ]);
    expect(c.ganho.valor).toBe(1230);
    expect(c.aEspera).toEqual({ valor: 2460, n: 1 });
    expect(c.perdidos).toBe(1);
    expect(c.taxaDeFecho).toBe(33);
  });

  it("os arquivados ficam de fora", () => {
    const c = contasDosPedidos([pedido({ status: "aceite", quotedPrice: 1000, archived: true })]);
    expect(c.ganho).toEqual({ valor: 0, n: 0, comValor: 0 });
  });

  it("um ganho sem valor nenhum conta no número, mas não no «com valor»", () => {
    const c = contasDosPedidos([pedido({ status: "aceite" })]);
    expect(c.ganho).toEqual({ valor: 0, n: 1, comValor: 0 });
  });
});
