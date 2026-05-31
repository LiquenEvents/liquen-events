'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Quote, CalendarEvent, Task } from '../types';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from '../data';

const DAYS_AHEAD = 14;

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? 'Evento';
}

type ItemKind = 'evento' | 'agenda' | 'tarefa' | 'pagamento';

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
  evento: 'Evento',
  agenda: 'Agenda',
  tarefa: 'Tarefa',
  pagamento: 'Pagamento',
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
      fetch('/api/calendario', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch('/api/tarefas', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]).then(([c, t]) => {
      if (Array.isArray(c)) setCalEvents(c);
      if (Array.isArray(t)) setTasks(t);
    });
  }, []);

  const { byDay, days } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayKey = today.toISOString().slice(0, 10);
    const horizon = new Date(today);
    horizon.setDate(horizon.getDate() + DAYS_AHEAD);
    const horizonKey = horizon.toISOString().slice(0, 10);
    const inRange = (d?: string) => !!d && d >= todayKey && d <= horizonKey;

    const items: AgendaItem[] = [];

    for (const q of quotes) {
      if (inRange(q.date)) {
        items.push({ date: q.date, title: q.name, sub: `${eventTypeLabel(q)} · ${q.guests} pax`, kind: 'evento', color: '#4a7c59', onClick: () => onOpen(q) });
      }
      for (const p of q.payments ?? []) {
        if (!p.paid && inRange(p.date)) {
          items.push({ date: p.date, title: `${eur(p.amount)} — ${q.name}`, sub: p.kind, kind: 'pagamento', color: '#b5894a', onClick: () => onOpen(q) });
        }
      }
    }
    for (const e of calEvents) {
      if (inRange(e.date)) {
        items.push({ date: e.date, time: e.time, title: e.title, sub: e.note, kind: 'agenda', color: '#7a8caa' });
      }
    }
    for (const t of tasks) {
      if (!t.done && inRange(t.dueDate)) {
        items.push({ date: t.dueDate!, title: t.title, sub: t.assignee ? `Resp.: ${t.assignee}` : t.area, kind: 'tarefa', color: '#b5654a' });
      }
    }

    items.sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''));

    const map = new Map<string, AgendaItem[]>();
    for (const it of items) {
      if (!map.has(it.date)) map.set(it.date, []);
      map.get(it.date)!.push(it);
    }
    return { byDay: map, days: Array.from(map.keys()) };
  }, [quotes, calEvents, tasks, onOpen]);

  const todayKey = new Date().toISOString().slice(0, 10);
  function dayLabel(key: string): string {
    const d = new Date(key + 'T12:00:00');
    const diff = Math.round((+new Date(key + 'T12:00:00') - +new Date(todayKey + 'T12:00:00')) / 864e5);
    const rel = diff === 0 ? 'Hoje' : diff === 1 ? 'Amanhã' : '';
    const full = d.toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
    return rel ? `${rel} · ${full}` : full;
  }

  return (
    <div className="border border-foreground/10 rounded-md bg-surface-raised/30">
      <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/8">
        <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">Agenda · próximos {DAYS_AHEAD} dias</p>
        <div className="flex items-center gap-3">
          {(['evento', 'agenda', 'tarefa', 'pagamento'] as ItemKind[]).map((k) => (
            <span key={k} className="hidden sm:flex items-center gap-1.5 text-foreground/30 text-[9px] uppercase tracking-wider">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: { evento: '#4a7c59', agenda: '#7a8caa', tarefa: '#b5654a', pagamento: '#b5894a' }[k] }} />
              {KIND_LABEL[k]}
            </span>
          ))}
        </div>
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {days.length === 0 ? (
          <p className="text-foreground/25 text-sm text-center py-12">Nada agendado para os próximos {DAYS_AHEAD} dias.</p>
        ) : (
          days.map((key) => (
            <div key={key} className="border-b border-foreground/6 last:border-0">
              <p className={`px-5 pt-3 pb-1.5 text-[10px] tracking-[0.2em] uppercase capitalize ${key === todayKey ? 'text-moss' : 'text-foreground/35'}`}>
                {dayLabel(key)}
              </p>
              <div className="pb-2">
                {byDay.get(key)!.map((it, i) => {
                  const Wrap = it.onClick ? 'button' : 'div';
                  return (
                    <Wrap
                      key={i}
                      onClick={it.onClick}
                      className={`w-full text-left px-5 py-2 flex items-center gap-3 ${it.onClick ? 'hover:bg-moss/5 transition-colors cursor-pointer' : ''}`}
                    >
                      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: it.color }} />
                      {it.time && <span className="text-foreground/40 text-[11px] tabular-nums shrink-0 w-10">{it.time}</span>}
                      <div className="min-w-0 flex-1">
                        <p className="text-foreground/70 text-sm truncate">{it.title}</p>
                        {it.sub && <p className="text-foreground/30 text-[11px] truncate capitalize">{it.sub}</p>}
                      </div>
                      <span className="text-[9px] tracking-[0.12em] uppercase px-1.5 py-0.5 rounded-sm shrink-0" style={{ background: `${it.color}1f`, color: it.color }}>
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
    </div>
  );
}
