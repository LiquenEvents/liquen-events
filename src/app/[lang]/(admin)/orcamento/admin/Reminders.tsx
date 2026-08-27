"use client";

import { useMemo } from "react";
import type { Quote, Task } from "@/lib/orcamento/types";
import { eur0 } from "@/lib/money";
import { contractedAmounts } from "@/lib/orcamento/dossier";
import { Card } from "./ui";
import { todayKey } from "./util";
import { useCachedList } from "./useCachedList";

interface Reminder {
  kind: "evento" | "pagamento" | "pedido" | "tarefa" | "seguimento";
  urgent: boolean;
  text: string;
  sub: string;
  quote?: Quote;
}

const DAY = 86400000;

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

/** Derived reminders: upcoming events, overdue payments, stale requests, due tasks. */
export default function Reminders({ quotes, onOpen }: Props) {
  // A mesma leitura das Tarefas e da Agenda, pela chave partilhada do
  // `useCachedList` — este painel e a Agenda são desenhados lado a lado na
  // Visão Geral e pediam a mesma lista duas vezes (três, com o aquecimento
  // ocioso do AdminClient). A cache junta os pedidos em voo numa só viagem.
  const { data: tasks = [] } = useCachedList<Task[]>("tarefas", "/api/tarefas");

  const reminders = useMemo(() => {
    const now = Date.now();
    // O dia LOCAL, nunca o de `toISOString()` (que é UTC): à meia-noite e meia
    // de Verão em Portugal a data UTC ainda é a de ONTEM, e daí saía um evento
    // de hoje dado como passado e um seguimento de hoje anunciado «em atraso».
    // A regra está escrita em `util.ts`.
    const today = todayKey();
    const list: Reminder[] = [];

    for (const q of quotes) {
      // Upcoming events (next 14 days)
      if (q.date && q.date >= today) {
        const days = Math.round((new Date(q.date + "T12:00:00").getTime() - now) / DAY);
        if (days <= 14) {
          list.push({
            kind: "evento",
            urgent: days <= 3,
            quote: q,
            text: `Evento de ${q.name} ${days === 0 ? "é hoje" : days === 1 ? "é amanhã" : `em ${days} dias`}`,
            sub: new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
              day: "numeric",
              month: "long",
            }),
          });
        }
      }
      // Outstanding payments for accepted events
      if (q.status === "aceite" || q.status === "cotado") {
        /**
         * ══════════════════════════════════════════════════════════════════
         * O QUE FALTA RECEBER SOMA-SE TUDO COM IVA — OU NÃO SE SOMA
         * ══════════════════════════════════════════════════════════════════
         *
         * Era `q.quotedPrice ?? q.priceBreakdown?.total`. Os dois ramos NÃO
         * estão na mesma unidade: `quotedPrice` é o «Preço final (SEM IVA)»
         * do estúdio, `priceBreakdown.total` é BRUTO — e os `payments`, que
         * se subtraem a seguir, são brutos sempre.
         *
         * Num casamento de 10 000 € + IVA (12 300 € a receber) com o sinal de
         * 3 690 € já pago, o lembrete dizia «Faltam 6 310 €» quando faltavam
         * 8 610 €. E, pior, calava-se por completo mal os pagamentos
         * chegassem aos 10 000 €: ficavam 2 300 € por cobrar sem lembrete
         * nenhum a dizê-lo.
         *
         * `contractedAmounts` é a mesma cascata que o dossier e o painel de
         * Pagamentos usam, e devolve o bruto explicitamente.
         */
        const total = contractedAmounts(q).gross;
        const paid = (q.payments ?? []).filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
        if (total > 0 && paid < total - 1) {
          const eventSoon = q.date && (new Date(q.date + "T12:00:00").getTime() - now) / DAY < 14;
          list.push({
            kind: "pagamento",
            urgent: !!eventSoon,
            quote: q,
            text: `${q.name} — pagamento em falta`,
            sub: `Faltam ${eur0(total - paid)}`,
          });
        }
      }
      // Stale pending requests (>2 days, no reply)
      if (q.status === "pendente") {
        const age = (now - new Date(q.submittedAt).getTime()) / DAY;
        if (age >= 2 && !(q.messages && q.messages.length)) {
          list.push({
            kind: "pedido",
            urgent: age >= 4,
            quote: q,
            text: `${q.name} aguarda resposta`,
            sub: `Pedido há ${Math.round(age)} dias`,
          });
        }
      }
      // Explicit follow-up date due (or overdue) — the commercial nudge.
      if (
        q.followUpAt &&
        q.followUpAt <= today &&
        q.status !== "aceite" &&
        q.status !== "rejeitado"
      ) {
        const overdue = q.followUpAt < today;
        list.push({
          kind: "seguimento",
          urgent: overdue,
          quote: q,
          text: `Seguir ${q.name}`,
          sub: overdue ? "Seguimento em atraso" : "Seguimento hoje",
        });
      }
      // Sent proposals going cold: quoted 4+ days ago, no follow-up date set,
      // still undecided → nudge to chase before the lead loses interest.
      if (q.status === "cotado" && !q.followUpAt) {
        const since = (now - new Date(q.lastUpdated ?? q.submittedAt).getTime()) / DAY;
        if (since >= 4) {
          list.push({
            kind: "seguimento",
            urgent: since >= 8,
            quote: q,
            text: `${q.name} — proposta sem resposta`,
            sub: `Enviada há ${Math.round(since)} dias · fazer seguimento`,
          });
        }
      }
    }

    for (const t of tasks) {
      if (!t.done && t.dueDate && t.dueDate <= today) {
        const overdue = t.dueDate < today;
        list.push({
          kind: "tarefa",
          urgent: overdue,
          text: t.title,
          sub: overdue ? "Tarefa atrasada" : "Tarefa para hoje",
        });
      }
    }

    return list.sort((a, b) => Number(b.urgent) - Number(a.urgent));
  }, [quotes, tasks]);

  if (reminders.length === 0) return null;

  const icon = (k: Reminder["kind"]) => {
    const cls = "shrink-0";
    if (k === "evento")
      return (
        <svg
          className={cls}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
        </svg>
      );
    if (k === "pagamento")
      return (
        <svg
          className={cls}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <path d="M2 10h20" />
        </svg>
      );
    if (k === "pedido")
      return (
        <svg
          className={cls}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      );
    if (k === "seguimento")
      return (
        <svg
          className={cls}
          width="15"
          height="15"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        >
          <path d="M3 12a9 9 0 1 0 3-6.7L3 8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M3 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    return (
      <svg
        className={cls}
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
      >
        <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round" />
      </svg>
    );
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between px-5 sm:px-6 py-4 border-b border-foreground/[0.07]">
        <p className="bo-eyebrow">Lembretes</p>
        <span className="text-[10px] tabular-nums bg-[#4d6350]/10 text-[#4d6350] rounded-full px-2 py-0.5">
          {reminders.length}
        </span>
      </div>
      <ul className="divide-y divide-foreground/[0.06] max-h-[340px] overflow-y-auto">
        {reminders.map((r, i) => (
          <li key={i}>
            <button
              onClick={() => r.quote && onOpen(r.quote)}
              disabled={!r.quote}
              className={`w-full text-left px-5 sm:px-6 py-3.5 flex items-center gap-3 motion-safe:transition-colors ${r.quote ? "hover:bg-foreground/[0.02] cursor-pointer" : "cursor-default"}`}
            >
              <span style={{ color: r.urgent ? "#8a2a22" : "#9aa36a" }}>{icon(r.kind)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-foreground/70 text-xs truncate font-medium">{r.text}</p>
                <p
                  className={`text-[10px] truncate ${r.urgent ? "text-[#8a2a22]" : "text-foreground/40"}`}
                >
                  {r.sub}
                </p>
              </div>
              {r.urgent && (
                <span className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0 bg-[#8a2a22]/12 text-[#8a2a22]">
                  Urgente
                </span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}
