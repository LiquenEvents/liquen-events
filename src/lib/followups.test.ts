import { describe, it, expect } from "vitest";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import {
  computeFollowUps,
  computeInvoiceFollowUps,
  withInvoiceFollowUps,
  type FollowUp,
  type InvoiceLike,
} from "./followups";

// Fixed reference point so the rules are fully deterministic.
const NOW = Date.parse("2026-07-18T12:00:00Z");
const DAY = 86_400_000;

/** yyyy-mm-dd for N days from NOW (negative = past). */
const dayKey = (offsetDays: number) => new Date(NOW + offsetDays * DAY).toISOString().slice(0, 10);
/** ISO timestamp N days before NOW. */
const daysAgoIso = (days: number) => new Date(NOW - days * DAY).toISOString();

// computeFollowUps only touches a handful of fields; cast partial fixtures.
const quote = (q: Partial<Quote>): Quote =>
  ({ id: "q1", name: "Cliente", status: "pendente", submittedAt: daysAgoIso(0), ...q }) as Quote;
const proposal = (p: Partial<Proposal>): Proposal =>
  ({
    id: "p1",
    quoteId: "q1",
    clientName: "Cliente",
    status: "enviada",
    createdAt: daysAgoIso(0),
    ...p,
  }) as Proposal;

const kinds = (fs: FollowUp[]) => fs.map((f) => f.kind);

describe("computeFollowUps", () => {
  it("flags a sent proposal unanswered for more than 5 days", () => {
    const fs = computeFollowUps({
      quotes: [],
      proposals: [proposal({ status: "enviada", sentAt: daysAgoIso(6) })],
      now: NOW,
    });
    expect(kinds(fs)).toEqual(["proposta_sem_resposta"]);
    expect(fs[0].duenessDays).toBe(6);
    expect(fs[0].severity).toBe("aviso");
  });

  it("does not flag proposals answered, unsent, or 5 days or fresher", () => {
    const fs = computeFollowUps({
      quotes: [],
      proposals: [
        proposal({ id: "a", status: "enviada", sentAt: daysAgoIso(4) }),
        proposal({ id: "b", status: "enviada", sentAt: daysAgoIso(9), respondedAt: daysAgoIso(1) }),
        proposal({ id: "c", status: "rascunho", sentAt: daysAgoIso(20) }),
      ],
      now: NOW,
    });
    expect(fs).toHaveLength(0);
  });

  it("escalates a very old unanswered proposal to urgente", () => {
    const fs = computeFollowUps({
      quotes: [],
      proposals: [proposal({ status: "enviada", sentAt: daysAgoIso(12) })],
      now: NOW,
    });
    expect(fs[0].severity).toBe("urgente");
  });

  it("flags an unpaid payment whose due date is in the past", () => {
    const fs = computeFollowUps({
      quotes: [
        quote({
          status: "aceite",
          date: dayKey(60),
          payments: [{ id: "pay1", kind: "sinal", amount: 500, date: dayKey(-3), paid: false }],
        }),
      ],
      proposals: [],
      now: NOW,
    });
    expect(kinds(fs)).toEqual(["pagamento_em_atraso"]);
    expect(fs[0].duenessDays).toBe(3);
    expect(fs[0].severity).toBe("aviso");
  });

  it("does not flag paid or future-dated payments", () => {
    const fs = computeFollowUps({
      quotes: [
        quote({
          status: "aceite",
          date: dayKey(60),
          payments: [
            { id: "a", kind: "sinal", amount: 500, date: dayKey(-3), paid: true },
            { id: "b", kind: "saldo", amount: 500, date: dayKey(5), paid: false },
          ],
        }),
      ],
      proposals: [],
      now: NOW,
    });
    expect(fs).toHaveLength(0);
  });

  it("flags a pendente lead with no follow-up submitted more than 3 days ago", () => {
    const fs = computeFollowUps({
      quotes: [quote({ status: "pendente", submittedAt: daysAgoIso(4) })],
      proposals: [],
      now: NOW,
    });
    expect(kinds(fs)).toEqual(["lead_sem_contacto"]);
    expect(fs[0].duenessDays).toBe(4);
  });

  it("does not flag a lead that already has a follow-up date or is fresh", () => {
    const fs = computeFollowUps({
      quotes: [
        quote({ id: "a", status: "pendente", submittedAt: daysAgoIso(10), followUpAt: dayKey(2) }),
        quote({ id: "b", status: "pendente", submittedAt: daysAgoIso(2) }),
      ],
      proposals: [],
      now: NOW,
    });
    expect(fs).toHaveLength(0);
  });

  it("flags an accepted event happening within 7 days", () => {
    const fs = computeFollowUps({
      quotes: [quote({ status: "aceite", date: dayKey(5) })],
      proposals: [],
      now: NOW,
    });
    expect(kinds(fs)).toEqual(["semana_evento"]);
    expect(fs[0].duenessDays).toBe(5);
    expect(fs[0].severity).toBe("info");
  });

  it("marks an accepted event within 1 day as urgente and ignores events further out", () => {
    const soon = computeFollowUps({
      quotes: [quote({ status: "aceite", date: dayKey(1) })],
      proposals: [],
      now: NOW,
    });
    expect(soon[0].severity).toBe("urgente");

    const far = computeFollowUps({
      quotes: [quote({ status: "aceite", date: dayKey(20) })],
      proposals: [],
      now: NOW,
    });
    expect(far).toHaveLength(0);
  });

  it("ignores archived quotes entirely", () => {
    const fs = computeFollowUps({
      quotes: [
        quote({
          status: "aceite",
          archived: true,
          date: dayKey(2),
          payments: [{ id: "p", kind: "sinal", amount: 100, date: dayKey(-5), paid: false }],
        }),
      ],
      proposals: [],
      now: NOW,
    });
    expect(fs).toHaveLength(0);
  });

  it("sorts by severity (urgente → aviso → info), then by dueness", () => {
    const fs = computeFollowUps({
      quotes: [
        // aviso · overdue payment 2 days
        quote({
          id: "q-pay",
          name: "Pagamento",
          status: "aceite",
          date: dayKey(60),
          payments: [{ id: "x", kind: "saldo", amount: 100, date: dayKey(-2), paid: false }],
        }),
        // info · event in 5 days
        quote({ id: "q-evt", name: "Evento", status: "aceite", date: dayKey(5) }),
        // urgente · event tomorrow
        quote({ id: "q-urgent", name: "Amanhã", status: "aceite", date: dayKey(1) }),
      ],
      proposals: [
        // aviso · proposal 6 days old
        proposal({ id: "pr", quoteId: "q-pay", status: "enviada", sentAt: daysAgoIso(6) }),
      ],
      now: NOW,
    });

    expect(fs.map((f) => f.severity)).toEqual(["urgente", "aviso", "aviso", "info"]);
    // Within the two avisos, higher dueness (6-day proposal) comes before the 2-day payment.
    const avisos = fs.filter((f) => f.severity === "aviso");
    expect(avisos[0].duenessDays).toBeGreaterThanOrEqual(avisos[1].duenessDays);
  });
});

// Fatura do livro (invoices-store) reduzida ao que o helper puro consome.
const invoice = (i: Partial<InvoiceLike>): InvoiceLike => ({
  id: "inv1",
  number: "FT 2026/0001",
  quoteId: "q1",
  amount: 1000,
  status: "emitida",
  ...i,
});

describe("computeInvoiceFollowUps", () => {
  it("flags an emitida invoice whose dueAt is in the past", () => {
    const fs = computeInvoiceFollowUps({
      invoices: [invoice({ status: "emitida", dueAt: dayKey(-4) })],
      quotes: [quote({})],
      now: NOW,
    });
    expect(kinds(fs)).toEqual(["pagamento_em_atraso"]);
    expect(fs[0].id).toBe("inv-inv1");
    expect(fs[0].duenessDays).toBe(4);
    expect(fs[0].severity).toBe("aviso");
    expect(fs[0].summary).toContain("FT 2026/0001");
  });

  it("escalates an invoice overdue by more than 7 days to urgente", () => {
    const fs = computeInvoiceFollowUps({
      invoices: [invoice({ status: "emitida", dueAt: dayKey(-9) })],
      quotes: [quote({})],
      now: NOW,
    });
    expect(fs[0].severity).toBe("urgente");
  });

  it("does not flag paid, cancelled, future-due, or undated invoices", () => {
    const fs = computeInvoiceFollowUps({
      invoices: [
        invoice({ id: "a", status: "paga", dueAt: dayKey(-4) }),
        invoice({ id: "b", status: "anulada", dueAt: dayKey(-4) }),
        invoice({ id: "c", status: "emitida", dueAt: dayKey(5) }),
        invoice({ id: "d", status: "emitida", dueAt: undefined }),
      ],
      quotes: [quote({})],
      now: NOW,
    });
    expect(fs).toHaveLength(0);
  });

  it("ignores invoices of archived quotes", () => {
    const fs = computeInvoiceFollowUps({
      invoices: [invoice({ status: "emitida", dueAt: dayKey(-4) })],
      quotes: [quote({ archived: true })],
      now: NOW,
    });
    expect(fs).toHaveLength(0);
  });
});

describe("withInvoiceFollowUps", () => {
  it("merges overdue invoices into the base list and sorts by severity", () => {
    const base = computeFollowUps({
      quotes: [quote({ id: "q-evt", name: "Evento", status: "aceite", date: dayKey(5) })],
      proposals: [],
      now: NOW,
    });
    const merged = withInvoiceFollowUps({
      base,
      invoices: [invoice({ quoteId: "q-x", status: "emitida", dueAt: dayKey(-9) })],
      quotes: [
        quote({ id: "q-evt", name: "Evento", status: "aceite", date: dayKey(5) }),
        quote({ id: "q-x", name: "Atrasado" }),
      ],
      now: NOW,
    });
    // urgente (fatura) antes de info (evento).
    expect(merged.map((f) => f.kind)).toEqual(["pagamento_em_atraso", "semana_evento"]);
    expect(merged[0].severity).toBe("urgente");
  });

  it("does not double-count: prefers the ledger overdue over the informal one for the same quote", () => {
    const base = computeFollowUps({
      quotes: [
        quote({
          id: "q1",
          status: "aceite",
          date: dayKey(60),
          payments: [{ id: "pay1", kind: "sinal", amount: 300, date: dayKey(-3), paid: false }],
        }),
      ],
      proposals: [],
      now: NOW,
    });
    // O informal sozinho gera exatamente um item.
    expect(kinds(base)).toEqual(["pagamento_em_atraso"]);

    const merged = withInvoiceFollowUps({
      base,
      invoices: [invoice({ quoteId: "q1", status: "emitida", dueAt: dayKey(-3) })],
      quotes: [quote({ id: "q1", status: "aceite", date: dayKey(60) })],
      now: NOW,
    });
    // Continua a haver só UM atraso para o evento — o do livro (id inv-…).
    const overdue = merged.filter((f) => f.kind === "pagamento_em_atraso");
    expect(overdue).toHaveLength(1);
    expect(overdue[0].id).toBe("inv-inv1");
  });
});
