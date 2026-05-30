'use client';

import { useMemo } from 'react';
import type { Quote, QuoteStatus } from '../types';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from '../data';

const eur = (n: number) =>
  new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente:   { label: 'Pendente',   color: '#8a8a82' },
  em_revisao: { label: 'Em Revisão', color: '#6a9c7a' },
  cotado:     { label: 'Cotado',     color: '#4a7c59' },
  aceite:     { label: 'Aceite',     color: '#2d5c3e' },
  rejeitado:  { label: 'Rejeitado',  color: '#5a5a55' },
};

const MONTHS_PT = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? 'Outro';
}

// ── KPI card ──
function Kpi({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="border border-foreground/10 rounded-sm p-5 bg-surface-raised/40">
      <p
        className={`font-bold leading-none mb-2 ${accent ? 'text-moss' : 'text-foreground/80'}`}
        style={{ fontFamily: 'var(--font-playfair)', fontSize: 'clamp(26px, 3vw, 38px)' }}
      >
        {value}
      </p>
      <p className="text-foreground/30 text-[9px] tracking-[0.25em] uppercase">{label}</p>
    </div>
  );
}

// ── Vertical bars (monthly trend) ──
function VBars({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
          <span className="text-foreground/40 text-[10px] tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
            {d.value}
          </span>
          <div className="w-full bg-foreground/5 rounded-sm relative" style={{ height: '100%' }}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-moss/70 group-hover:bg-moss rounded-sm transition-all duration-500"
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-foreground/25 text-[9px] tracking-wide">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

// ── Horizontal labeled bars ──
function HBars({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-foreground/55 text-xs">{d.label}</span>
            <span className="text-foreground/35 text-[10px] tabular-nums">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-foreground/6 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? '#4a7c59' }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-foreground/25 text-xs">Sem dados.</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-foreground/10 rounded-sm p-6 bg-surface-raised/30">
      <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-6">{title}</p>
      {children}
    </div>
  );
}

export default function StatsDashboard({ quotes }: { quotes: Quote[] }) {
  const stats = useMemo(() => {
    const now = new Date();
    const total = quotes.length;

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    let guestsSum = 0;
    let guestsCount = 0;
    let quotedSum = 0;
    let pipelineSum = 0;
    let wonSum = 0;
    let thisMonth = 0;

    // Last 8 months buckets
    const months: { key: string; label: string; value: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: MONTHS_PT[d.getMonth()], value: 0 });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));

    for (const q of quotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      const catLabel = CATEGORIES.find((c) => c.id === q.category)?.label ?? 'Outro';
      byCategory[catLabel] = (byCategory[catLabel] ?? 0) + 1;
      const et = eventTypeLabel(q);
      byEventType[et] = (byEventType[et] ?? 0) + 1;

      if (q.guests > 0) { guestsSum += q.guests; guestsCount++; }
      if (q.quotedPrice) {
        quotedSum += q.quotedPrice;
        if (q.status === 'cotado') pipelineSum += q.quotedPrice;
        if (q.status === 'aceite') wonSum += q.quotedPrice;
      }

      const sd = new Date(q.submittedAt);
      if (sd.getFullYear() === now.getFullYear() && sd.getMonth() === now.getMonth()) thisMonth++;
      const idx = monthIndex.get(`${sd.getFullYear()}-${sd.getMonth()}`);
      if (idx !== undefined) months[idx].value++;
    }

    const accepted = byStatus['aceite'] ?? 0;
    const decided = accepted + (byStatus['rejeitado'] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;

    const toSorted = (rec: Record<string, number>) =>
      Object.entries(rec).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);

    return {
      total,
      thisMonth,
      conversion,
      avgGuests: guestsCount ? Math.round(guestsSum / guestsCount) : 0,
      quotedSum,
      pipelineSum,
      wonSum,
      months,
      statusBars: (Object.keys(STATUS_META) as QuoteStatus[])
        .map((s) => ({ label: STATUS_META[s].label, value: byStatus[s] ?? 0, color: STATUS_META[s].color }))
        .filter((d) => d.value > 0),
      categoryBars: toSorted(byCategory),
      eventTypeBars: toSorted(byEventType).slice(0, 6),
    };
  }, [quotes]);

  if (quotes.length === 0) {
    return (
      <div className="text-center py-24 text-foreground/25">
        <p className="text-sm">Ainda não há dados para mostrar.</p>
        <p className="text-xs mt-2">As estatísticas aparecem assim que chegarem pedidos.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Kpi value={String(stats.total)} label="Pedidos totais" accent />
        <Kpi value={String(stats.thisMonth)} label="Este mês" />
        <Kpi value={`${stats.conversion}%`} label="Taxa de conversão" />
        <Kpi value={`${stats.avgGuests}`} label="Média convidados" />
        <Kpi value={eur(stats.pipelineSum)} label="Em proposta (cotado)" />
        <Kpi value={eur(stats.wonSum)} label="Ganho (aceite)" accent />
      </div>

      {/* Trend */}
      <Panel title="Pedidos por mês (últimos 8)">
        <VBars data={stats.months.map((m) => ({ label: m.label, value: m.value }))} />
      </Panel>

      {/* Status + Category */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Por estado">
          <HBars data={stats.statusBars} />
        </Panel>
        <Panel title="Por categoria">
          <HBars data={stats.categoryBars} />
        </Panel>
      </div>

      {/* Event types */}
      <Panel title="Tipos de evento mais pedidos">
        <HBars data={stats.eventTypeBars} />
      </Panel>
    </div>
  );
}
