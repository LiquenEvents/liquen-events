'use client';

import { useState } from 'react';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from '../data';
import type { Quote, EventCategory } from '../types';
import { useToast } from './Toast';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (q: Quote) => void;
}

const EMPTY = {
  name: '', email: '', phone: '', company: '',
  category: '' as EventCategory | '', eventType: '',
  date: '', guests: '', location: '', notes: '',
  referralSource: 'Contacto direto',
};

export default function NewQuoteModal({ open, onClose, onCreated }: Props) {
  const { toast } = useToast();
  const [f, setF] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  if (!open) return null;

  const set = (k: keyof typeof EMPTY, v: string) => setF((p) => ({ ...p, [k]: v }));
  const eventTypes = f.category ? EVENT_TYPES_BY_CATEGORY[f.category as EventCategory] ?? [] : [];

  async function submit() {
    if (!f.name.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch('/api/orcamento/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...f, category: f.category || null, eventType: f.eventType || null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      toast('Pedido criado', 'success');
      onCreated(data.quote);
      setF({ ...EMPTY });
      onClose();
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Erro ao criar', 'error');
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/75 placeholder-foreground/22 focus:outline-none focus:border-moss/45";
  const label = "block text-[10px] text-foreground/30 tracking-[0.3em] uppercase mb-2";

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center pt-[8vh] px-4 overflow-y-auto" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-xl bg-surface-elevated/97 backdrop-blur-xl border border-foreground/12 rounded-xl shadow-2xl shadow-black/60 mb-12"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-foreground/8">
          <div>
            <p className="eyebrow mb-1">Registo manual</p>
            <h2 className="text-foreground/85 font-bold text-lg" style={{ fontFamily: 'var(--font-playfair)' }}>Novo pedido</h2>
          </div>
          <button onClick={onClose} className="text-foreground/30 hover:text-foreground/60 text-xl leading-none">×</button>
        </div>

        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={label}>Nome *</label>
            <input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome do cliente" className={input} autoFocus />
          </div>
          <div>
            <label className={label}>E-mail</label>
            <input value={f.email} onChange={(e) => set('email', e.target.value)} placeholder="email@exemplo.com" className={input} />
          </div>
          <div>
            <label className={label}>Telefone</label>
            <input value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+351 …" className={input} />
          </div>
          <div>
            <label className={label}>Empresa</label>
            <input value={f.company} onChange={(e) => set('company', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Como nos conheceu</label>
            <input value={f.referralSource} onChange={(e) => set('referralSource', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Categoria</label>
            <select value={f.category} onChange={(e) => { set('category', e.target.value); set('eventType', ''); }} className={input}>
              <option value="">—</option>
              {CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Tipo de evento</label>
            <select value={f.eventType} onChange={(e) => set('eventType', e.target.value)} className={input} disabled={!eventTypes.length}>
              <option value="">—</option>
              {eventTypes.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
            </select>
          </div>
          <div>
            <label className={label}>Data do evento</label>
            <input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className={input} />
          </div>
          <div>
            <label className={label}>Nº convidados</label>
            <input type="number" value={f.guests} onChange={(e) => set('guests', e.target.value)} className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Local</label>
            <input value={f.location} onChange={(e) => set('location', e.target.value)} placeholder="Espaço / cidade" className={input} />
          </div>
          <div className="sm:col-span-2">
            <label className={label}>Notas</label>
            <textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Detalhes da conversa, pedidos especiais…" className={`${input} resize-none`} />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-foreground/8">
          <button onClick={onClose} className="px-5 py-2.5 text-foreground/45 text-[11px] tracking-[0.2em] uppercase hover:text-foreground/70 transition-colors">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !f.name.trim()}
            className={`px-6 py-2.5 rounded-md text-[11px] tracking-[0.2em] uppercase transition-colors ${
              saving || !f.name.trim() ? 'bg-moss/40 text-cream/50 cursor-not-allowed' : 'bg-moss text-cream hover:bg-moss-dark'
            }`}
          >
            {saving ? 'A criar…' : 'Criar pedido →'}
          </button>
        </div>
      </div>
    </div>
  );
}
