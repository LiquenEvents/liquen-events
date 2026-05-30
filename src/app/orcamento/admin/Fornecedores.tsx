'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Supplier } from '../types';

const CATEGORIES = ['Catering', 'Floristas', 'Música/DJ', 'Fotografia', 'Vídeo', 'Decoração', 'Espaços', 'Audiovisual', 'Transporte', 'Outro'];

export default function Fornecedores() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [cat, setCat] = useState('Todos');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', category: 'Catering', phone: '', email: '', location: '', notes: '' });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/fornecedores', { cache: 'no-store' });
        if (res.ok) setSuppliers(await res.json());
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function add() {
    if (!form.name.trim()) return;
    const res = await fetch('/api/fornecedores', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    if (res.ok) {
      const created = await res.json();
      setSuppliers((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setForm({ name: '', category: 'Catering', phone: '', email: '', location: '', notes: '' });
      setAdding(false);
    }
  }
  async function remove(id: string) {
    setSuppliers((prev) => prev.filter((s) => s.id !== id));
    await fetch(`/api/fornecedores/${id}`, { method: 'DELETE' });
  }

  const cats = useMemo(() => ['Todos', ...Array.from(new Set(suppliers.map((s) => s.category)))], [suppliers]);
  const filtered = suppliers.filter((s) => {
    if (cat !== 'Todos' && s.category !== cat) return false;
    const q = search.trim().toLowerCase();
    if (q && ![s.name, s.email, s.phone, s.location, s.notes].filter(Boolean).some((v) => v!.toLowerCase().includes(q))) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></svg>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Procurar fornecedor…" className="w-full bg-surface-raised/50 border border-foreground/12 rounded-md pl-9 pr-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
        </div>
        <button onClick={() => setAdding(!adding)} className="px-4 py-2 rounded-md bg-moss text-cream text-[11px] tracking-[0.2em] uppercase hover:bg-moss-dark transition-colors shrink-0">
          {adding ? 'Cancelar' : '+ Fornecedor'}
        </button>
      </div>

      {adding && (
        <div className="border border-foreground/10 rounded-md bg-surface-raised/30 p-4 mb-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Nome *" className="bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/60 focus:outline-none focus:border-moss/45">
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Telefone" className="bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="E-mail" className="bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
          <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Localização" className="bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
          <input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notas" className="bg-surface border border-foreground/15 rounded-md px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45" />
          <button onClick={add} disabled={!form.name.trim()} className="sm:col-span-2 py-2.5 rounded-md bg-moss text-cream text-[11px] tracking-[0.2em] uppercase hover:bg-moss-dark transition-colors disabled:opacity-40">Guardar Fornecedor</button>
        </div>
      )}

      {/* Category chips */}
      <div className="flex flex-wrap gap-2 mb-5">
        {cats.map((c) => (
          <button key={c} onClick={() => setCat(c)} className={`px-3 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${cat === c ? 'bg-moss border-moss text-cream' : 'border-foreground/15 text-foreground/35 hover:border-foreground/30'}`}>{c}</button>
        ))}
      </div>

      {loading ? (
        <p className="text-foreground/25 text-sm py-12 text-center">A carregar…</p>
      ) : filtered.length === 0 ? (
        <p className="text-foreground/25 text-sm py-16 text-center">Nenhum fornecedor {suppliers.length === 0 ? 'registado ainda' : 'encontrado'}.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="group border border-foreground/10 rounded-md bg-surface-raised/30 p-4 hover:border-foreground/20 transition-colors">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="min-w-0">
                  <p className="text-foreground/75 text-sm font-medium truncate">{s.name}</p>
                  <p className="text-moss/70 text-[10px] tracking-[0.15em] uppercase mt-0.5">{s.category}</p>
                </div>
                <button onClick={() => remove(s.id)} className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 transition-all shrink-0" aria-label="Remover">×</button>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                {s.phone && <a href={`tel:${s.phone}`} className="text-foreground/45 hover:text-moss transition-colors">{s.phone}</a>}
                {s.email && <a href={`mailto:${s.email}`} className="text-foreground/45 hover:text-moss transition-colors truncate">{s.email}</a>}
                {s.location && <span className="text-foreground/30">{s.location}</span>}
                {s.notes && <span className="text-foreground/35 leading-relaxed mt-1">{s.notes}</span>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
