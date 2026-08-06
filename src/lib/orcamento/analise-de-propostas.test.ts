import { describe, it, expect } from "vitest";
import type { Proposal } from "./types";
import { analisar, analisarExtras } from "./analise-de-propostas";

let n = 0;
function p(over: Partial<Proposal> = {}): Proposal {
  n += 1;
  return {
    id: `p${n}`,
    quoteId: `q${n}`,
    clientName: "Ana e Rui",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 10000,
    vat: 2300,
    total: 12300,
    status: "enviada",
    createdAt: "2026-01-01T00:00:00.000Z",
    sentAt: "2026-01-01T00:00:00.000Z",
    ...over,
  };
}

describe("a taxa de fecho", () => {
  it("conta sobre as RESPONDIDAS, não sobre as enviadas", () => {
    // Uma proposta de há três dias ainda não é uma derrota. No denominador,
    // fazia a taxa parecer pior sempre que houvesse trabalho recente.
    const a = analisar([
      p({ status: "aceite" }),
      p({ status: "rejeitada" }),
      p({ status: "enviada" }),
      p({ status: "em_negociacao" }),
    ]);
    expect(a.respondidas).toBe(2);
    expect(a.taxaDeFecho).toBe(50);
    expect(a.semResposta).toBe(2);
  });

  it("os rascunhos não contam para nada", () => {
    // Um rascunho nunca foi proposto a ninguém.
    const a = analisar([p({ status: "rascunho" }), p({ status: "aceite" })]);
    expect(a.enviadas).toBe(1);
    expect(a.taxaDeFecho).toBe(100);
  });

  it("sem respostas nenhumas não inventa uma taxa", () => {
    expect(analisar([p({ status: "enviada" })]).taxaDeFecho).toBeNull();
  });
});

describe("os motivos", () => {
  it("conta-os por ordem de frequência", () => {
    const a = analisar([
      p({ status: "rejeitada", lostReason: "preco" }),
      p({ status: "rejeitada", lostReason: "preco" }),
      p({ status: "rejeitada", lostReason: "data" }),
    ]);
    expect(a.motivos[0]).toEqual({ chave: "preco", n: 2, pct: 67 });
    expect(a.motivos[1].chave).toBe("data");
  });

  it("uma recusa sem motivo registado não desaparece", () => {
    // Sem isto, a soma dos motivos era menor do que o número de recusas e
    // ninguém percebia porquê.
    const a = analisar([p({ status: "rejeitada" }), p({ status: "rejeitada" })]);
    expect(a.recusadas).toBe(2);
    expect(a.motivos.reduce((s, m) => s + m.n, 0)).toBe(2);
    expect(a.motivos[0].chave).toBe("outro");
  });

  it("um motivo que nunca aconteceu não ocupa uma linha", () => {
    const a = analisar([p({ status: "rejeitada", lostReason: "preco" })]);
    expect(a.motivos).toHaveLength(1);
  });
});

describe("o tempo de resposta", () => {
  it("é a mediana, em dias", () => {
    const a = analisar([
      p({ status: "aceite", sentAt: "2026-01-01", respondedAt: "2026-01-03" }),
      p({ status: "aceite", sentAt: "2026-01-01", respondedAt: "2026-01-11" }),
      p({ status: "rejeitada", sentAt: "2026-01-01", respondedAt: "2026-01-06" }),
    ]);
    // Mediana e não média: uma proposta respondida ao fim de seis meses puxava
    // a média para um número que não descreve nenhuma resposta real.
    expect(a.medianaDeResposta).toBe(5);
  });

  it("ignora datas impossíveis em vez de as contar como zero", () => {
    const a = analisar([
      p({ status: "aceite", sentAt: "2026-02-01", respondedAt: "2026-01-01" }),
      p({ status: "aceite", sentAt: "2026-01-01", respondedAt: "2026-01-05" }),
    ]);
    expect(a.medianaDeResposta).toBe(4);
  });

  it("sem respostas datadas cala-se", () => {
    expect(analisar([p({ status: "aceite" })]).medianaDeResposta).toBeNull();
  });
});

describe("os valores", () => {
  it("separa o que se ganhou do que se perdeu", () => {
    const a = analisar([
      p({ status: "aceite", total: 10000 }),
      p({ status: "aceite", total: 20000 }),
      p({ status: "rejeitada", total: 30000 }),
    ]);
    expect(a.valorMedioGanho).toBe(15000);
    expect(a.valorMedioPerdido).toBe(30000);
  });
});

describe("os extras vendem-se?", () => {
  const comExtras = (over: Partial<Proposal> = {}) =>
    p({
      status: "aceite",
      doc: { budgetItems: ["a", "b"], budgetOpcional: [false, true] } as Proposal["doc"],
      ...over,
    });

  it("conta sobre as REGISTADAS, e diz quantas faltam", () => {
    // As que estão por registar não são um "não": tratá-las como tal dava uma
    // taxa que descia sempre que alguém se esquecia de preencher, e a conclusão
    // seria sobre o preenchimento e não sobre a venda.
    const e = analisarExtras([
      comExtras({ versaoEscolhida: "extras" }),
      comExtras({ versaoEscolhida: "base" }),
      comExtras(),
    ])!;
    expect(e.comExtras).toBe(3);
    expect(e.taxa).toBe(50);
    expect(e.porRegistar).toBe(1);
  });

  it("uma proposta ganha sem extras não entra na conta", () => {
    const e = analisarExtras([
      comExtras({ versaoEscolhida: "extras" }),
      p({ status: "aceite", doc: { budgetItems: ["a"] } as Proposal["doc"] }),
    ])!;
    expect(e.comExtras).toBe(1);
  });

  it("se nunca se ofereceram extras, não há secção nenhuma", () => {
    // "0 de 0" ensina a passar os olhos por cima da secção.
    expect(analisarExtras([p({ status: "aceite" })])).toBeNull();
  });

  it("todas por registar dá contagem sem taxa", () => {
    const e = analisarExtras([comExtras(), comExtras()])!;
    expect(e.comExtras).toBe(2);
    expect(e.taxa).toBeNull();
  });
});
