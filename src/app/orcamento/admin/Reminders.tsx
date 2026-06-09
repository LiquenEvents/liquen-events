"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote, Task } from "../types";

interface Reminder {
  kind: "evento" | "pagamento" | "pedido" | "tarefa";
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
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/tarefas", { cache: "no-store" });
        if (res.ok) setTasks(await res.json());
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const reminders = useMemo(() => {
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
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
        const total = q.quotedPrice ?? q.priceBreakdown?.total ?? 0;
        const paid = (q.payments ?? []).filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
        if (total > 0 && paid < total - 1) {
          const eventSoon = q.date && (new Date(q.date + "T12:00:00").getTime() - now) / DAY < 14;
          list.push({
            kind: "pagamento",
            urgent: !!eventSoon,
            quote: q,
            text: `${q.name} — pagamento em falta`,
            sub: `Faltam ${new Intl.NumberFormat("pt-PT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(total - paid)}`,
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
    <div className="bo-card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/[0.07]">
        <p className="bo-eyebrow">Lembretes</p>
        <span className="text-[10px] tabular-nums bg-[#1b2119] text-white/80 rounded-full px-2 py-0.5">
          {reminders.length}
        </span>
      </div>
      <div className="divide-y divide-foreground/[0.06] max-h-[340px] overflow-y-auto">
        {reminders.map((r, i) => (
          <button
            key={i}
            onClick={() => r.quote && onOpen(r.quote)}
            disabled={!r.quote}
            className={`w-full text-left px-5 py-3 flex items-center gap-3 transition-colors ${r.quote ? "hover:bg-foreground/[0.02] cursor-pointer" : "cursor-default"}`}
          >
            <span style={{ color: r.urgent ? "#b5654a" : "#9aa36a" }}>{icon(r.kind)}</span>
            <div className="min-w-0 flex-1">
              <p className="text-foreground/68 text-xs truncate font-medium">{r.text}</p>
              <p
                className={`text-[10px] truncate ${r.urgent ? "text-[#b5654a]" : "text-foreground/30"}`}
              >
                {r.sub}
              </p>
            </div>
            {r.urgent && <span className="w-1.5 h-1.5 rounded-full bg-[#b5654a] shrink-0" />}
          </button>
        ))}
      </div>
    </div>
  );
}
