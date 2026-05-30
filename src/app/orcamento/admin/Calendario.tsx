'use client';

import { useMemo, useState } from 'react';
import type { Quote } from '../types';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from '../data';

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const STATUS_COLOR: Record<string, string> = {
  pendente: '#8a8a82', em_revisao: '#6a9c7a', cotado: '#4a7c59', aceite: '#2d5c3e', rejeitado: '#5a5a55',
};

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? 'Evento';
}

/** Build and download an .ics calendar with every dated event. */
function exportIcs(quotes: Quote[]) {
  const dated = quotes.filter((q) => q.date);
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Liquen Events//Back Office//PT',
    'CALSCALE:GREGORIAN',
  ];
  for (const q of dated) {
    const d = q.date.replace(/-/g, '');
    const title = `${eventTypeLabel(q)} — ${q.name}`.replace(/[,;\\]/g, ' ');
    const desc = [q.location && `Local: ${q.location}`, q.guests && `${q.guests} convidados`, q.phone && `Tel: ${q.phone}`]
      .filter(Boolean).join(' \\n ');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${q.id}@liquen-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${title}`,
      desc ? `DESCRIPTION:${desc}` : '',
      'END:VEVENT'
    );
  }
  lines.push('END:VCALENDAR');
  const blob = new Blob([lines.filter(Boolean).join('\r\n')], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'liquen-eventos.ics';
  a.click();
  URL.revokeObjectURL(url);
  void pad;
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

export default function Calendario({ quotes, onOpen }: Props) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });

  const byDay = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes) {
      if (!q.date) continue;
      const key = q.date; // yyyy-mm-dd
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    return map;
  }, [quotes]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return quotes.filter((q) => q.date && q.date >= today).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6);
  }, [quotes]);

  const monthEventCount = quotes.filter((q) => q.date && q.date.startsWith(`${year}-${String(month + 1).padStart(2, '0')}`)).length;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
      <div className="border border-foreground/10 rounded-md bg-surface-raised/30 p-5">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h3 className="text-foreground/80 font-bold text-lg" style={{ fontFamily: 'var(--font-playfair)' }}>{MONTHS[month]} {year}</h3>
            <p className="text-foreground/30 text-[10px] tracking-[0.2em] uppercase mt-0.5">{monthEventCount} evento{monthEventCount !== 1 ? 's' : ''}</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => exportIcs(quotes)} title="Exportar para calendário (.ics)" className="px-3 h-8 mr-1 rounded-md border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.2em] uppercase hover:text-moss hover:border-moss/40 transition-colors">
              Exportar
            </button>
            <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="w-8 h-8 rounded-md border border-foreground/12 text-foreground/40 hover:text-foreground/70 hover:border-foreground/30 transition-colors">‹</button>
            <button onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }} className="px-3 h-8 rounded-md border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.2em] uppercase hover:text-foreground/70 hover:border-foreground/30 transition-colors">Hoje</button>
            <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="w-8 h-8 rounded-md border border-foreground/12 text-foreground/40 hover:text-foreground/70 hover:border-foreground/30 transition-colors">›</button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => <div key={w} className="text-center text-foreground/25 text-[9px] tracking-[0.2em] uppercase py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const events = byDay.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <div key={i} className={`min-h-[64px] rounded-md border p-1.5 ${isToday ? 'border-moss/50 bg-moss/5' : 'border-foreground/8 bg-surface/30'}`}>
                <span className={`text-[10px] tabular-nums ${isToday ? 'text-moss font-bold' : 'text-foreground/35'}`}>{d}</span>
                <div className="flex flex-col gap-0.5 mt-0.5">
                  {events.slice(0, 2).map((q) => (
                    <button key={q.id} onClick={() => onOpen(q)} title={`${q.name} — ${eventTypeLabel(q)}`}
                      className="text-left text-[9px] leading-tight truncate px-1 py-0.5 rounded-sm hover:opacity-80 transition-opacity"
                      style={{ background: `${STATUS_COLOR[q.status]}26`, color: STATUS_COLOR[q.status] }}>
                      {q.name.split(' ')[0]}
                    </button>
                  ))}
                  {events.length > 2 && <span className="text-foreground/30 text-[9px] px-1">+{events.length - 2}</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Upcoming */}
      <div className="border border-foreground/10 rounded-md bg-surface-raised/30">
        <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase px-5 py-4 border-b border-foreground/8">Próximos eventos</p>
        <div className="divide-y divide-foreground/6">
          {upcoming.map((q) => (
            <button key={q.id} onClick={() => onOpen(q)} className="w-full text-left px-5 py-3.5 hover:bg-moss/5 transition-colors">
              <div className="flex items-center gap-3">
                <div className="text-center shrink-0 w-10">
                  <p className="text-moss text-lg font-bold leading-none" style={{ fontFamily: 'var(--font-playfair)' }}>{new Date(q.date + 'T12:00:00').getDate()}</p>
                  <p className="text-foreground/30 text-[9px] uppercase">{MONTHS[new Date(q.date + 'T12:00:00').getMonth()].slice(0, 3)}</p>
                </div>
                <div className="min-w-0">
                  <p className="text-foreground/65 text-xs font-medium truncate">{q.name}</p>
                  <p className="text-foreground/30 text-[11px] truncate">{eventTypeLabel(q)} · {q.guests} pax</p>
                </div>
              </div>
            </button>
          ))}
          {upcoming.length === 0 && <p className="text-foreground/25 text-sm text-center py-12">Sem eventos agendados.</p>}
        </div>
      </div>
    </div>
  );
}
