import type { Proposal, Quote } from "@/lib/orcamento/types";

/**
 * Rule-based follow-up detection for the back office. Pure and server-safe
 * (no React, no I/O, no `Date.now()` — the caller passes `now`) so it can run
 * inside an API route, the daily cron, or a unit test unchanged.
 *
 * This does NOT duplicate the daily digest (api/cron/reminders): the digest
 * counts things for a single push, whereas this produces an itemised, sorted
 * action list the team reviews and acts on one by one.
 */
export interface FollowUp {
  id: string;
  kind: "proposta_sem_resposta" | "pagamento_em_atraso" | "lead_sem_contacto" | "semana_evento";
  quoteId: string;
  clientName: string;
  summary: string;
  /** Whole days the item has been "due": days elapsed for overdue kinds, days
      remaining for an upcoming event. Always non-negative. */
  duenessDays: number;
  severity: "info" | "aviso" | "urgente";
}

const DAY = 86_400_000;

/** urgente first, then aviso, then info. */
const SEVERITY_RANK: Record<FollowUp["severity"], number> = {
  urgente: 0,
  aviso: 1,
  info: 2,
};

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

/** UTC day key (yyyy-mm-dd) for an epoch millisecond value. */
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Midnight-UTC epoch for a yyyy-mm-dd string. */
const parseDay = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Whole days elapsed since an ISO timestamp (negative if in the future). */
const daysSince = (now: number, iso: string) => Math.floor((now - new Date(iso).getTime()) / DAY);

export function computeFollowUps(input: {
  quotes: Quote[];
  proposals: Proposal[];
  now: number;
}): FollowUp[] {
  const { quotes, proposals, now } = input;
  const todayKey = dayKey(now);
  const todayMs = parseDay(todayKey);
  const byId = new Map(quotes.map((q) => [q.id, q]));
  const out: FollowUp[] = [];

  // ── Rule 1 · Proposal sent and unanswered for more than 5 days ──
  for (const p of proposals) {
    if (p.status !== "enviada" || p.respondedAt) continue;
    const sent = p.sentAt ?? p.createdAt;
    if (!sent) continue;
    const days = daysSince(now, sent);
    if (days <= 5) continue;
    out.push({
      id: `prop-${p.id}`,
      kind: "proposta_sem_resposta",
      quoteId: p.quoteId,
      clientName: p.clientName || byId.get(p.quoteId)?.name || "Cliente",
      summary: `Proposta enviada sem resposta há ${days} dias`,
      duenessDays: days,
      severity: days > 10 ? "urgente" : "aviso",
    });
  }

  // Quote-based rules ignore archived (soft-deleted) leads.
  for (const q of quotes) {
    if (q.archived) continue;

    // ── Rule 2 · Unpaid payment whose due date is in the past ──
    for (const pay of q.payments ?? []) {
      if (pay.paid || !pay.date || pay.date >= todayKey) continue;
      const days = Math.floor((todayMs - parseDay(pay.date)) / DAY);
      out.push({
        id: `pay-${q.id}-${pay.id}`,
        kind: "pagamento_em_atraso",
        quoteId: q.id,
        clientName: q.name,
        summary: `Pagamento de ${eur(pay.amount)} em atraso há ${days} dias`,
        duenessDays: days,
        severity: days > 7 ? "urgente" : "aviso",
      });
    }

    // ── Rule 3 · Lead (pendente) with no follow-up set, submitted 3+ days ago ──
    if (q.status === "pendente" && !q.followUpAt) {
      const days = daysSince(now, q.submittedAt);
      if (days > 3) {
        out.push({
          id: `lead-${q.id}`,
          kind: "lead_sem_contacto",
          quoteId: q.id,
          clientName: q.name,
          summary: `Lead por contactar há ${days} dias`,
          duenessDays: days,
          severity: days > 7 ? "urgente" : "aviso",
        });
      }
    }

    // ── Rule 4 · Accepted/booked event happening within 7 days ──
    if (q.status === "aceite" && q.date && q.date >= todayKey) {
      const until = Math.floor((parseDay(q.date) - todayMs) / DAY);
      if (until <= 7) {
        out.push({
          id: `evt-${q.id}`,
          kind: "semana_evento",
          quoteId: q.id,
          clientName: q.name,
          summary:
            until === 0
              ? "Evento é hoje — confirmar detalhes finais"
              : until === 1
                ? "Evento é amanhã — confirmar detalhes finais"
                : `Evento daqui a ${until} dias — confirmar detalhes finais`,
          duenessDays: until,
          severity: until <= 1 ? "urgente" : until <= 3 ? "aviso" : "info",
        });
      }
    }
  }

  // Sort by severity, then by dueness (most days first) as a tie-breaker.
  return out.sort(
    (a, b) =>
      SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.duenessDays - a.duenessDays,
  );
}
