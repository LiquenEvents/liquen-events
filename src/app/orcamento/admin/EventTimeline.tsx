'use client';

import { useState } from 'react';
import { randomId } from './util';
import type { Quote, TimelineItem } from '../types';

interface Props {
  quote: Quote;
  onChange: (items: TimelineItem[]) => void;
}

// Sensible starting run sheet for a typical event day.
const TEMPLATE: Omit<TimelineItem, 'id'>[] = [
  { time: '09:00', title: 'Montagem e decoração do espaço' },
  { time: '12:00', title: 'Chegada de fornecedores (catering, som)' },
  { time: '16:00', title: 'Receção dos convidados' },
  { time: '17:00', title: 'Cerimónia' },
  { time: '18:30', title: 'Cocktail de boas-vindas' },
  { time: '20:00', title: 'Jantar' },
  { time: '23:00', title: 'Festa / momento de dança' },
  { time: '02:00', title: 'Encerramento e desmontagem' },
];

function sortByTime(items: TimelineItem[]): TimelineItem[] {
  return [...items].sort((a, b) => a.time.localeCompare(b.time));
}

export default function EventTimeline({ quote, onChange }: Props) {
  const [items, setItems] = useState<TimelineItem[]>(quote.timeline ?? []);
  const [time, setTime] = useState('');
  const [title, setTitle] = useState('');
  const [owner, setOwner] = useState('');

  function persist(next: TimelineItem[]) {
    const sorted = sortByTime(next);
    setItems(sorted);
    onChange(sorted);
    fetch(`/api/orcamento/${quote.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeline: sorted }),
    });
  }

  function seed() {
    persist(TEMPLATE.map((t) => ({ ...t, id: randomId() })));
  }
  function add() {
    const t = title.trim();
    if (!t || !time) return;
    persist([...items, { id: randomId(), time, title: t, owner: owner.trim() || undefined }]);
    setTime(''); setTitle(''); setOwner('');
  }
  function remove(id: string) {
    persist(items.filter((i) => i.id !== id));
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">Cronograma do Dia</p>
        {items.length > 0 && <span className="text-foreground/35 text-[10px] tabular-nums">{items.length} momentos</span>}
      </div>

      {items.length === 0 ? (
        <button onClick={seed} className="w-full py-2.5 rounded-md border border-dashed border-foreground/15 text-foreground/40 text-[11px] tracking-[0.2em] uppercase hover:border-moss/40 hover:text-moss transition-colors">
          + Gerar cronograma-base
        </button>
      ) : (
        <div className="relative pl-1 mb-4">
          {/* vertical line */}
          <div className="absolute left-[3.25rem] top-2 bottom-2 w-px bg-foreground/10" />
          <div className="flex flex-col">
            {items.map((i) => (
              <div key={i.id} className="group relative flex items-start gap-3 py-2">
                <span className="w-12 shrink-0 text-right text-moss text-xs font-medium tabular-nums pt-0.5">{i.time}</span>
                <span className="relative z-10 mt-1.5 w-2 h-2 rounded-full bg-moss shrink-0 ring-4 ring-surface" />
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/70 text-sm leading-snug">{i.title}</p>
                  {i.owner && <p className="text-foreground/30 text-[10px] mt-0.5">{i.owner}</p>}
                </div>
                <button onClick={() => remove(i.id)} className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 transition-all shrink-0" aria-label="Remover">×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add row */}
      <div className="flex gap-2">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="bg-surface border border-foreground/15 rounded-md px-2 py-1.5 text-xs text-foreground/70 focus:outline-none focus:border-moss/45 w-[88px]" />
        <input value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Momento…" className="flex-1 bg-surface border border-foreground/15 rounded-md px-3 py-1.5 text-xs text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
        <input value={owner} onChange={(e) => setOwner(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} placeholder="Resp." className="w-20 bg-surface border border-foreground/15 rounded-md px-2 py-1.5 text-xs text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
        <button onClick={add} disabled={!title.trim() || !time} className="px-3 py-1.5 rounded-md border border-foreground/15 text-foreground/45 text-xs hover:border-moss/40 hover:text-moss transition-colors disabled:opacity-40">+</button>
      </div>
    </div>
  );
}
