'use client';

import { useState, useMemo, useEffect } from 'react';
import Image from 'next/image';
import type { Quote, QuoteStatus } from '../types';
import { formatPrice } from '../pricing';
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from '../data';
import ProposalBuilder from './ProposalBuilder';
import ClientMessenger from './ClientMessenger';
import StatsDashboard from './StatsDashboard';
import Inbox from './Inbox';
import Overview from './Overview';
import Clientes from './Clientes';
import Calendario from './Calendario';
import Propostas from './Propostas';
import Tarefas from './Tarefas';
import Fornecedores from './Fornecedores';
import EventChecklist from './EventChecklist';
import EventTimeline from './EventTimeline';
import PaymentsPanel from './PaymentsPanel';
import { ToastProvider } from './Toast';
import CommandPalette, { type Command } from './CommandPalette';
import NewQuoteModal from './NewQuoteModal';
import Kanban from './Kanban';
import NotificationBell from './NotificationBell';

type View = 'overview' | 'pedidos' | 'kanban' | 'clientes' | 'calendario' | 'propostas' | 'tarefas' | 'fornecedores' | 'estatisticas' | 'inbox';

const STATUS_OPTIONS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: 'pendente', label: 'Pendente', color: 'bg-foreground/10 text-foreground/50' },
  { id: 'em_revisao', label: 'Em Revisão', color: 'bg-moss/15 text-moss' },
  { id: 'cotado', label: 'Cotado', color: 'bg-moss/25 text-moss' },
  { id: 'aceite', label: 'Aceite', color: 'bg-moss/35 text-moss' },
  { id: 'rejeitado', label: 'Rejeitado', color: 'bg-foreground/8 text-foreground/30' },
];

const NAV: { id: View; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Visão Geral', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>
  )},
  { id: 'pedidos', label: 'Pedidos', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12h6M9 16h4" strokeLinecap="round"/></svg>
  )},
  { id: 'kanban', label: 'Pipeline', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="4" height="16" rx="1"/><rect x="10" y="4" width="4" height="11" rx="1"/><rect x="17" y="4" width="4" height="7" rx="1"/></svg>
  )},
  { id: 'clientes', label: 'Clientes', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 2.7-5 6-5s6 2 6 5"/><path d="M16 5.5a3 3 0 0 1 0 5.5M21 20c0-2.5-1.8-4.3-4-4.8" strokeLinecap="round"/></svg>
  )},
  { id: 'calendario', label: 'Calendário', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round"/></svg>
  )},
  { id: 'propostas', label: 'Propostas', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )},
  { id: 'tarefas', label: 'Tarefas', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9" strokeLinecap="round"/></svg>
  )},
  { id: 'fornecedores', label: 'Fornecedores', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 9l1-5h16l1 5M4 9h16v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V9z" strokeLinejoin="round"/><path d="M9 13h6" strokeLinecap="round"/></svg>
  )},
  { id: 'estatisticas', label: 'Estatísticas', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 3v18h18" strokeLinecap="round"/><path d="M7 14l3-4 3 3 4-6" strokeLinecap="round" strokeLinejoin="round"/></svg>
  )},
  { id: 'inbox', label: 'Inbox', icon: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 7l9 6 9-6"/><rect x="3" y="5" width="18" height="14" rx="2"/></svg>
  )},
];

interface Props {
  initialQuotes: Quote[];
  userName?: string;
}

export default function AdminClient({ initialQuotes, userName = 'Catarina' }: Props) {
  const [quotes, setQuotes] = useState<Quote[]>(initialQuotes);
  const [selected, setSelected] = useState<Quote | null>(null);
  const [filterStatus, setFilterStatus] = useState<QuoteStatus | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'old' | 'value'>('recent');
  const [saving, setSaving] = useState(false);
  const [editPrice, setEditPrice] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editStatus, setEditStatus] = useState<QuoteStatus>('pendente');
  const [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<View>('overview');
  const [navOpen, setNavOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);

  // Full-screen tool surface: hide public nav, grain & chrome.
  useEffect(() => {
    document.body.classList.add('admin-mode');
    return () => document.body.classList.remove('admin-mode');
  }, []);

  // ⌘K / Ctrl+K opens the command palette.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const paletteCommands: Command[] = useMemo(
    () => [
      {
        id: 'action-new-quote',
        label: 'Novo pedido (registo manual)',
        group: 'Ações',
        run: () => setNewQuoteOpen(true),
      },
      ...NAV.map((item) => ({
        id: `nav-${item.id}`,
        label: item.label,
        group: 'Navegar',
        run: () => setView(item.id),
      })),
    ],
    []
  );

  function openQuote(q: Quote) {
    setView('pedidos');
    setSelected(q);
    setEditPrice(q.quotedPrice ? String(q.quotedPrice) : '');
    setEditNotes(q.adminNotes ?? '');
    setEditStatus(q.status);
  }

  async function refresh() {
    setRefreshing(true);
    try {
      const res = await fetch('/api/orcamento', { headers: { 'x-admin-refresh': '1' } });
      const data = await res.json();
      if (Array.isArray(data)) setQuotes(data);
    } finally {
      setRefreshing(false);
    }
  }

  async function logout() {
    await fetch('/api/admin/logout', { method: 'POST' });
    window.location.href = '/orcamento/admin';
  }

  async function saveChanges() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/orcamento/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = filterStatus === 'all' ? quotes : quotes.filter((x) => x.status === filterStatus);
    if (q) {
      list = list.filter((x) =>
        [x.name, x.email, x.phone, x.company, x.location, x.id]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q))
      );
    }
    const sorted = [...list];
    if (sort === 'recent') sorted.sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));
    else if (sort === 'old') sorted.sort((a, b) => +new Date(a.submittedAt) - +new Date(b.submittedAt));
    else sorted.sort((a, b) => (b.quotedPrice ?? b.priceBreakdown?.total ?? 0) - (a.quotedPrice ?? a.priceBreakdown?.total ?? 0));
    return sorted;
  }, [quotes, filterStatus, search, sort]);

  const pendingCount = quotes.filter((q) => q.status === 'pendente' || q.status === 'em_revisao').length;

  function statusBadge(status: QuoteStatus) {
    const s = STATUS_OPTIONS.find((o) => o.id === status);
    return (
      <span className={`text-[9px] tracking-[0.15em] uppercase px-2 py-0.5 rounded-sm ${s?.color ?? 'bg-foreground/8 text-foreground/30'}`}>
        {s?.label ?? status}
      </span>
    );
  }

  const VIEW_TITLES: Record<View, string> = {
    overview: 'Visão Geral',
    pedidos: 'Pedidos',
    kanban: 'Pipeline',
    clientes: 'Clientes',
    calendario: 'Calendário',
    propostas: 'Propostas',
    tarefas: 'Tarefas',
    fornecedores: 'Fornecedores',
    estatisticas: 'Estatísticas',
    inbox: 'Inbox',
  };

  const VIEW_SUB: Record<View, string> = {
    overview: 'O resumo do seu dia',
    pedidos: 'Pedidos de orçamento recebidos',
    kanban: 'Arraste entre estados',
    clientes: 'Histórico por cliente',
    calendario: 'Os seus eventos no tempo',
    propostas: 'Todas as propostas enviadas',
    tarefas: 'Organização interna da equipa',
    fornecedores: 'Parceiros e contactos',
    estatisticas: 'Métricas e desempenho',
    inbox: 'Mensagens recebidas',
  };

  return (
    <ToastProvider>
    <div className="min-h-screen bg-surface flex">
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        navCommands={paletteCommands}
        quotes={quotes}
        onOpenQuote={openQuote}
      />
      <NewQuoteModal
        open={newQuoteOpen}
        onClose={() => setNewQuoteOpen(false)}
        onCreated={(q) => { setQuotes((prev) => [q, ...prev]); openQuote(q); }}
      />
      {/* ── Sidebar ── */}
      <aside
        className={`fixed lg:sticky top-0 z-40 h-screen w-60 shrink-0 bg-surface-raised/60 border-r border-foreground/8 flex flex-col transition-transform duration-300 ${
          navOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand */}
        <div className="px-6 py-6 border-b border-foreground/8">
          <Image src="/logo-liquen-branco.png" alt="Líquen Events" width={116} height={40} className="object-contain opacity-80" />
          <p className="text-foreground/22 text-[9px] tracking-[0.4em] uppercase mt-3">Back Office</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-6 flex flex-col gap-0.5 overflow-y-auto">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => { setView(item.id); setNavOpen(false); }}
              className={`group relative flex items-center gap-3 pl-4 pr-3 py-2.5 rounded-md text-[11px] tracking-[0.18em] uppercase transition-all duration-200 ${
                view === item.id
                  ? 'bg-moss/12 text-moss'
                  : 'text-foreground/40 hover:text-foreground/75 hover:bg-foreground/[0.04]'
              }`}
            >
              <span
                className={`absolute left-0 top-1/2 -translate-y-1/2 w-0.5 rounded-full bg-moss transition-all duration-300 ${
                  view === item.id ? 'h-5 opacity-100' : 'h-0 opacity-0'
                }`}
              />
              <span className={view === item.id ? 'text-moss' : 'text-foreground/30 group-hover:text-foreground/60 transition-colors'}>
                {item.icon}
              </span>
              {item.label}
              {item.id === 'pedidos' && pendingCount > 0 && (
                <span className="ml-auto text-[9px] bg-moss text-cream rounded-full px-1.5 py-0.5 tabular-nums">{pendingCount}</span>
              )}
            </button>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-4 border-t border-foreground/8">
          <div className="flex items-center gap-3 px-3 py-2">
            <div className="w-8 h-8 rounded-full bg-moss/20 text-moss flex items-center justify-center text-xs font-bold shrink-0">
              {userName.slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-foreground/65 text-xs font-medium truncate">{userName}</p>
              <p className="text-foreground/25 text-[10px] truncate">Administração</p>
            </div>
          </div>
          <a
            href="/api/backup"
            className="w-full mt-1 flex items-center gap-2 px-3 py-2 text-foreground/30 text-[10px] tracking-[0.2em] uppercase rounded-md hover:text-foreground/60 hover:bg-foreground/4 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" /></svg>
            Backup
          </a>
          <button
            onClick={logout}
            className="w-full mt-0.5 text-left px-3 py-2 text-foreground/30 text-[10px] tracking-[0.2em] uppercase rounded-md hover:text-foreground/60 hover:bg-foreground/4 transition-colors"
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Backdrop (mobile) */}
      {navOpen && <div className="fixed inset-0 z-30 bg-black/50 lg:hidden" onClick={() => setNavOpen(false)} />}

      {/* ── Main ── */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-20 bg-surface/85 backdrop-blur-xl border-b border-foreground/8 px-6 lg:px-12 py-6 flex items-center gap-4">
          <button className="lg:hidden text-foreground/50 -ml-1" onClick={() => setNavOpen(true)} aria-label="Menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 6h16M4 12h16M4 18h16" strokeLinecap="round"/></svg>
          </button>
          <div className="min-w-0">
            <p className="eyebrow mb-1.5">{VIEW_SUB[view]}</p>
            <h1
              className="text-foreground/90 font-bold leading-none"
              style={{ fontFamily: 'var(--font-playfair)', fontSize: 'clamp(22px, 3vw, 32px)' }}
            >
              {VIEW_TITLES[view]}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-3 shrink-0">
            <NotificationBell />
            <button
              onClick={() => setNewQuoteOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-moss text-cream text-[10px] tracking-[0.18em] uppercase rounded-md hover:bg-moss-dark transition-colors"
              title="Criar pedido manualmente"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
              Novo
            </button>
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden sm:flex items-center gap-2 px-3 py-2 border border-foreground/12 text-foreground/35 text-[10px] tracking-[0.15em] uppercase rounded-md hover:border-foreground/25 hover:text-foreground/55 transition-colors"
              title="Pesquisar (Ctrl K)"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" strokeLinecap="round" /></svg>
              Pesquisar
              <kbd className="text-[8px] border border-foreground/15 rounded px-1 py-0.5 ml-1">⌘K</kbd>
            </button>
            <button
              onClick={refresh}
              disabled={refreshing}
              className="group flex items-center gap-2 px-4 py-2 border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.22em] uppercase rounded-md hover:border-moss/40 hover:text-moss transition-colors"
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={refreshing ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}>
                <path d="M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {refreshing ? 'A actualizar' : 'Actualizar'}
            </button>
          </div>
        </header>

        {/* ── Overview ── */}
        {view === 'overview' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Overview quotes={quotes} userName={userName} onOpen={openQuote} onGoStats={() => setView('estatisticas')} />
          </div>
        )}

        {/* ── Pipeline (Kanban) ── */}
        {view === 'kanban' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Kanban
              quotes={quotes}
              onOpen={openQuote}
              onStatusChange={(id, status) => {
                setQuotes((prev) => prev.map((q) => (q.id === id ? { ...q, status } : q)));
                setSelected((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
              }}
            />
          </div>
        )}

        {/* ── Clientes ── */}
        {view === 'clientes' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Clientes quotes={quotes} onOpen={openQuote} />
          </div>
        )}

        {/* ── Calendário ── */}
        {view === 'calendario' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Calendario quotes={quotes} onOpen={openQuote} />
          </div>
        )}

        {/* ── Propostas ── */}
        {view === 'propostas' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Propostas />
          </div>
        )}

        {/* ── Tarefas ── */}
        {view === 'tarefas' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Tarefas defaultAssignee={userName} />
          </div>
        )}

        {/* ── Fornecedores ── */}
        {view === 'fornecedores' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Fornecedores />
          </div>
        )}

        {/* ── Estatísticas ── */}
        {view === 'estatisticas' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <StatsDashboard quotes={quotes} />
          </div>
        )}

        {/* ── Inbox ── */}
        {view === 'inbox' && (
          <div className="px-6 lg:px-12 py-10 lg:py-12 view-in">
            <Inbox />
          </div>
        )}

        {/* ── Pedidos ── */}
        <div className={`px-6 lg:px-12 py-10 lg:py-12 ${view === 'pedidos' ? 'view-in' : 'hidden'}`}>
          {/* Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-6">
            <div className="relative flex-1 max-w-md">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-foreground/25" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3" strokeLinecap="round"/></svg>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Procurar por nome, email, local, ID…"
                className="w-full bg-surface-raised/50 border border-foreground/12 rounded-md pl-9 pr-3 py-2 text-sm text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as typeof sort)}
              className="bg-surface-raised/50 border border-foreground/12 rounded-md px-3 py-2 text-xs text-foreground/55 focus:outline-none focus:border-moss/45"
            >
              <option value="recent">Mais recentes</option>
              <option value="old">Mais antigos</option>
              <option value="value">Maior valor</option>
            </select>
          </div>

          {/* Status filter */}
          <div className="flex flex-wrap gap-2 mb-8">
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3.5 py-1.5 rounded-sm text-[10px] tracking-[0.15em] uppercase border transition-colors ${
                filterStatus === 'all' ? 'bg-moss border-moss text-cream' : 'border-foreground/15 text-foreground/35 hover:border-foreground/30'
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
                    filterStatus === s.id ? 'bg-moss border-moss text-cream' : 'border-foreground/15 text-foreground/35 hover:border-foreground/30'
                  }`}
                >
                  {s.label} ({count})
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-[1fr_440px] gap-8">
            {/* List */}
            <div className="flex flex-col gap-3">
              {filtered.length === 0 && (
                <div className="text-center py-16 text-foreground/25">
                  <p className="text-sm">Nenhum pedido encontrado.</p>
                </div>
              )}
              {filtered.map((q) => {
                const cat = CATEGORIES.find((c) => c.id === q.category);
                const et = q.category && q.eventType ? EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType) : null;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => openQuote(q)}
                    className={`text-left p-5 rounded-md border transition-all duration-200 ${
                      selected?.id === q.id ? 'border-moss bg-moss/6' : 'border-foreground/10 hover:border-foreground/25 bg-surface-raised/40'
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
                          <span className="text-foreground/30 text-xs">≈ {formatPrice(q.priceBreakdown.rangeMin)}–{formatPrice(q.priceBreakdown.rangeMax)}</span>
                        ) : null}
                        <span className="text-foreground/20 text-[10px]">
                          {new Date(q.submittedAt).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' })}
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Detail — in-grid sticky panel on desktop, slide-over drawer on mobile */}
            {selected ? (
              <>
              <div className="fixed inset-0 z-40 bg-black/50 xl:hidden" onClick={() => setSelected(null)} />
              <div className="fixed xl:static inset-y-0 right-0 z-50 xl:z-auto w-full max-w-md xl:max-w-none xl:w-auto bg-surface-raised xl:bg-transparent border-l xl:border border-foreground/10 xl:rounded-md xl:sticky xl:top-24 max-h-screen xl:max-h-[calc(100vh-7rem)] overflow-y-auto shadow-2xl xl:shadow-none">
                <div className="px-5 py-4 border-b border-foreground/8 flex items-center justify-between sticky top-0 bg-surface-raised/80 backdrop-blur-sm">
                  <div>
                    <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">{selected.id}</p>
                    <p className="text-foreground/70 text-sm font-medium">{selected.name}</p>
                  </div>
                  <button onClick={() => setSelected(null)} className="text-foreground/30 text-lg hover:text-foreground/60 transition-colors">×</button>
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

                  {/* Event */}
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

                  {/* Client notes */}
                  {selected.notes && (
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-2">Notas do Cliente</p>
                      <p className="text-foreground/45 text-xs leading-relaxed bg-foreground/4 p-3 rounded-sm">{selected.notes}</p>
                    </div>
                  )}

                  {/* Estimate */}
                  {selected.priceBreakdown && (
                    <div>
                      <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-3">Estimativa Calculada</p>
                      <div className="bg-foreground/4 rounded-sm p-3 flex flex-col gap-1.5">
                        {selected.priceBreakdown.addonsCost > 0 && (
                          <div className="flex justify-between text-[10px]"><span className="text-foreground/35">Extras</span><span className="text-foreground/50">{formatPrice(selected.priceBreakdown.addonsCost)}</span></div>
                        )}
                        <div className="flex justify-between text-[10px] pt-1 border-t border-foreground/8"><span className="text-foreground/35">Subtotal</span><span className="text-foreground/50">{formatPrice(selected.priceBreakdown.subtotal)}</span></div>
                        <div className="flex justify-between text-[10px]"><span className="text-foreground/35">IVA 23%</span><span className="text-foreground/50">{formatPrice(selected.priceBreakdown.iva)}</span></div>
                        <div className="flex justify-between text-xs font-medium pt-1 border-t border-foreground/8"><span className="text-foreground/60">Total</span><span className="text-moss">{formatPrice(selected.priceBreakdown.total)}</span></div>
                      </div>
                    </div>
                  )}

                  {/* Admin actions */}
                  <div className="border-t border-foreground/10 pt-5">
                    <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-4">Gestão do Pedido</p>
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">Estado</label>
                        <select value={editStatus} onChange={(e) => setEditStatus(e.target.value as QuoteStatus)} className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50">
                          {STATUS_OPTIONS.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">Preço Final Cotado (€ s/IVA)</label>
                        <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} placeholder="Ex: 12500" className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50" />
                      </div>
                      <div>
                        <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">Notas Internas</label>
                        <textarea rows={3} value={editNotes} onChange={(e) => setEditNotes(e.target.value)} placeholder="Notas internas sobre este pedido…" className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50 resize-none" />
                      </div>
                      <button onClick={saveChanges} disabled={saving} className={`w-full py-3 rounded-sm text-[11px] tracking-[0.2em] uppercase transition-all ${saving ? 'bg-moss/40 text-cream/50 cursor-not-allowed' : 'bg-moss text-cream hover:bg-moss-dark'}`}>
                        {saving ? 'A guardar…' : 'Guardar Alterações →'}
                      </button>
                    </div>
                  </div>

                  {/* Production checklist */}
                  <EventChecklist
                    key={`cl-${selected.id}`}
                    quote={selected}
                    onChange={(checklist) => {
                      setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, checklist } : q)));
                      setSelected((prev) => (prev ? { ...prev, checklist } : prev));
                    }}
                  />

                  {/* Day-of run sheet */}
                  <EventTimeline
                    key={`tl-${selected.id}`}
                    quote={selected}
                    onChange={(timeline) => {
                      setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, timeline } : q)));
                      setSelected((prev) => (prev ? { ...prev, timeline } : prev));
                    }}
                  />

                  {/* Payments & invoicing */}
                  <PaymentsPanel
                    key={`pay-${selected.id}`}
                    quote={selected}
                    onChange={(payments) => {
                      setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, payments } : q)));
                      setSelected((prev) => (prev ? { ...prev, payments } : prev));
                    }}
                  />

                  <ProposalBuilder
                    quote={selected}
                    onSent={(total) => {
                      setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, status: 'cotado', quotedPrice: total } : q)));
                      setSelected((prev) => (prev ? { ...prev, status: 'cotado', quotedPrice: total } : prev));
                      setEditStatus('cotado');
                    }}
                  />

                  <ClientMessenger
                    key={selected.id}
                    quote={selected}
                    onSent={(messages) => {
                      setQuotes((prev) => prev.map((q) => (q.id === selected.id ? { ...q, messages } : q)));
                      setSelected((prev) => (prev ? { ...prev, messages } : prev));
                    }}
                  />

                  <div className="text-foreground/18 text-[10px] text-center">
                    Submetido em {new Date(selected.submittedAt).toLocaleString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              </>
            ) : (
              <div className="hidden xl:flex items-center justify-center border border-foreground/6 rounded-md text-foreground/18 text-sm">
                Seleccione um pedido para ver detalhes
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
    </ToastProvider>
  );
}
