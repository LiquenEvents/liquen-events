import { describe, it, expect } from "vitest";
import type { Proposal, Quote } from "./types";
import {
  acompanhamento,
  aExpirar,
  diasAte,
  diasDeValidade,
  estaEmAberto,
  estaExpirada,
  seguimentosDevidos,
} from "./proposta-estado";

const HOJE = new Date("2026-06-01T09:00:00Z");

let n = 0;
function proposta(over: Partial<Proposal> = {}): Proposal {
  n += 1;
  return {
    id: `P-${n}`,
    quoteId: `LQ-${n}`,
    clientName: `Casal ${n}`,
    clientEmail: `c${n}@exemplo.pt`,
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 1000,
    vat: 230,
    total: 1230,
    status: "enviada",
    createdAt: "2026-05-01T10:00:00.000Z",
    ...over,
  };
}

function pedido(id: string, date: string): Quote {
  return { id, name: "Casal", date } as Quote;
}

describe("dias até uma data", () => {
  it("conta dias inteiros, para trás e para a frente", () => {
    expect(diasAte("2026-06-01", HOJE)).toBe(0);
    expect(diasAte("2026-06-08", HOJE)).toBe(7);
    expect(diasAte("2026-05-30", HOJE)).toBe(-2);
  });

  it("não inventa nada a partir do que não é uma data", () => {
    // O campo aceita texto ("a definir") e propostas antigas não têm validade.
    expect(diasAte(undefined, HOJE)).toBeNull();
    expect(diasAte("", HOJE)).toBeNull();
    expect(diasAte("a definir", HOJE)).toBeNull();
  });

  it("a hora do dia não muda a contagem", () => {
    // Meia-noite e onze da noite do mesmo dia têm de dar o mesmo número, senão
    // o painel muda de ordem ao longo do dia sem nada ter mudado.
    const cedo = new Date("2026-06-01T00:05:00Z");
    const tarde = new Date("2026-06-01T23:55:00Z");
    expect(diasAte("2026-06-10", cedo)).toBe(diasAte("2026-06-10", tarde));
  });
});

describe("em aberto e expirada", () => {
  it("em aberto é enviada ou em negociação — nunca rascunho nem fechada", () => {
    expect(estaEmAberto(proposta({ status: "enviada" }))).toBe(true);
    expect(estaEmAberto(proposta({ status: "em_negociacao" }))).toBe(true);
    expect(estaEmAberto(proposta({ status: "rascunho" }))).toBe(false);
    expect(estaEmAberto(proposta({ status: "aceite" }))).toBe(false);
    expect(estaEmAberto(proposta({ status: "rejeitada" }))).toBe(false);
  });

  it("expirada lê-se do calendário, não de um estado gravado", () => {
    expect(estaExpirada(proposta({ validUntil: "2026-05-31" }), HOJE)).toBe(true);
    expect(estaExpirada(proposta({ validUntil: "2026-06-01" }), HOJE)).toBe(false);
    // Sem validade marcada não expira — não se inventa um prazo.
    expect(estaExpirada(proposta({}), HOJE)).toBe(false);
  });

  it("uma proposta já fechada não tem validade a correr", () => {
    const aceite = proposta({ status: "aceite", validUntil: "2026-06-05" });
    expect(diasDeValidade(aceite, HOJE)).toBeNull();
  });
});

describe("a ordem do painel", () => {
  it("só mostra o que está em aberto", () => {
    const linhas = acompanhamento(
      [
        proposta({ status: "enviada" }),
        proposta({ status: "rascunho" }),
        proposta({ status: "aceite" }),
        proposta({ status: "rejeitada" }),
        proposta({ status: "em_negociacao" }),
      ],
      [],
      HOJE,
    );
    expect(linhas.map((l) => l.proposta.status)).toEqual(["enviada", "em_negociacao"]);
  });

  it("o que já expirou vem à cabeça, mesmo com o evento longe", () => {
    const expirada = proposta({ id: "P-exp", quoteId: "Q1", validUntil: "2026-05-20" });
    const urgente = proposta({ id: "P-urg", quoteId: "Q2", validUntil: "2026-06-03" });
    const linhas = acompanhamento(
      [urgente, expirada],
      [pedido("Q1", "2028-09-01"), pedido("Q2", "2026-06-20")],
      HOJE,
    );
    expect(linhas[0].proposta.id).toBe("P-exp");
    expect(linhas[0].urgencia).toBe("expirada");
  });

  it("ordena pelo relógio que está mais perto, seja ele qual for", () => {
    // Válida muito tempo, mas o casamento é daqui a cinco dias: sobe.
    const eventoPerto = proposta({ id: "P-evento", quoteId: "Q1", validUntil: "2026-12-01" });
    // Válida menos tempo, mas ainda assim mais longe do que aqueles 5 dias.
    const validadeMedia = proposta({ id: "P-validade", quoteId: "Q2", validUntil: "2026-06-20" });

    const linhas = acompanhamento(
      [validadeMedia, eventoPerto],
      [pedido("Q1", "2026-06-06"), pedido("Q2", "2027-01-01")],
      HOJE,
    );
    expect(linhas.map((l) => l.proposta.id)).toEqual(["P-evento", "P-validade"]);
  });

  it("um seguimento marcado por ela também puxa a proposta para cima", () => {
    const comSeguimento = proposta({
      id: "P-seg",
      quoteId: "Q1",
      validUntil: "2026-12-01",
      followUpAt: "2026-06-02",
    });
    const semNada = proposta({ id: "P-outra", quoteId: "Q2", validUntil: "2026-06-10" });

    const linhas = acompanhamento(
      [semNada, comSeguimento],
      [pedido("Q1", "2027-05-01"), pedido("Q2", "2027-05-01")],
      HOJE,
    );
    expect(linhas[0].proposta.id).toBe("P-seg");
  });

  it("uma proposta sem relógio nenhum vai para o fim, não para a frente", () => {
    const semNada = proposta({ id: "P-sem", quoteId: "Q9" });
    const comValidade = proposta({ id: "P-com", quoteId: "Q8", validUntil: "2026-08-01" });
    const linhas = acompanhamento([semNada, comValidade], [], HOJE);
    expect(linhas.map((l) => l.proposta.id)).toEqual(["P-com", "P-sem"]);
  });

  it("liga a proposta ao pedido para saber a data do evento", () => {
    const p = proposta({ quoteId: "Q1" });
    const [linha] = acompanhamento([p], [pedido("Q1", "2026-06-15")], HOJE);
    expect(linha.quote?.id).toBe("Q1");
    expect(linha.evento).toBe(14);
  });

  it("um pedido apagado não parte o painel", () => {
    const p = proposta({ quoteId: "nao-existe" });
    const [linha] = acompanhamento([p], [], HOJE);
    expect(linha.quote).toBeUndefined();
    expect(linha.evento).toBeNull();
  });
});

describe("os avisos", () => {
  it("junta o que expirou e o que está a sete dias de expirar", () => {
    const linhas = acompanhamento(
      [
        proposta({ id: "P-ok", validUntil: "2026-07-30" }),
        proposta({ id: "P-quase", validUntil: "2026-06-05" }),
        proposta({ id: "P-fora", validUntil: "2026-05-20" }),
      ],
      [],
      HOJE,
    );
    expect(
      aExpirar(linhas)
        .map((l) => l.proposta.id)
        .sort(),
    ).toEqual(["P-fora", "P-quase"]);
  });

  it("os seguimentos devidos são os de hoje e os atrasados", () => {
    const linhas = acompanhamento(
      [
        proposta({ id: "P-hoje", followUpAt: "2026-06-01" }),
        proposta({ id: "P-atrasado", followUpAt: "2026-05-20" }),
        proposta({ id: "P-futuro", followUpAt: "2026-06-20" }),
      ],
      [],
      HOJE,
    );
    expect(
      seguimentosDevidos(linhas)
        .map((l) => l.proposta.id)
        .sort(),
    ).toEqual(["P-atrasado", "P-hoje"]);
  });
});
