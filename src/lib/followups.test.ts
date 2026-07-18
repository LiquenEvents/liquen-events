import { describe, it, expect } from "vitest";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { computeFollowUps, type FollowUp } from "./followups";

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
