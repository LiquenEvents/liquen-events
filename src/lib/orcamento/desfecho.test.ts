import { describe, it, expect } from "vitest";
import type { Quote } from "./types";
import {
  DIAS_ATE_PERGUNTAR,
  aEsperaDeResposta,
  corpoDaMarcacao,
  desfechoJaMarcado,
  diasSemResposta,
  faltaODesfecho,
  totalPendurado,
  valorConfirmado,
  valorDePartida,
} from "./desfecho";

const base = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-08-01T10:00:00.000Z",
    status: "cotado",
    name: "Ana",
    email: "ana@exemplo.pt",
    guests: 100,
    ...over,
  }) as Quote;

describe("faltaODesfecho", () => {
  it("só pergunta a quem já tem proposta enviada", () => {
    expect(faltaODesfecho(base({ status: "cotado" }))).toBe(true);
  });

  it("não pergunta a quem ainda não teve proposta", () => {
    expect(faltaODesfecho(base({ status: "pendente" }))).toBe(false);
    expect(faltaODesfecho(base({ status: "em_revisao" }))).toBe(false);
  });

  it("não volta a perguntar a um pedido já decidido", () => {
    expect(faltaODesfecho(base({ status: "aceite" }))).toBe(false);
    expect(faltaODesfecho(base({ status: "rejeitado" }))).toBe(false);
  });
});

describe("desfechoJaMarcado", () => {
  it("reconhece o que já foi decidido, e por qual dos dois lados", () => {
    expect(desfechoJaMarcado(base({ status: "aceite" }))).toBe("ganho");
    expect(desfechoJaMarcado(base({ status: "rejeitado" }))).toBe("perdido");
    expect(desfechoJaMarcado(base({ status: "cotado" }))).toBeNull();
  });
});

describe("valorDePartida", () => {
  it("é o valor da proposta enviada, que é o que já está gravado", () => {
    expect(valorDePartida(base({ quotedPrice: 4600 }))).toBe(4600);
  });

  it("é zero quando nunca se escreveu preço nenhum", () => {
    expect(valorDePartida(base({}))).toBe(0);
    expect(valorDePartida(base({ quotedPrice: 0 }))).toBe(0);
  });
});

describe("valorConfirmado", () => {
  it("aceita o número escrito à portuguesa", () => {
    expect(valorConfirmado("4.600,00")).toEqual({ ok: true, valor: 4600 });
    expect(valorConfirmado("4600")).toEqual({ ok: true, valor: 4600 });
    expect(valorConfirmado(" 4 600,50 € ")).toEqual({ ok: true, valor: 4600.5 });
  });

  it("aceita zero, porque zero escrito de propósito é uma resposta", () => {
    expect(valorConfirmado("0")).toEqual({ ok: true, valor: 0 });
  });

  it("recusa o campo vazio, e diz o que fazer", () => {
    const r = valorConfirmado("   ");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.porque).toMatch(/valor/i);
  });

  it("recusa o que não é um número e o que é negativo", () => {
    expect(valorConfirmado("mais ou menos").ok).toBe(false);
    expect(valorConfirmado("-100").ok).toBe(false);
  });
});

describe("diasSemResposta", () => {
  const hoje = new Date("2026-08-14T09:00:00.000Z");

  it("conta desde o dia em que a proposta saiu", () => {
    const q = base({
      status: "cotado",
      lastUpdated: "2026-08-13T09:00:00.000Z",
      activityLog: [
        { id: "a", at: "2026-08-04T09:00:00.000Z", kind: "proposal_sent", summary: "Proposta" },
      ],
    });
    expect(diasSemResposta(q, hoje)).toBe(10);
  });

  it("sem registo do envio, conta desde a última vez que se lhe tocou", () => {
    const q = base({ status: "cotado", lastUpdated: "2026-08-11T09:00:00.000Z" });
    expect(diasSemResposta(q, hoje)).toBe(3);
  });

  it("é nulo para quem não tem proposta enviada", () => {
    expect(diasSemResposta(base({ status: "pendente" }), hoje)).toBeNull();
    expect(diasSemResposta(base({ status: "aceite" }), hoje)).toBeNull();
  });
});

describe("aEsperaDeResposta", () => {
  const hoje = new Date("2026-08-14T09:00:00.000Z");
  const enviadaEm = (iso: string) => [
    { id: "a", at: iso, kind: "proposal_sent" as const, summary: "Proposta" },
  ];

  it("só traz as propostas enviadas há mais dias do que o corte", () => {
    const velha = base({
      id: "velha",
      quotedPrice: 5000,
      activityLog: enviadaEm("2026-08-01T09:00:00.000Z"),
    });
    const fresca = base({
      id: "fresca",
      quotedPrice: 3000,
      activityLog: enviadaEm("2026-08-13T09:00:00.000Z"),
    });
    const ganha = base({
      id: "ganha",
      status: "aceite",
      quotedPrice: 9000,
      activityLog: enviadaEm("2026-08-01T09:00:00.000Z"),
    });
    const linhas = aEsperaDeResposta([fresca, velha, ganha], hoje);
    expect(linhas.map((l) => l.quote.id)).toEqual(["velha"]);
    expect(linhas[0].dias).toBe(13);
    expect(linhas[0].valor).toBe(5000);
  });

  it("põe primeiro quem espera há mais tempo", () => {
    const a = base({ id: "a", activityLog: enviadaEm("2026-08-05T09:00:00.000Z") });
    const b = base({ id: "b", activityLog: enviadaEm("2026-07-20T09:00:00.000Z") });
    expect(aEsperaDeResposta([a, b], hoje).map((l) => l.quote.id)).toEqual(["b", "a"]);
  });

  it("o corte é o mesmo número que a lista anuncia", () => {
    const mesmoDia = base({
      id: "corte",
      activityLog: enviadaEm(
        new Date(hoje.getTime() - DIAS_ATE_PERGUNTAR * 86_400_000).toISOString(),
      ),
    });
    expect(aEsperaDeResposta([mesmoDia], hoje)).toHaveLength(1);
  });

  it("soma o que está pendurado", () => {
    const a = base({
      id: "a",
      quotedPrice: 5000,
      activityLog: enviadaEm("2026-07-01T09:00:00.000Z"),
    });
    const b = base({
      id: "b",
      quotedPrice: 2500,
      activityLog: enviadaEm("2026-07-02T09:00:00.000Z"),
    });
    expect(totalPendurado(aEsperaDeResposta([a, b], hoje))).toBe(7500);
  });
});

describe("corpoDaMarcacao", () => {
  const comuns = { quem: "Catarina", quando: "2026-08-14T09:00:00.000Z", id: () => "id-1" };

  it("marcar ganho leva o estado E o valor confirmado", () => {
    const body = corpoDaMarcacao({ desfecho: "ganho", valor: 4600, ...comuns });
    expect(body.status).toBe("aceite");
    expect(body.quotedPrice).toBe(4600);
    expect(body.activityLogAppend).toEqual([
      {
        id: "id-1",
        at: comuns.quando,
        kind: "status_change",
        actor: "Catarina",
        summary: expect.stringContaining("Ganho"),
      },
    ]);
  });

  it("marcar perdido não pede nada e não mexe no preço", () => {
    const body = corpoDaMarcacao({ desfecho: "perdido", ...comuns });
    expect(body.status).toBe("rejeitado");
    expect("quotedPrice" in body).toBe(false);
    expect("lostReason" in body).toBe(false);
  });

  it("o motivo de perda vai só quando foi mesmo escrito", () => {
    expect(corpoDaMarcacao({ desfecho: "perdido", motivo: "  ", ...comuns }).lostReason).toBe(
      undefined,
    );
    expect(corpoDaMarcacao({ desfecho: "perdido", motivo: " Preço ", ...comuns }).lostReason).toBe(
      "Preço",
    );
  });
});
