'use client';

import { useMemo, useState } from 'react';
import type { Quote, QuoteStatus } from '../types';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from '../data';
import { useToast } from './Toast';

const COLUMNS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: 'pendente', label: 'Novos', color: '#8a8a82' },
  { id: 'em_revisao', label: 'Em Revisão', color: '#6a9c7a' },
  { id: 'cotado', label: 'Proposta Enviada', color: '#4a7c59' },
  { id: 'aceite', label: 'Ganhos', color: '#2d5c3e' },
  { id: 'rejeitado', label: 'Perdidos', color: '#5a5a55' },
];

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? 'Evento';
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
  onStatusChange: (id: string, status: QuoteStatus) => void;
}

export default function Kanban({ quotes, onOpen, onStatusChange }: Props) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<QuoteStatus | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<string, Quote[]> = {};
    for (const c of COLUMNS) map[c.id] = [];
    for (const q of quotes) (map[q.status] ??= []).push(q);
    return map;
  }, [quotes]);

  async function drop(status: QuoteStatus) {
    setOverCol(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const q = quotes.find((x) => x.id === id);
    if (!q || q.status === status) return;

    onStatusChange(id, status); // optimistic
    try {
      const res = await fetch(`/api/orcamento/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast(`${q.name} → ${COLUMNS.find((c) => c.id === status)?.label}`, 'success');
    } catch {
      onStatusChange(id, q.status); // revert
      toast('Não foi possível atualizar', 'error');
    }
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scroll-hide">
      {COLUMNS.map((col) => {
        const items = byStatus[col.id] ?? [];
        const value = items.reduce((s, q) => s + (q.quotedPrice ?? 0), 0);
        return (
          <div
            key={col.id}
            onDragOver={(e) => { e.preventDefault(); setOverCol(col.id); }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => drop(col.id)}
            className={`flex-shrink-0 w-[260px] rounded-xl border transition-colors ${
              overCol === col.id ? 'border-moss/50 bg-moss/[0.04]' : 'border-foreground/8 bg-surface-raised/30'
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-foreground/8">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                <span className="text-foreground/65 text-xs tracking-[0.15em] uppercase">{col.label}</span>
              </div>
              <span className="text-foreground/30 text-[10px] tabular-nums">{items.length}</span>
            </div>

            <div className="p-2 flex flex-col gap-2 min-h-[120px] max-h-[calc(100vh-18rem)] overflow-y-auto">
              {items.map((q) => (
                <div
                  key={q.id}
                  draggable
                  onDragStart={() => setDragId(q.id)}
                  onDragEnd={() => { setDragId(null); setOverCol(null); }}
                  onClick={() => onOpen(q)}
                  className={`group cursor-grab active:cursor-grabbing rounded-lg border border-foreground/10 bg-surface p-3 transition-all hover:border-foreground/25 ${
                    dragId === q.id ? 'opacity-40' : ''
                  }`}
                >
                  <p className="text-foreground/75 text-sm font-medium truncate">{q.name}</p>
                  <p className="text-foreground/30 text-[11px] truncate mt-0.5">{eventTypeLabel(q)} · {q.guests} pax</p>
                  <div className="flex items-center justify-between mt-2.5">
                    {q.quotedPrice ? (
                      <span className="text-moss text-xs font-medium">{eur(q.quotedPrice)}</span>
                    ) : <span className="text-foreground/20 text-[10px]">sem valor</span>}
                    {q.date && (
                      <span className="text-foreground/25 text-[10px]">
                        {new Date(q.date + 'T12:00:00').toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <p className="text-foreground/20 text-[11px] text-center py-6">Arraste pedidos para aqui</p>
              )}
            </div>

            {value > 0 && (
              <div className="px-4 py-2.5 border-t border-foreground/8 text-right">
                <span className="text-foreground/40 text-[11px]">{eur(value)}</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
