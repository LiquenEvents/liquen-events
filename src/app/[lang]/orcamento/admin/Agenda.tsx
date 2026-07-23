"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote, CalendarEvent, Task } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { eur0 as eur } from "@/lib/money";
import { todayKey } from "./util";
import { Card, EmptyState } from "./ui";

const DAYS_AHEAD = 14;

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

type ItemKind = "evento" | "agenda" | "tarefa" | "pagamento" | "seguimento";

interface AgendaItem {
  date: string;
  time?: string;
  title: string;
  sub?: string;
  kind: ItemKind;
  color: string;
  onClick?: () => void;
}

const KIND_LABEL: Record<ItemKind, string> = {
  evento: "Evento",
  agenda: "Agenda",
  tarefa: "Tarefa",
  pagamento: "Pagamento",
  seguimento: "Seguimento",
};

const KIND_COLOR: Record<ItemKind, string> = {
  evento: "#7c854b",
  agenda: "#7a8caa",
  tarefa: "#b5654a",
  pagamento: "#b5894a",
  seguimento: "#637a5f",
};

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

export default function Agenda({ quotes, onOpen }: Props) {
  const [calEvents, setCalEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/calendario", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
      fetch("/api/tarefas", { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : []))
        .catch(() => []),
    ]).then(([c, t]) => {
      if (Array.isArray(c)) setCalEvents(c);
      if (Array.isArray(t)) setTasks(t);
    });
  }, []);

  const { byDay, days } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // Local `YYYY-MM-DD` keys — deriving these from `toISOString()` (UTC) shifts
    // the window by a day in +offset zones (e.g. Portugal in summer, UTC+1), so
    // yesterday's items leak in and "Hoje" lands on the wrong header.
    const pad = (n: number) => String(n).padStart(2, "0");
    const localKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const todayKey = localKey(today);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + DAYS_AHEAD);
    const horizonKey = localKey(horizon);
    const inRange = (d?: string) => !!d && d >= todayKey && d <= horizonKey;

    const items: AgendaItem[] = [];

    for (const q of quotes) {
      if (inRange(q.date)) {
        items.push({
          date: q.date,
          title: q.name,
          sub: `${eventTypeLabel(q)} · ${q.guests} convidados`,
          kind: "evento",
          color: "#7c854b",
          onClick: () => onOpen(q),
        });
      }
      for (const p of q.payments ?? []) {
        if (!p.paid && inRange(p.date)) {
          items.push({
            date: p.date,
            title: `${eur(p.amount)} — ${q.name}`,
            sub: p.kind,
            kind: "pagamento",
            color: "#b5894a",
            onClick: () => onOpen(q),
          });
        }
      }
      // Lead follow-ups scheduled within the window (skip closed deals).
      if (inRange(q.followUpAt) && q.status !== "aceite" && q.status !== "rejeitado") {
        items.push({
          date: q.followUpAt!,
          title: `Seguir ${q.name}`,
          sub: eventTypeLabel(q),
          kind: "seguimento",
          color: KIND_COLOR.seguimento,
          onClick: () => onOpen(q),
        });
      }
    }
    for (const e of calEvents) {
      if (inRange(e.date)) {
        items.push({
          date: e.date,
          time: e.time,
          title: e.title,
          sub: e.note,
          kind: "agenda",
          color: "#7a8caa",
        });
      }
    }
    for (const t of tasks) {
      if (!t.done && inRange(t.dueDate)) {
        items.push({
          date: t.dueDate!,
          title: t.title,
          sub: t.assignee ? `Resp.: ${t.assignee}` : t.area,
          kind: "tarefa",
          color: "#b5654a",
        });
      }
    }

    items.sort(
      (a, b) => a.date.localeCompare(b.date) || (a.time ?? "").localeCompare(b.time ?? ""),
    );

    const map = new Map<string, AgendaItem[]>();
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return { byDay: map, days: Array.from(map.keys()) };
  }, [quotes, calEvents, tasks, onOpen]);

  const todayStr = todayKey();
  function dayLabel(key: string): string {
    const d = new Date(key + "T12:00:00");
    const diff = Math.round(
      (+new Date(key + "T12:00:00") - +new Date(todayStr + "T12:00:00")) / 864e5,
    );
    const rel = diff === 0 ? "Hoje" : diff === 1 ? "Amanhã" : "";
    const full = d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
    return rel ? `${rel} · ${full}` : full;
  }

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex items-center justify-between gap-4 px-5 sm:px-6 py-4 border-b border-foreground/[0.07]">
        <p className="bo-eyebrow">Agenda · próximos {DAYS_AHEAD} dias</p>
        <div className="flex items-center gap-3">
          {(["evento", "agenda", "tarefa", "pagamento", "seguimento"] as ItemKind[]).map((k) => (
            <span
              key={k}
              className="hidden sm:flex items-center gap-1.5 text-foreground/40 text-[9px] uppercase tracking-wider"
            >
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: KIND_COLOR[k] }} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {days.length === 0 ? (
          <EmptyState
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <rect x="3" y="4" width="18" height="17" rx="2" />
                <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
              </svg>
            }
            title="Agenda tranquila"
            description={`Nada agendado para os próximos ${DAYS_AHEAD} dias. Os eventos, tarefas e pagamentos aparecem aqui à medida que se aproximam.`}
          />
        ) : (
          days.map((key) => (
            <div key={key} className="border-b border-foreground/[0.06] last:border-0">
              <p
                className={`px-5 sm:px-6 pt-4 pb-1.5 text-[10px] tracking-[0.2em] uppercase capitalize font-medium ${key === todayStr ? "text-[#4d6350]" : "text-foreground/40"}`}
              >
                {dayLabel(key)}
              </p>
              <div className="pb-2">
                {byDay.get(key)!.map((it, i) => {
                  const Wrap = it.onClick ? "button" : "div";
                  return (
                    <Wrap
                      key={i}
                      onClick={it.onClick}
                      className={`w-full text-left px-5 sm:px-6 py-2.5 flex items-center gap-3 ${it.onClick ? "hover:bg-foreground/[0.02] motion-safe:transition-colors cursor-pointer" : ""}`}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: it.color }}
                      />
                      {it.time && (
                        <span className="text-foreground/45 text-[11px] tabular-nums shrink-0 w-10">
                          {it.time}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground/70 text-sm truncate">{it.title}</p>
                        {it.sub && (
                          <p className="text-foreground/40 text-[11px] truncate capitalize">
                            {it.sub}
                          </p>
                        )}
                      </div>
                      <span
                        className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0"
                        style={{ background: `${it.color}1f`, color: it.color }}
                      >
                        {KIND_LABEL[it.kind]}
                      </span>
                    </Wrap>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
