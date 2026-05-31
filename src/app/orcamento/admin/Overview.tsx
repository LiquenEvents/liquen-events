'use client';

import { useMemo } from 'react';
import type { Quote, QuoteStatus } from '../types';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from '../data';
import Reminders from './Reminders';
import Agenda from './Agenda';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente:   { label: 'Pendente',   color: '#8a8a82' },
  em_revisao: { label: 'Em Revisão', color: '#6a9c7a' },
  cotado:     { label: 'Cotado',     color: '#4a7c59' },
  aceite:     { label: 'Aceite',     color: '#2d5c3e' },
  rejeitado:  { label: 'Rejeitado',  color: '#5a5a55' },
};

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? 'Outro';
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 36e5;
  if (h < 1) return `há ${Math.max(1, Math.round(diff / 6e4))}min`;
  if (h < 24) return `há ${Math.round(h)}h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'ontem' : `há ${d}d`;
}

function Spark({ data }: { data: number[] }) {
  const max = Math.max(1, ...data);
  return (
    <div className="flex items-end gap-1 h-10">
      {data.map((v, i) => (
        <div key={i} className="flex-1 bg-moss/25 rounded-sm" style={{ height: `${Math.max(4, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
}

interface Props {
  quotes: Quote[];
  userName: string;
  onOpen: (q: Quote) => void;
  onGoStats: () => void;
}

export default function Overview({ quotes, userName, onOpen, onGoStats }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now); weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    let thisMonth = 0, pipeline = 0, won = 0, outstanding = 0;
    let eventsToday = 0, eventsThisWeek = 0;
    const byStatus: Record<string, number> = {};
    const months = Array.from({ length: 6 }, () => 0);

    for (const q of quotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      if (q.status === 'cotado' && q.quotedPrice) pipeline += q.quotedPrice;
      if (q.status === 'aceite' && q.quotedPrice) won += q.quotedPrice;
      for (const p of q.payments ?? []) if (!p.paid) outstanding += p.amount;
      if (q.date === todayKey) eventsToday++;
      if (q.date && q.date >= todayKey && q.date <= weekEndKey) eventsThisWeek++;
      const sd = new Date(q.submittedAt);
      if (sd.getFullYear() === now.getFullYear() && sd.getMonth() === now.getMonth()) thisMonth++;
      const monthsBack = (now.getFullYear() - sd.getFullYear()) * 12 + now.getMonth() - sd.getMonth();
      if (monthsBack >= 0 && monthsBack < 6) months[5 - monthsBack]++;
    }

    const needAction = quotes
      .filter((q) => q.status === 'pendente' || q.status === 'em_revisao')
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));

    const recent = [...quotes]
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
      .slice(0, 6);

    const accepted = byStatus['aceite'] ?? 0;
    const decided = accepted + (byStatus['rejeitado'] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;

    return { thisMonth, pipeline, won, outstanding, eventsToday, eventsThisWeek, months, needAction, recent, conversion, total: quotes.length };
  }, [quotes]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Bom dia' : hour < 20 ? 'Boa tarde' : 'Boa noite';

  // Smart headline: surface the most pressing things for today.
  const headline = (() => {
    const bits: string[] = [];
    if (data.eventsToday > 0) bits.push(`${data.eventsToday} evento${data.eventsToday !== 1 ? 's' : ''} hoje`);
    else if (data.eventsThisWeek > 0) bits.push(`${data.eventsThisWeek} evento${data.eventsThisWeek !== 1 ? 's' : ''} esta semana`);
    if (data.needAction.length > 0) bits.push(`${data.needAction.length} pedido${data.needAction.length !== 1 ? 's' : ''} a precisar de atenção`);
    if (bits.length === 0) return 'Tudo em dia. Nada urgente por agora.';
    return `Tem ${bits.join(' e ')}.`;
  })();

  return (
    <div className="flex flex-col gap-8">
      {/* Greeting */}
      <div>
        <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
          {new Date().toLocaleDateString('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
        <h2 className="text-foreground font-bold" style={{ fontFamily: 'var(--font-playfair)', fontSize: 'clamp(26px, 3.5vw, 40px)' }}>
          {greeting}, {userName}.
        </h2>
        <p className="text-foreground/40 text-sm mt-2">{headline}</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { v: String(data.total), l: 'Pedidos totais', accent: true },
          { v: String(data.thisMonth), l: 'Este mês' },
          { v: eur(data.pipeline), l: 'Em proposta' },
          { v: eur(data.outstanding), l: 'A receber' },
          { v: eur(data.won), l: 'Ganho', accent: true },
        ].map((k) => (
          <div key={k.l} className="border border-foreground/10 rounded-md p-5 bg-surface-raised/40">
            <p className={`font-bold leading-none mb-2 ${k.accent ? 'text-moss' : 'text-foreground/80'}`}
               style={{ fontFamily: 'var(--font-playfair)', fontSize: 'clamp(20px, 2.4vw, 30px)' }}>
              {k.v}
            </p>
            <p className="text-foreground/30 text-[9px] tracking-[0.25em] uppercase">{k.l}</p>
          </div>
        ))}
      </div>

      {/* Reminders */}
      <Reminders quotes={quotes} onOpen={onOpen} />

      {/* Agenda — combines events, calendar entries, tasks & payments due */}
      <Agenda quotes={quotes} onOpen={onOpen} />

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-6">
        {/* Needs attention */}
        <div className="border border-foreground/10 rounded-md bg-surface-raised/30">
          <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/8">
            <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">Precisam de atenção</p>
            {data.needAction.length > 0 && (
              <span className="text-moss text-[10px] tabular-nums">{data.needAction.length}</span>
            )}
          </div>
          <div className="divide-y divide-foreground/6 max-h-[360px] overflow-y-auto">
            {data.needAction.length === 0 && (
              <p className="text-foreground/25 text-sm text-center py-12">Sem pedidos pendentes. ✓</p>
            )}
            {data.needAction.slice(0, 8).map((q) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className="w-full text-left px-5 py-3.5 hover:bg-moss/5 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground/70 text-sm truncate">{q.name}</p>
                  <p className="text-foreground/30 text-xs truncate">{eventTypeLabel(q)} · {q.guests} pax</p>
                </div>
                <div className="text-right shrink-0">
                  <span className="text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm"
                        style={{ background: `${STATUS_META[q.status].color}22`, color: STATUS_META[q.status].color }}>
                    {STATUS_META[q.status].label}
                  </span>
                  <p className="text-foreground/22 text-[10px] mt-1">{timeAgo(q.submittedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Snapshot */}
        <div className="flex flex-col gap-6">
          <div className="border border-foreground/10 rounded-md bg-surface-raised/30 p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">Últimos 6 meses</p>
              <button onClick={onGoStats} className="text-moss/70 hover:text-moss text-[10px] tracking-[0.2em] uppercase transition-colors">
                Ver tudo →
              </button>
            </div>
            <Spark data={data.months} />
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-foreground/8">
              <span className="text-foreground/35 text-xs">Taxa de conversão</span>
              <span className="text-foreground/70 text-sm font-medium">{data.conversion}%</span>
            </div>
          </div>

          <div className="border border-foreground/10 rounded-md bg-surface-raised/30">
            <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase px-5 py-4 border-b border-foreground/8">
              Atividade recente
            </p>
            <div className="divide-y divide-foreground/6">
              {data.recent.map((q) => (
                <button
                  key={q.id}
                  onClick={() => onOpen(q)}
                  className="w-full text-left px-5 py-3 hover:bg-moss/5 transition-colors flex items-center justify-between gap-3"
                >
                  <span className="text-foreground/55 text-xs truncate">{q.name}</span>
                  <span className="text-foreground/22 text-[10px] shrink-0">{timeAgo(q.submittedAt)}</span>
                </button>
              ))}
              {data.recent.length === 0 && <p className="text-foreground/25 text-sm text-center py-10">Sem atividade.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
