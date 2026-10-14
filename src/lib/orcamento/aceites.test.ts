import { describe, it, expect } from "vitest";
import { juntarAceites } from "./aceites";
import type { Contract } from "@/lib/contract-types";
import type { Proposal, Quote } from "@/lib/orcamento/types";

/**
 * «aqui devem estar todas as propostas que nós marcamos como ganhas» — e cada
 * uma UMA vez, com contrato ou sem ele.
 */
const contrato = (o: Partial<Contract>): Contract =>
  ({
    id: "c1",
    quoteId: "q1",
    proposalId: "p1",
    clientName: "TESTE Com Contrato",
    clientEmail: "c@exemplo.pt",
    termsVersion: "2026-08",
    termsSnapshot: "",
    status: "pendente",
    createdAt: "2026-09-01T10:00:00.000Z",
    ...o,
  }) as Contract;
const pedido = (o: Partial<Quote>): Quote =>
  ({ id: "q2", status: "aceite", name: "TESTE Ganho", email: "g@exemplo.pt", ...o }) as Quote;
const proposta = (o: Partial<Proposal>): Proposal =>
  ({
    id: "p2",
    quoteId: "q2",
    clientName: "TESTE Ganho",
    clientEmail: "g@exemplo.pt",
    status: "enviada",
    createdAt: "2026-08-01T10:00:00.000Z",
    ...o,
  }) as Proposal;

describe("juntarAceites", () => {
  it("cada contrato aparece, uma vez", () => {
    const r = juntarAceites(
      [contrato({})],
      [pedido({ id: "q1" })],
      [proposta({ id: "p1", quoteId: "q1", status: "aceite" })],
    );
    expect(r).toHaveLength(1);
    expect(r[0].tipo).toBe("contrato");
  });

  it("um pedido em Ganho sem contrato aparece — com a proposta, para o poder criar", () => {
    const r = juntarAceites([], [pedido({})], [proposta({})]);
    expect(r).toEqual([
      expect.objectContaining({ tipo: "sem-contrato", quoteId: "q2", proposalId: "p2" }),
    ]);
  });

  it("uma proposta aceite cujo pedido ainda não está em Ganho também aparece", () => {
    const r = juntarAceites(
      [],
      [pedido({ status: "cotado" })],
      [proposta({ status: "aceite", respondedAt: "2026-09-05T10:00:00.000Z" })],
    );
    expect(r).toEqual([
      expect.objectContaining({ tipo: "sem-contrato", ganhoEm: "2026-09-05T10:00:00.000Z" }),
    ]);
  });

  it("um pedido ganho sem proposta aparece, sem proposta para criar contrato", () => {
    const r = juntarAceites([], [pedido({})], []);
    expect(r).toHaveLength(1);
    expect(r[0]).not.toHaveProperty("proposalId");
  });

  it("os arquivados não entram", () => {
    expect(
      juntarAceites([], [pedido({ archived: true })], [proposta({ status: "aceite" })]),
    ).toEqual([]);
  });

  it("um pedido que não é ganho, sem proposta aceite, não entra", () => {
    expect(juntarAceites([], [pedido({ status: "cotado" })], [proposta({})])).toEqual([]);
  });

  it("quando e quem marcou Ganho vêm do histórico do pedido", () => {
    const r = juntarAceites(
      [],
      [
        pedido({
          activityLog: [
            {
              id: "a",
              at: "2026-09-01T10:00:00.000Z",
              kind: "status_change",
              summary: "Novo → Proposta enviada",
              actor: "Ana",
            },
            {
              id: "b",
              at: "2026-09-09T10:00:00.000Z",
              kind: "status_change",
              summary: "Proposta enviada → Ganho",
              actor: "Catarina",
            },
          ],
        }),
      ],
      [],
    );
    expect(r[0]).toEqual(
      expect.objectContaining({ ganhoEm: "2026-09-09T10:00:00.000Z", marcadoPor: "Catarina" }),
    );
  });

  it("a mais recente primeiro", () => {
    const r = juntarAceites(
      [contrato({ createdAt: "2026-01-01T00:00:00.000Z" })],
      [
        pedido({ id: "q1" }),
        pedido({
          id: "q3",
          activityLog: [
            {
              id: "x",
              at: "2026-10-01T00:00:00.000Z",
              kind: "status_change",
              summary: "Novo → Ganho",
            },
          ],
        }),
      ],
      [],
    );
    expect(r.map((i) => i.quoteId)).toEqual(["q3", "q1"]);
  });
});
