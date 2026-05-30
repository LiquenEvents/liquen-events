'use client';

import { useState } from 'react';
import type { Quote, QuoteStatus } from '../types';
import { formatPrice } from '../pricing';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from '../data';
import ProposalBuilder from './ProposalBuilder';
import ClientMessenger from './ClientMessenger';
import StatsDashboard from './StatsDashboard';

const STATUS_OPTIONS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: 'pendente', label: 'Pendente', color: 'bg-foreground/10 text-foreground/50' },
  { id: 'em_revisao', label: 'Em Revisão', color: 'bg-moss/15 text-moss' },
  { id: 'cotado', label: 'Cotado', color: 'bg-moss/25 text-moss' },
  { id: 'aceite', label: 'Aceite', color: 'bg-moss/35 text-moss' },
  { id: 'rejeitado', label: 'Rejeitado', color: 'bg-foreground/8 text-foreground/30' },
];

interface Props {
  initialQuotes: Quote[];
  adminPass: string;
}

export default function AdminClient({ initialQuotes, adminPass }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | 'all'>('all');
  const [saving, setSaving] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<QuoteStatus>('pendente');
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<'pedidos' | 'estatisticas'>('pedidos');

  function openQuote(q: Quote) {
    setSelected(q);
    setEditPrice(q.quotedPrice ? String(q.quotedPrice) : '');
    setEditNotes(q.adminNotes ?? '');
    setEditStatus(q.status);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/orcamento', {
        headers: { 'x-admin-pass': adminPass },
      });
      const data = await res.json();
      setQuotes(data);
    } finally {
      setRefreshing(false);
    }
  }

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orcamento/${selected.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-pass': adminPass,
        },
        body: JSON.stringify({
          status: editStatus,
          quotedPrice: editPrice ? parseFloat(editPrice) : undefined,
          adminNotes: editNotes,
        }),
      });
      const updated = await res.json();
      setQuotes((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
      setSelected(updated);
    } finally {
      setSaving(false);
    }
  }

  const filtered = filterStatus === 'all' ? quotes : quotes.filter((q) => q.status === filterStatus);

  function statusBadge(status: QuoteStatus) {
    const s = STATUS_OPTIONS.find((o) => o.id === status);
    return (
      <span className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${s?.color ?? 'bg-foreground/8 text-foreground/30'}`}>
        {s?.label ?? status}
      </span>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="border-b border-foreground/8 px-6 lg:px-12 py-6">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div>
            <p className="text-foreground/22 text-[10px] tracking-[0.5em] uppercase mb-1">
              Líquen Events
            </p>
            <h1
              className="text-foreground font-bold"
              style={{ fontFamily: 'var(--font-playfair)', fontSize: 'clamp(20px, 2.5vw, 28px)' }}
            >
              Painel de Orçamentos
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {/* View tabs */}
            <div className="flex gap-1 mr-2 border border-foreground/12 rounded-sm p-0.5">
              {([
                ['pedidos', 'Pedidos'],
                ['estatisticas', 'Estatísticas'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.2em] uppercase transition-colors ${
                    view === id ? 'bg-moss text-cream' : 'text-foreground/40 hover:text-foreground/65'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            <span className="text-foreground/30 text-xs hidden sm:inline">{quotes.length} pedido{quotes.length !== 1 ? 's' : ''}</span>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="px-4 py-2 border border-foreground/15 text-foreground/40 text-[10px] tracking-[0.2em] uppercase rounded-sm hover:border-foreground/30 hover:text-foreground/60 transition-colors"
            >
              {refreshing ? 'A actualizar…' : 'Actualizar'}
            </button>
          </div>
        </div>
      </div>

      {view === 'estatisticas' && (
        <div className="max-w-7xl mx-auto px-6 lg:px-12 py-8">
          <StatsDashboard quotes={quotes} />
        </div>
      )}

      <div className={`max-w-7xl mx-auto px-6 lg:px-12 py-8 ${view === 'pedidos' ? '' : 'hidden'}`}>
        {/* Status filter */}
        <div className="flex flex-wrap gap-2 mb-8">
          <button
            onClick={() => setFilterStatus('all')}
            className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${
              filterStatus === 'all'
                ? 'bg-moss border-moss text-cream'
                : 'border-foreground/15 text-foreground/35 hover:border-foreground/30'
            }`}
          >
            Todos ({quotes.length})
          </button>
          {STATUS_OPTIONS.map((s) => {
            const count = quotes.filter((q) => q.status === s.id).length;
            return (
              <button
                key={s.id}
                onClick={() => setFilterStatus(s.id)}
                className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${
                  filterStatus === s.id
                    ? 'bg-moss border-moss text-cream'
                    : 'border-foreground/15 text-foreground/35 hover:border-foreground/30'
                }`}
              >
                {s.label} ({count})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-8">
          {/* Quote list */}
          <div className="flex flex-col gap-3">
            {filtered.length === 0 && (
              <div className="text-center py-16 text-foreground/25">
                <p className="text-sm">Nenhum pedido encontrado.</p>
              </div>
            )}
            {filtered.map((q) => {
              const cat = CATEGORIES.find((c) => c.id === q.category);
              const et = q.category && q.eventType
                ? EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType)
                : null;

              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => openQuote(q)}
                  className={`text-left p-5 rounded-sm border transition-all duration-200 ${
                    selected?.id === q.id
                      ? 'border-moss bg-moss/6'
                      : 'border-foreground/10 hover:border-foreground/25 bg-surface-raised/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-foreground/70 text-sm font-medium">{q.name}</p>
                      <p className="text-foreground/28 text-xs">{q.email}</p>
                    </div>
                    {statusBadge(q.status)}
                  </div>
                  <div className="flex items-center gap-4 text-foreground/30 text-[10px]">
                    <span>{cat?.label ?? '—'}</span>
                    {et && <><span className="w-px h-3 bg-foreground/12" /><span>{et.label}</span></>}
                    <span className="w-px h-3 bg-foreground/12" />
                    <span>{q.guests} pax</span>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-foreground/8">
                    <span className="text-foreground/22 text-[10px] font-mono">{q.id}</span>
                    <div className="flex items-center gap-3">
                      {q.quotedPrice ? (
                        <span className="text-moss text-xs font-medium">{formatPrice(q.quotedPrice)}</span>
                      ) : q.priceBreakdown?.total ? (
                        <span className="text-foreground/30 text-xs">
                          ≈ {formatPrice(q.priceBreakdown.rangeMin)}–{formatPrice(q.priceBreakdown.rangeMax)}
                        </span>
                      ) : null}
                      <span className="text-foreground/20 text-[10px]">
                        {new Date(q.submittedAt).toLocaleDateString('pt-PT', {
                          day: 'numeric',
                          month: 'short',
                        })}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detail panel */}
          {selected ? (
            <div className="border border-foreground/10 rounded-sm sticky top-8 max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-5 py-4 border-b border-foreground/8 flex items-center justify-between">
                <div>
                  <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                    {selected.id}
                  </p>
                  <p className="text-foreground/70 text-sm font-medium">{selected.name}</p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="text-foreground/30 text-lg hover:text-foreground/60 transition-colors"
                >
                  ×
                </button>
              </div>

              <div className="p-5 flex flex-col gap-6">
                {/* Contact */}
                <div>
                  <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-3">Contacto</p>
                  <div className="flex flex-col gap-1.5">
                    <a href={`mailto:${selected.email}`} className="text-moss text-xs hover:underline">{selected.email}</a>
                    <a href={`tel:${selected.phone}`} className="text-foreground/50 text-xs hover:text-foreground/70">{selected.phone}</a>
                    {selected.company && <p className="text-foreground/35 text-xs">{selected.company}</p>}
                    {selected.nif && <p className="text-foreground/25 text-xs">NIF: {selected.nif}</p>}
                  </div>
                </div>

                {/* Event details */}
                <div>
                  <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-3">Evento</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { l: 'Tipo', v: CATEGORIES.find((c) => c.id === selected.category)?.label },
                      { l: 'Sub-tipo', v: selected.category && selected.eventType ? EVENT_TYPES_BY_CATEGORY[selected.category]?.find((e) => e.id === selected.eventType)?.label : null },
                      { l: 'Pacote', v: PACKAGES.find((p) => p.id === selected.packageTier)?.label },
                      { l: 'Convidados', v: selected.guests },
                      { l: 'Data', v: selected.date ? new Date(selected.date + 'T12:00:00').toLocaleDateString('pt-PT') : '—' },
                      { l: 'Local', v: selected.location || '—' },
                      { l: 'Duração', v: `${selected.duration}h` },
                      { l: 'Extras', v: `${selected.addons?.length ?? 0} serviços` },
                    ].map(({ l, v }) => (
                      <div key={l}>
                        <p className="text-foreground/20 text-[9px] tracking-wide uppercase mb-0.5">{l}</p>
                        <p className="text-foreground/55 text-xs">{v ?? '—'}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Notes from client */}
                {selected.notes && (
                  <div>
                    <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-2">Notas do Cliente</p>
                    <p className="text-foreground/45 text-xs leading-relaxed bg-foreground/4 p-3 rounded-sm">
                      {selected.notes}
                    </p>
                  </div>
                )}

                {/* Price breakdown */}
                <div>
                  <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-3">Estimativa Calculada</p>
                  {selected.priceBreakdown && (
                    <div className="bg-foreground/4 rounded-sm p-3 flex flex-col gap-1.5">
                      {selected.priceBreakdown.locationSurcharge > 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-foreground/35">Deslocação</span>
                          <span className="text-foreground/50">{formatPrice(selected.priceBreakdown.locationSurcharge)}</span>
                        </div>
                      )}
                      {selected.priceBreakdown.weekendSurcharge > 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-foreground/35">Weekend +15%</span>
                          <span className="text-foreground/50">{formatPrice(selected.priceBreakdown.weekendSurcharge)}</span>
                        </div>
                      )}
                      {selected.priceBreakdown.addonsCost > 0 && (
                        <div className="flex justify-between text-[10px]">
                          <span className="text-foreground/35">Extras</span>
                          <span className="text-foreground/50">{formatPrice(selected.priceBreakdown.addonsCost)}</span>
                        </div>
                      )}
                      <div className="flex justify-between text-[10px] pt-1 border-t border-foreground/8">
                        <span className="text-foreground/35">Subtotal</span>
                        <span className="text-foreground/50">{formatPrice(selected.priceBreakdown.subtotal)}</span>
                      </div>
                      <div className="flex justify-between text-[10px]">
                        <span className="text-foreground/35">IVA 23%</span>
                        <span className="text-foreground/50">{formatPrice(selected.priceBreakdown.iva)}</span>
                      </div>
                      <div className="flex justify-between text-xs font-medium pt-1 border-t border-foreground/8">
                        <span className="text-foreground/60">Total</span>
                        <span className="text-moss">{formatPrice(selected.priceBreakdown.total)}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Admin actions */}
                <div className="border-t border-foreground/10 pt-5">
                  <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-4">Acções Admin</p>

                  <div className="flex flex-col gap-4">
                    {/* Status */}
                    <div>
                      <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
                        Estado
                      </label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as QuoteStatus)}
                        className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id}>{s.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Quoted price */}
                    <div>
                      <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
                        Preço Final Cotado (€ s/IVA)
                      </label>
                      <input
                        type="number"
                        value={editPrice}
                        onChange={(e) => setEditPrice(e.target.value)}
                        placeholder="Ex: 12500"
                        className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50"
                      />
                    </div>

                    {/* Admin notes */}
                    <div>
                      <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
                        Notas Internas
                      </label>
                      <textarea
                        rows={3}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        placeholder="Notas internas sobre este pedido…"
                        className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50 resize-none"
                      />
                    </div>

                    <button
                      onClick={saveChanges}
                      disabled={saving}
                      className={`w-full py-3 rounded-sm text-[11px] tracking-[0.2em] uppercase transition-all ${
                        saving
                          ? 'bg-moss/40 text-cream/50 cursor-not-allowed'
                          : 'bg-moss text-cream hover:bg-moss-dark'
                      }`}
                    >
                      {saving ? 'A guardar…' : 'Guardar Alterações →'}
                    </button>
                  </div>
                </div>

                {/* Proposal builder → PDF → email */}
                <ProposalBuilder
                  quote={selected}
                  adminPass={adminPass}
                  onSent={(total) => {
                    setQuotes((prev) =>
                      prev.map((q) =>
                        q.id === selected.id ? { ...q, status: 'cotado', quotedPrice: total } : q
                      )
                    );
                    setSelected((prev) =>
                      prev ? { ...prev, status: 'cotado', quotedPrice: total } : prev
                    );
                    setEditStatus('cotado');
                  }}
                />

                {/* Reply to client by email (logged) */}
                <ClientMessenger
                  key={selected.id}
                  quote={selected}
                  adminPass={adminPass}
                  onSent={(messages) => {
                    setQuotes((prev) =>
                      prev.map((q) => (q.id === selected.id ? { ...q, messages } : q))
                    );
                    setSelected((prev) => (prev ? { ...prev, messages } : prev));
                  }}
                />

                <div className="text-foreground/18 text-[10px] text-center">
                  Submetido em{' '}
                  {new Date(selected.submittedAt).toLocaleString('pt-PT', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </div>
              </div>
            </div>
          ) : (
            <div className="hidden lg:flex items-center justify-center border border-foreground/6 rounded-sm text-foreground/18 text-sm">
              Seleccione um pedido para ver detalhes
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
